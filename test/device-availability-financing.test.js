'use strict';

// Acceptance tests: extend the device data model with `availability` and
// `financing_eligible`.
//
// Contract (from the task + LLD):
//  - A NEW schema migration adds two columns to the existing `devices` table:
//      * availability       TEXT    NOT NULL, constrained to
//                           IN_STOCK / OUT_OF_STOCK / PREORDER, with a default.
//      * financing_eligible INTEGER NOT NULL DEFAULT 0, constrained to 0/1.
//  - The migration extends the established, gap-free version sequence and is
//    recorded in `schema_migrations`, so it applies idempotently and applies
//    cleanly to an existing (already-populated) database.
//  - `createDevice` accepts and validates `availability` and `financingEligible`,
//    persists them, and returns them.
//  - `getDevices` (and the device SELECT) returns the two new fields.
//  - Existing device behaviour (name/price, defaults when omitted) still holds.
//
// These tests are written BEFORE implementation and must fail until the schema,
// migration and createDevice/getDevices changes exist.
//
// NOTE on naming: the codebase uses camelCase inputs mapping to snake_case
// columns (see createOrder's `deviceId` -> `device_id`), so device creation
// accepts `financingEligible` (column `financing_eligible`). `availability` is a
// single word, so its input/column/return key are all `availability`. Reads of
// the financing value below accept either key form to stay robust to the shape
// getDevices / createDevice return.

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const model = require('../src/index.js');
const { MIGRATIONS, runMigrations } = require('../src/migrations.js');

// The availability vocabulary mandated by the task/LLD.
const AVAILABILITY_VALUES = ['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER'];

// The highest migration version that predates this feature. The repository
// ships migrations 1..6 (catalog, attachments, markets, carts, orders, cart
// optional selections); the device-model migration is the next one.
const PRE_FEATURE_MAX_VERSION = 6;

// ---------------------------------------------------------------------------
// Schema-introspection helpers (mirroring migrations.test.js).
// ---------------------------------------------------------------------------

function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
}

function tableSql(db, table) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return row ? row.sql : '';
}

// Extract the single-quoted string literals a `CHECK (<column> IN (...))`
// clause constrains `column` to.
function checkAllowedValues(sql, column) {
  const clause = new RegExp(`${column}[^)]*IN\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (!clause) return [];
  const literals = clause[1].match(/'([^']*)'/g) || [];
  return literals.map((s) => s.slice(1, -1));
}

// Read the financing-eligibility value from a row/return object regardless of
// whether it is keyed `financing_eligible` (raw column) or `financingEligible`
// (camelCase), coercing booleans to 0/1.
function financingOf(obj) {
  const raw = obj.financing_eligible !== undefined ? obj.financing_eligible : obj.financingEligible;
  return Number(raw);
}

// Build a database with only the migrations up to `maxVersion` applied, so a
// later runMigrations() exercises the forward migration against an existing DB.
function dbWithMigrationsUpTo(maxVersion) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const ordered = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  for (const m of ordered) {
    if (m.version > maxVersion) continue;
    m.up(db);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
      m.version,
      m.name,
    );
  }
  return db;
}

// ---------------------------------------------------------------------------
// A new migration extends the version sequence.
// ---------------------------------------------------------------------------

test('a new device-model migration extends the gap-free version sequence', () => {
  const versions = MIGRATIONS.map((m) => m.version);

  // The sequence must remain gap-free and monotonically increasing from 1.
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be gap-free starting at 1');

  // A migration beyond the pre-feature set (1..6) must have been added.
  assert.ok(
    Math.max(...versions) > PRE_FEATURE_MAX_VERSION,
    `expected a new migration beyond version ${PRE_FEATURE_MAX_VERSION}`,
  );

  const migration = MIGRATIONS.find((m) => m.version > PRE_FEATURE_MAX_VERSION);
  assert.ok(migration, 'expected to find the new device-model migration');
  assert.equal(typeof migration.name, 'string', 'the new migration should have a name');
  assert.ok(migration.name.length > 0, 'the new migration name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'the new migration should expose an up(db)');
});

test('the new migration is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const versions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'recorded versions should be gap-free starting at 1');
  assert.ok(
    Math.max(...versions) > PRE_FEATURE_MAX_VERSION,
    'the new device-model migration should be recorded',
  );
});

// ---------------------------------------------------------------------------
// Schema: the two new columns on `devices`.
// ---------------------------------------------------------------------------

test('devices has an availability column (TEXT, NOT NULL)', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'devices');

  assert.ok(cols.availability, 'devices should have an "availability" column');
  assert.equal(
    cols.availability.type.toUpperCase(),
    'TEXT',
    'availability should be a TEXT column',
  );
  assert.equal(cols.availability.notnull, 1, 'availability should be NOT NULL');
});

test('devices.availability is constrained to IN_STOCK/OUT_OF_STOCK/PREORDER', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'devices');

  const allowed = checkAllowedValues(sql, 'availability');
  assert.deepEqual(
    [...allowed].sort(),
    [...AVAILABILITY_VALUES].sort(),
    'availability CHECK should enumerate IN_STOCK/OUT_OF_STOCK/PREORDER',
  );
});

test('devices.availability has a default (a valid enum value) applied on raw insert', () => {
  const db = model.createDatabase(':memory:');

  // Inserting with only name/price must succeed because availability carries a
  // NOT NULL default.
  db.prepare('INSERT INTO devices (name, price) VALUES (?, ?)').run('Defaulted', 100);
  const row = db.prepare('SELECT * FROM devices WHERE name = ?').get('Defaulted');

  assert.ok(
    AVAILABILITY_VALUES.includes(row.availability),
    `availability default should be one of ${AVAILABILITY_VALUES.join('/')}, got "${row.availability}"`,
  );
});

test('devices.availability rejects values outside the enumeration', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO devices (name, price, availability) VALUES (?, ?, ?)')
        .run('Bad Availability', 100, 'SOMEDAY_MAYBE'),
    /CHECK|constraint/i,
    'an unknown availability value should violate the CHECK constraint',
  );
});

test('devices has a financing_eligible column (INTEGER, NOT NULL, default 0)', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'devices');

  assert.ok(cols.financing_eligible, 'devices should have a "financing_eligible" column');
  assert.equal(
    cols.financing_eligible.type.toUpperCase(),
    'INTEGER',
    'financing_eligible should be an INTEGER column',
  );
  assert.equal(cols.financing_eligible.notnull, 1, 'financing_eligible should be NOT NULL');

  // Default applied on raw insert that omits the column.
  db.prepare('INSERT INTO devices (name, price) VALUES (?, ?)').run('No Finance', 100);
  const row = db.prepare('SELECT * FROM devices WHERE name = ?').get('No Finance');
  assert.equal(row.financing_eligible, 0, 'financing_eligible should default to 0');
});

test('devices.financing_eligible is constrained to 0/1', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO devices (name, price, financing_eligible) VALUES (?, ?, ?)')
        .run('Bad Finance', 100, 2),
    /CHECK|constraint/i,
    'a financing_eligible value outside 0/1 should violate the CHECK constraint',
  );
});

// ---------------------------------------------------------------------------
// Forward migration against an existing, populated database.
// ---------------------------------------------------------------------------

test('the new migration applies cleanly to an existing populated devices table', () => {
  // A database that predates the device-model migration, already holding a
  // device row created under the old (name/price only) schema.
  const db = dbWithMigrationsUpTo(PRE_FEATURE_MAX_VERSION);
  db.prepare('INSERT INTO devices (name, price) VALUES (?, ?)').run('Legacy Phone', 5000);

  // Applying the outstanding migration(s) must not throw ...
  assert.doesNotThrow(() => runMigrations(db), 'forward migration should apply cleanly');

  // ... the new columns now exist ...
  const cols = columnInfo(db, 'devices');
  assert.ok(cols.availability, 'availability column should be added by the migration');
  assert.ok(cols.financing_eligible, 'financing_eligible column should be added by the migration');

  // ... and the pre-existing row is backfilled with the NOT NULL defaults.
  const row = db.prepare('SELECT * FROM devices WHERE name = ?').get('Legacy Phone');
  assert.ok(
    AVAILABILITY_VALUES.includes(row.availability),
    'the existing device should be backfilled with a valid availability default',
  );
  assert.equal(row.financing_eligible, 0, 'the existing device should default to financing_eligible = 0');
});

test('re-running migrations after the device columns exist is idempotent', () => {
  const db = model.createDatabase(':memory:');

  const before = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  // Re-running must not throw (e.g. "duplicate column name") or duplicate rows.
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const after = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  assert.deepEqual(after, before, 'schema_migrations should be unchanged after re-running');

  const cols = columnInfo(db, 'devices');
  assert.ok(cols.availability, 'availability column should persist across re-runs');
  assert.ok(cols.financing_eligible, 'financing_eligible column should persist across re-runs');
});

// ---------------------------------------------------------------------------
// createDevice: accepts, validates, persists and returns the new fields.
// ---------------------------------------------------------------------------

test('createDevice persists and returns availability + financing eligibility', () => {
  const db = model.createDatabase(':memory:');

  const device = model.createDevice(db, {
    name: 'iPhone 15',
    price: 18999,
    availability: 'PREORDER',
    financingEligible: 1,
  });

  // Returned shape carries the new fields.
  assert.equal(device.availability, 'PREORDER', 'createDevice should return the availability');
  assert.equal(financingOf(device), 1, 'createDevice should return financing eligibility');

  // Persisted to the row.
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  assert.equal(row.availability, 'PREORDER', 'availability should be persisted');
  assert.equal(row.financing_eligible, 1, 'financing_eligible should be persisted');
});

test('createDevice defaults availability + financing_eligible when omitted (and preserves name/price)', () => {
  const db = model.createDatabase(':memory:');

  const device = model.createDevice(db, { name: 'Basic Phone', price: 1500 });

  // Existing behaviour is preserved.
  assert.equal(typeof device.id, 'number', 'createDevice should return a numeric id');
  assert.equal(device.name, 'Basic Phone');
  assert.equal(device.price, 1500);

  // New fields default sensibly.
  assert.ok(
    AVAILABILITY_VALUES.includes(device.availability),
    `omitted availability should default to a valid enum value, got "${device.availability}"`,
  );
  assert.equal(financingOf(device), 0, 'omitted financing eligibility should default to 0');

  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  assert.ok(AVAILABILITY_VALUES.includes(row.availability), 'persisted availability default should be valid');
  assert.equal(row.financing_eligible, 0, 'persisted financing_eligible default should be 0');
});

test('createDevice rejects an invalid availability value', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      model.createDevice(db, {
        name: 'Bad',
        price: 100,
        availability: 'WHENEVER',
      }),
    /availability/i,
    'createDevice should validate availability against the enum',
  );
});

test('createDevice rejects an invalid financing eligibility value', () => {
  const db = model.createDatabase(':memory:');

  assert.throws(
    () =>
      model.createDevice(db, {
        name: 'Bad Finance',
        price: 100,
        financingEligible: 2,
      }),
    /financ/i,
    'createDevice should reject financing eligibility outside 0/1',
  );

  assert.throws(
    () =>
      model.createDevice(db, {
        name: 'Bad Finance Type',
        price: 100,
        financingEligible: 'yes',
      }),
    /financ/i,
    'createDevice should reject a non-numeric financing eligibility',
  );
});

test('createDevice accepts financing eligibility 0 and 1', () => {
  const db = model.createDatabase(':memory:');

  const eligible = model.createDevice(db, {
    name: 'Financeable',
    price: 9999,
    availability: 'IN_STOCK',
    financingEligible: 1,
  });
  const notEligible = model.createDevice(db, {
    name: 'Cash Only',
    price: 999,
    availability: 'IN_STOCK',
    financingEligible: 0,
  });

  assert.equal(financingOf(eligible), 1);
  assert.equal(financingOf(notEligible), 0);
});

// ---------------------------------------------------------------------------
// getDevices returns the new fields.
// ---------------------------------------------------------------------------

test('getDevices returns availability and financing eligibility for each device', () => {
  const db = model.createDatabase(':memory:');

  model.createDevice(db, {
    name: 'iPhone 15',
    price: 18999,
    availability: 'IN_STOCK',
    financingEligible: 1,
  });
  model.createDevice(db, {
    name: 'Preorder Phone',
    price: 20000,
    availability: 'PREORDER',
    financingEligible: 0,
  });

  const devices = model.getDevices(db);
  assert.equal(devices.length, 2, 'both devices should be listed');

  for (const device of devices) {
    assert.ok('availability' in device, 'each listed device should carry availability');
    assert.ok(
      AVAILABILITY_VALUES.includes(device.availability),
      `listed availability should be a valid enum value, got "${device.availability}"`,
    );
    assert.ok(
      device.financing_eligible !== undefined || device.financingEligible !== undefined,
      'each listed device should carry financing eligibility',
    );
  }

  const byName = Object.fromEntries(devices.map((d) => [d.name, d]));
  assert.equal(byName['iPhone 15'].availability, 'IN_STOCK');
  assert.equal(financingOf(byName['iPhone 15']), 1);
  assert.equal(byName['Preorder Phone'].availability, 'PREORDER');
  assert.equal(financingOf(byName['Preorder Phone']), 0);
});
