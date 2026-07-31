'use strict';

// Acceptance tests: a migration introduces the `sim_offers` table capturing
// SIM/eSIM offers with their onboarding-implication fields (KYC/RICA
// verification and activation requirements) from the LLD's SIM/eSIM
// onboarding scope.
//
// The migration is expected to follow the existing pattern in
// `src/migrations.js`: a monotonically increasing `version`, an `up(db)` that
// creates the table with CHECK constraints, and bookkeeping recorded in
// `schema_migrations`. The repository already contains migrations 1-6, so the
// SIM/eSIM offer migration is the next version in the gap-free sequence (7).
//
// These tests are written BEFORE implementation and must fail until the
// migration exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS, runMigrations } = require('../src/migrations.js');

// ---------------------------------------------------------------------------
// Schema introspection helpers (mirroring migrations.test.js).
// ---------------------------------------------------------------------------

// Map a table's columns by name via PRAGMA table_info.
function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
}

// True when `table` exists in the sqlite schema.
function tableExists(db, table) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
}

// The raw CREATE TABLE SQL recorded in sqlite_master for `table`.
function tableSql(db, table) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return row ? row.sql : '';
}

// Extract the single-quoted string literals a `CHECK (<column> IN (...))`
// clause constrains `column` to, so a test can exercise an accepted value
// without hard-coding the chosen vocabulary.
function checkAllowedValues(sql, column) {
  const clause = new RegExp(`${column}[^)]*IN\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (!clause) return [];
  const literals = clause[1].match(/'([^']*)'/g) || [];
  return literals.map((s) => s.slice(1, -1));
}

// Name of the single column that carries the SIM/ESIM vocabulary, discovered
// by scanning for the CHECK clause that enumerates both values, so the test
// does not hard-code the chosen column name.
function findTypeColumn(db) {
  const cols = columnInfo(db, 'sim_offers');
  const sql = tableSql(db, 'sim_offers');
  for (const name of Object.keys(cols)) {
    const allowed = checkAllowedValues(sql, name);
    const upper = allowed.map((v) => v.toUpperCase());
    if (upper.includes('SIM') && upper.includes('ESIM')) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Migration bookkeeping.
// ---------------------------------------------------------------------------

test('a sim-offers migration (version 7) exists and follows the pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  assert.ok(versions.includes(7), 'expected a migration with version 7 for sim_offers');

  // Versions must remain a monotonically increasing, gap-free sequence
  // starting at 1.
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be gap-free starting at 1');

  const migration = MIGRATIONS.find((m) => m.version === 7);
  assert.ok(migration, 'expected to find the version 7 migration');
  assert.equal(typeof migration.name, 'string', 'migration 7 should have a name');
  assert.ok(migration.name.length > 0, 'migration 7 name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'migration 7 should expose an up(db) function');
});

test('migration version 7 is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const versions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);
  assert.ok(versions.includes(7), 'version 7 should be recorded in schema_migrations');
});

// ---------------------------------------------------------------------------
// Table shape.
// ---------------------------------------------------------------------------

test('the sim_offers table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'sim_offers'), 'sim_offers table should exist');
  const rows = db.prepare('SELECT * FROM sim_offers').all();
  assert.deepEqual(rows, [], 'sim_offers table should be empty on a fresh db');
});

test('the sim_offers table captures price and the onboarding-requirement columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'sim_offers');

  // Core catalog columns plus the explicitly-named onboarding-implication
  // fields from the task.
  for (const name of ['id', 'name', 'price', 'requires_verification', 'activation_required']) {
    assert.ok(cols[name], `sim_offers table should have a "${name}" column`);
  }

  // price is a numeric (REAL) amount like the rest of the catalog.
  assert.match(
    String(cols.price.type).toUpperCase(),
    /REAL|NUM|FLOAT|DOUB/,
    'sim_offers.price should be a REAL/numeric column',
  );
});

test('the sim_offers table has a SIM/ESIM type column and an availability column', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'sim_offers');

  const typeColumn = findTypeColumn(db);
  assert.ok(
    typeColumn,
    'sim_offers should have a column whose CHECK enumerates the SIM/ESIM vocabulary',
  );

  const hasAvailability = Object.keys(cols).some((name) => /avail/i.test(name));
  assert.ok(hasAvailability, 'sim_offers should have an availability column');
});

// ---------------------------------------------------------------------------
// Constraints.
// ---------------------------------------------------------------------------

test('sim_offers type is constrained to the SIM/ESIM vocabulary (CHECK)', () => {
  const db = model.createDatabase(':memory:');
  const typeColumn = findTypeColumn(db);
  assert.ok(typeColumn, 'expected a SIM/ESIM type column');

  const cols = columnInfo(db, 'sim_offers');
  const availabilityColumn = Object.keys(cols).find((name) => /avail/i.test(name));

  const insert = (type) =>
    db
      .prepare(
        `INSERT INTO sim_offers (name, ${typeColumn}, price, ${availabilityColumn}, requires_verification, activation_required)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('Offer', type, 0, 'IN_STOCK', 0, 0);

  // Both enumerated values are accepted.
  assert.doesNotThrow(() => insert('SIM'), 'SIM should be an accepted type');
  assert.doesNotThrow(() => insert('ESIM'), 'ESIM should be an accepted type');

  // A value outside the enumeration is rejected.
  assert.throws(
    () => insert('NOT_A_SIM_TYPE'),
    /CHECK|constraint/i,
    'an unknown type should violate the CHECK constraint',
  );
});

test('sim_offers.price is constrained to be non-negative (CHECK)', () => {
  const db = model.createDatabase(':memory:');
  const typeColumn = findTypeColumn(db);
  const cols = columnInfo(db, 'sim_offers');
  const availabilityColumn = Object.keys(cols).find((name) => /avail/i.test(name));

  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO sim_offers (name, ${typeColumn}, price, ${availabilityColumn}, requires_verification, activation_required)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('Offer', 'SIM', -1, 'IN_STOCK', 0, 0),
    /CHECK|constraint/i,
    'a negative price should violate the CHECK (price >= 0) constraint',
  );
});

test('the onboarding flags are constrained to the 0/1 boolean values (CHECK)', () => {
  const db = model.createDatabase(':memory:');
  const typeColumn = findTypeColumn(db);
  const cols = columnInfo(db, 'sim_offers');
  const availabilityColumn = Object.keys(cols).find((name) => /avail/i.test(name));

  const insertFlags = (requiresVerification, activationRequired) =>
    db
      .prepare(
        `INSERT INTO sim_offers (name, ${typeColumn}, price, ${availabilityColumn}, requires_verification, activation_required)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('Offer', 'ESIM', 0, 'IN_STOCK', requiresVerification, activationRequired);

  // The valid 0/1 flag values are accepted.
  assert.doesNotThrow(() => insertFlags(0, 0));
  assert.doesNotThrow(() => insertFlags(1, 1));

  // Values outside the 0/1 flag domain are rejected.
  assert.throws(
    () => insertFlags(2, 0),
    /CHECK|constraint/i,
    'requires_verification other than 0/1 should violate a CHECK constraint',
  );
  assert.throws(
    () => insertFlags(0, 5),
    /CHECK|constraint/i,
    'activation_required other than 0/1 should violate a CHECK constraint',
  );
});

// ---------------------------------------------------------------------------
// Idempotency.
// ---------------------------------------------------------------------------

test('re-running migrations after sim_offers exists is idempotent', () => {
  const db = model.createDatabase(':memory:');

  const before = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  // Re-running must not throw ("table already exists") and must not duplicate
  // the bookkeeping rows.
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const after = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  assert.deepEqual(after, before, 'schema_migrations should be unchanged after re-running');
  assert.ok(after.includes(7), 'version 7 should remain recorded after re-running');
  assert.ok(tableExists(db, 'sim_offers'), 'sim_offers table should still exist after re-running');
});
