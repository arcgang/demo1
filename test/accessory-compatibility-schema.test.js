'use strict';

// Acceptance tests: a migration introduces a device `family` attribute and an
// accessory-to-family compatibility mapping.
//
// Per the task contract this migration:
//
//   - Introduces a device `family` attribute. The task allows either a
//     `family` TEXT column on `devices` OR a `device_families` table referenced
//     by devices, so these tests accept either shape (see `hasDeviceFamily`).
//   - Adds an `accessory_compatibility` table mapping an accessory to a device
//     family. It carries at least `accessory_id` (FK -> accessories) and a
//     `family` TEXT value, follows the established index conventions (an index
//     on `accessory_id`), and prevents the same family being recorded twice for
//     one accessory via a composite UNIQUE (accessory_id, family) -- mirroring
//     the cart_optional_selections convention.
//
// The migration must extend the existing gap-free version sequence, be recorded
// in schema_migrations, and remain safe to run repeatedly (idempotent).
//
// These tests are written BEFORE implementation and must fail until the
// migration exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS, runMigrations } = require('../src/migrations.js');

// ---------------------------------------------------------------------------
// Schema introspection helpers (SQLite PRAGMAs), mirroring migrations.test.js.
// ---------------------------------------------------------------------------

function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
}

function foreignKeys(db, table) {
  return db.prepare(`PRAGMA foreign_key_list(${table})`).all();
}

function hasIndexOn(db, table, column) {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all();
  for (const idx of indexes) {
    const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all();
    if (cols.some((c) => c.name === column)) return true;
  }
  return false;
}

function tableExists(db, table) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
}

function tableSql(db, table) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return row ? row.sql : '';
}

// Extract the single-quoted literals a `CHECK (<column> IN (...))` clause
// constrains `column` to, so a test can pick an accepted value without
// hard-coding the chosen vocabulary.
function checkAllowedValues(sql, column) {
  const clause = new RegExp(`${column}[^)]*IN\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (!clause) return [];
  const literals = clause[1].match(/'([^']*)'/g) || [];
  return literals.map((s) => s.slice(1, -1));
}

// True when the schema models a device family, either as a `family` column on
// `devices` or a dedicated `device_families` table referenced by devices.
function hasDeviceFamily(db) {
  const deviceCols = columnInfo(db, 'devices');
  if (deviceCols.family) return true;
  if (tableExists(db, 'device_families')) return true;
  return false;
}

// Return a valid `family` value to record compatibility for. Prefers a value
// from a CHECK enumeration (on the compatibility table, then devices) so the
// test respects any chosen vocabulary; otherwise falls back to plausible
// device-family strings.
function familyValues(db, count) {
  let allowed = checkAllowedValues(tableSql(db, 'accessory_compatibility'), 'family');
  if (allowed.length === 0) allowed = checkAllowedValues(tableSql(db, 'devices'), 'family');
  if (allowed.length === 0 && model.DEVICE_FAMILY) {
    allowed = Object.values(model.DEVICE_FAMILY);
  }
  if (allowed.length === 0) allowed = ['SMARTPHONE', 'TABLET', 'WEARABLE', 'ROUTER'];
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(allowed[i % allowed.length]);
  return out;
}

function seedAccessory(db) {
  return model.createAccessory(db, { name: 'Case', price: 199 });
}

// ---------------------------------------------------------------------------
// Migration bookkeeping and shape.
// ---------------------------------------------------------------------------

test('a device-family / accessory-compatibility migration (version 7) exists and follows the pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  assert.ok(versions.includes(7), 'expected a migration with version 7');

  const migration = MIGRATIONS.find((m) => m.version === 7);
  assert.equal(typeof migration.name, 'string', 'migration 7 should have a name');
  assert.ok(migration.name.length > 0, 'migration 7 name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'migration 7 should expose an up(db) function');
});

test('the migration set stays a gap-free sequence from 1 after adding compatibility', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be gap-free starting at 1');

  for (const migration of MIGRATIONS) {
    assert.equal(typeof migration.version, 'number', 'each migration should have a numeric version');
    assert.equal(typeof migration.name, 'string', 'each migration should have a name');
    assert.ok(migration.name.length > 0, 'each migration name should be non-empty');
    assert.equal(typeof migration.up, 'function', 'each migration should expose an up(db) function');
  }
});

test('every migration version is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const recorded = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);
  const declared = MIGRATIONS.map((m) => m.version).sort((a, b) => a - b);
  assert.deepEqual(
    [...recorded].sort((a, b) => a - b),
    declared,
    'schema_migrations should record exactly the declared migration versions',
  );
  assert.ok(recorded.includes(7), 'version 7 should be recorded in schema_migrations');
});

// ---------------------------------------------------------------------------
// Device family attribute.
// ---------------------------------------------------------------------------

test('devices carry a family attribute (family column or device_families table)', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(
    hasDeviceFamily(db),
    'expected a device `family` column on devices or a device_families table',
  );
});

// ---------------------------------------------------------------------------
// accessory_compatibility table.
// ---------------------------------------------------------------------------

test('the accessory_compatibility table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'accessory_compatibility'), 'accessory_compatibility table should exist');
  assert.deepEqual(
    db.prepare('SELECT * FROM accessory_compatibility').all(),
    [],
    'accessory_compatibility should be empty on a fresh db',
  );
});

test('accessory_compatibility has accessory_id and family columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'accessory_compatibility');
  for (const name of ['accessory_id', 'family']) {
    assert.ok(cols[name], `accessory_compatibility should have a "${name}" column`);
  }
});

test('accessory_compatibility.accessory_id references accessories', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'accessory_compatibility');
  const accessoryFk = fks.find((fk) => fk.from === 'accessory_id');
  assert.ok(accessoryFk, 'accessory_compatibility.accessory_id should be a foreign key');
  assert.equal(
    accessoryFk.table,
    'accessories',
    'accessory_id should reference the accessories table',
  );
});

test('accessory_compatibility.accessory_id is indexed (established index convention)', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(
    hasIndexOn(db, 'accessory_compatibility', 'accessory_id'),
    'accessory_compatibility.accessory_id should be indexed',
  );
});

test('accessory_compatibility foreign keys are enforced (invalid accessory ids rejected)', () => {
  const db = model.createDatabase(':memory:');
  const [family] = familyValues(db, 1);
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO accessory_compatibility (accessory_id, family) VALUES (?, ?)')
        .run(9999, family),
    /FOREIGN KEY|constraint/i,
    'a compatibility row for a non-existent accessory should violate the foreign key',
  );
});

test('accessory_compatibility rejects recording the same family twice for one accessory', () => {
  const db = model.createDatabase(':memory:');
  const accessory = seedAccessory(db);
  const [family] = familyValues(db, 1);

  const insert = () =>
    db
      .prepare('INSERT INTO accessory_compatibility (accessory_id, family) VALUES (?, ?)')
      .run(accessory.id, family);

  assert.doesNotThrow(insert, 'the first compatibility row should be allowed');
  assert.throws(
    insert,
    /UNIQUE|constraint/i,
    'recording the same family twice for one accessory should violate the UNIQUE constraint',
  );
});

test('accessory compatibility rows can be created and read back directly', () => {
  const db = model.createDatabase(':memory:');
  const accessory = seedAccessory(db);
  const families = familyValues(db, 2);

  for (const family of families) {
    db.prepare('INSERT INTO accessory_compatibility (accessory_id, family) VALUES (?, ?)').run(
      accessory.id,
      family,
    );
  }

  const rows = db
    .prepare('SELECT family FROM accessory_compatibility WHERE accessory_id = ? ORDER BY family')
    .all(accessory.id);
  assert.deepEqual(
    rows.map((r) => r.family).sort(),
    [...new Set(families)].sort(),
    'the recorded compatible families should be readable back for the accessory',
  );
});

// ---------------------------------------------------------------------------
// Idempotency / re-runnability.
// ---------------------------------------------------------------------------

test('running migrations repeatedly is idempotent (no error, bookkeeping unchanged)', () => {
  const db = model.createDatabase(':memory:');

  const before = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const after = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  assert.deepEqual(after, before, 'schema_migrations should be unchanged after re-running');
  assert.ok(after.includes(7), 'version 7 should remain recorded after re-running');
  assert.ok(
    tableExists(db, 'accessory_compatibility'),
    'accessory_compatibility table should still exist after re-running',
  );
});

test('persisted compatibility rows survive a second runMigrations pass', () => {
  const db = model.createDatabase(':memory:');
  const accessory = seedAccessory(db);
  const [family] = familyValues(db, 1);

  db.prepare('INSERT INTO accessory_compatibility (accessory_id, family) VALUES (?, ?)').run(
    accessory.id,
    family,
  );

  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const rows = db.prepare('SELECT * FROM accessory_compatibility').all();
  assert.equal(rows.length, 1, 'the persisted compatibility row should survive a repeated run');
});
