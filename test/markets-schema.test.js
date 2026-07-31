'use strict';

// Acceptance tests: migration version 3 introduces the `markets` table that
// captures the MarketContext data object (currency + tax configuration) from
// the HLD. These tests are written BEFORE implementation and must fail until
// the migration exists.
//
// The migration is expected to follow the existing pattern in
// `src/migrations.js`: a monotonically increasing `version`, an `up(db)` that
// creates the table with CHECK constraints, and bookkeeping recorded in
// `schema_migrations`. No new exports from `src/index.js` are required, so the
// schema is exercised directly through the database handle.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS } = require('../src/migrations.js');

// Helper: introspect a table's columns via PRAGMA table_info.
function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
}

test('migration version 3 exists and follows the established pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);

  assert.ok(versions.includes(3), 'expected a migration with version 3');

  // Versions must remain a monotonically increasing sequence starting at 1,
  // with v3 present (later migrations may extend the sequence).
  const sorted = [...versions].sort((a, b) => a - b);
  assert.deepEqual(sorted.slice(0, 3), [1, 2, 3], 'migration versions should begin 1, 2, 3');

  const migration = MIGRATIONS.find((m) => m.version === 3);
  assert.equal(typeof migration.name, 'string', 'migration 3 should have a name');
  assert.ok(migration.name.length > 0, 'migration 3 name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'migration 3 should expose an up(db) function');
});

test('migration version 3 is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  const versions = rows.map((r) => r.version);
  assert.ok(versions.includes(3), 'version 3 should be recorded in schema_migrations');
});

test('the markets table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  const rows = db.prepare('SELECT * FROM markets').all();
  assert.deepEqual(rows, [], 'markets table should exist and be empty on a fresh db');
});

test('the markets table captures the MarketContext columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'markets');

  for (const name of [
    'code',
    'name',
    'currency',
    'default_language',
    'tax_rate',
    'tax_inclusive',
    'tax_label',
  ]) {
    assert.ok(cols[name], `markets table should have a "${name}" column`);
  }

  // tax_rate is a numeric (REAL) rate.
  assert.match(
    String(cols.tax_rate.type).toUpperCase(),
    /REAL|NUM|FLOAT|DOUB/,
    'tax_rate should be a REAL/numeric column',
  );
});

test('a valid market row can be inserted and read back', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('ZA', 'South Africa', 'ZAR', 'en-ZA', 0.15, 1, 'VAT');

  const row = db.prepare('SELECT * FROM markets WHERE code = ?').get('ZA');
  assert.equal(row.code, 'ZA');
  assert.equal(row.name, 'South Africa');
  assert.equal(row.currency, 'ZAR');
  assert.equal(row.default_language, 'en-ZA');
  assert.equal(row.tax_rate, 0.15);
  assert.equal(row.tax_inclusive, 1);
  assert.equal(row.tax_label, 'VAT');
});

test('market code is unique', () => {
  const db = model.createDatabase(':memory:');
  const insert = (code) =>
    db
      .prepare(
        `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(code, 'Tanzania', 'TZS', 'sw-TZ', 0.18, 0, 'VAT');

  insert('TZ');
  assert.throws(() => insert('TZ'), /UNIQUE|constraint/i, 'duplicate market code should be rejected');
});

test('tax_rate must be non-negative (CHECK constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('MZ', 'Mozambique', 'MZN', 'pt-MZ', -0.1, 0, 'IVA'),
    /CHECK|constraint/i,
    'a negative tax_rate should violate a CHECK constraint',
  );
});

test('tax_inclusive is constrained to the 0/1 flag values (CHECK constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('KE', 'Kenya', 'KES', 'en-KE', 0.16, 2, 'VAT'),
    /CHECK|constraint/i,
    'a tax_inclusive value other than 0 or 1 should violate a CHECK constraint',
  );
});
