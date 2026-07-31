'use strict';

// Acceptance tests: a migration introduces the `sim_offers` table capturing the
// SIM vs eSIM offer data model together with its onboarding implications
// (whether identity verification is required and when activation happens). The
// migration is expected to follow the established pattern in
// `src/migrations.js`: a monotonically increasing `version`, an `up(db)` that
// creates the table with the REAL price CHECK and enum-CHECK conventions, and
// bookkeeping recorded in `schema_migrations`.
//
// The repository already contains migrations 1-6, so the SIM/eSIM offer
// migration is the next version in the gap-free sequence (7).
//
// These tests are written BEFORE implementation and must fail until the
// migration exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS, runMigrations } = require('../src/migrations.js');

// ---------------------------------------------------------------------------
// Schema introspection helpers (mirroring test/migrations.test.js).
// ---------------------------------------------------------------------------

function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
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

// Extract the single-quoted string literals a `CHECK (<column> IN (...))`
// clause constrains `column` to, so a test can assert the chosen vocabulary
// without hard-coding a specific ordering.
function checkAllowedValues(sql, column) {
  const clause = new RegExp(`${column}[^)]*IN\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (!clause) return [];
  const literals = clause[1].match(/'([^']*)'/g) || [];
  return literals.map((s) => s.slice(1, -1));
}

// Insert a sim_offers row directly (bypassing the model layer) so the schema
// itself can be exercised. Callers override individual columns as needed.
function insertOffer(db, overrides = {}) {
  const row = {
    type: 'SIM',
    name: 'Prepaid Starter SIM',
    price: 50,
    requires_verification: 1,
    activation_type: 'POST_VERIFICATION',
    ...overrides,
  };
  return db
    .prepare(
      `INSERT INTO sim_offers (type, name, price, requires_verification, activation_type)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(row.type, row.name, row.price, row.requires_verification, row.activation_type);
}

// ---------------------------------------------------------------------------
// Migration presence and bookkeeping.
// ---------------------------------------------------------------------------

test('a sim-offers migration (version 7) exists and follows the established pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  assert.ok(versions.includes(7), 'expected a migration with version 7 for SIM/eSIM offers');

  // Versions must remain a monotonically increasing, gap-free sequence from 1.
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be a gap-free sequence from 1');

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

test('the sim_offers table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'sim_offers');

  for (const name of ['id', 'type', 'name', 'price', 'requires_verification', 'activation_type']) {
    assert.ok(cols[name], `sim_offers table should have a "${name}" column`);
  }

  assert.equal(cols.price.type.toUpperCase(), 'REAL', 'sim_offers.price should be a REAL column');
  assert.equal(cols.type.type.toUpperCase(), 'TEXT', 'sim_offers.type should be a TEXT column');
  assert.equal(
    cols.activation_type.type.toUpperCase(),
    'TEXT',
    'sim_offers.activation_type should be a TEXT column',
  );
});

// ---------------------------------------------------------------------------
// Price CHECK convention (mirrors devices/plans/bundles/accessories).
// ---------------------------------------------------------------------------

test('sim_offers.price is constrained to be non-negative (CHECK price >= 0)', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'sim_offers');
  assert.match(sql, /CHECK\s*\(/i, 'sim_offers should declare CHECK constraints');

  assert.doesNotThrow(() => insertOffer(db, { name: 'Free SIM', price: 0 }), 'a zero price is allowed');

  assert.throws(
    () => insertOffer(db, { name: 'Bad SIM', price: -1 }),
    /CHECK|constraint/i,
    'a negative price should violate the CHECK (price >= 0) constraint',
  );
});

// ---------------------------------------------------------------------------
// type enum-CHECK convention (SIM / ESIM).
// ---------------------------------------------------------------------------

test('sim_offers.type is constrained by a CHECK enumeration of SIM/ESIM', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'sim_offers');

  const allowed = checkAllowedValues(sql, 'type');
  assert.deepEqual(
    [...allowed].sort(),
    ['ESIM', 'SIM'],
    'sim_offers.type CHECK should enumerate exactly SIM and ESIM',
  );

  // Both enumerated values are accepted.
  assert.doesNotThrow(() => insertOffer(db, { type: 'SIM', name: 'Physical SIM' }));
  assert.doesNotThrow(() => insertOffer(db, { type: 'ESIM', name: 'eSIM' }));

  // A value outside the enumeration is rejected.
  assert.throws(
    () => insertOffer(db, { type: 'MICRO_SIM', name: 'Nope' }),
    /CHECK|constraint/i,
    'an unknown type should violate the CHECK constraint',
  );
});

// ---------------------------------------------------------------------------
// activation_type enum-CHECK convention (IMMEDIATE / POST_VERIFICATION).
// ---------------------------------------------------------------------------

test('sim_offers.activation_type is constrained by a CHECK enumeration', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'sim_offers');

  const allowed = checkAllowedValues(sql, 'activation_type');
  assert.deepEqual(
    [...allowed].sort(),
    ['IMMEDIATE', 'POST_VERIFICATION'],
    'sim_offers.activation_type CHECK should enumerate exactly IMMEDIATE and POST_VERIFICATION',
  );

  assert.doesNotThrow(() =>
    insertOffer(db, { name: 'Immediate SIM', activation_type: 'IMMEDIATE', requires_verification: 0 }),
  );
  assert.doesNotThrow(() =>
    insertOffer(db, {
      name: 'Gated SIM',
      activation_type: 'POST_VERIFICATION',
      requires_verification: 1,
    }),
  );

  assert.throws(
    () => insertOffer(db, { name: 'Bad activation', activation_type: 'SOMEDAY' }),
    /CHECK|constraint/i,
    'an unknown activation_type should violate the CHECK constraint',
  );
});

// ---------------------------------------------------------------------------
// requires_verification 0/1 flag convention (mirrors markets.tax_inclusive).
// ---------------------------------------------------------------------------

test('sim_offers.requires_verification is constrained to the 0/1 flag values', () => {
  const db = model.createDatabase(':memory:');

  assert.doesNotThrow(() => insertOffer(db, { name: 'No verify', requires_verification: 0 }));
  assert.doesNotThrow(() => insertOffer(db, { name: 'Needs verify', requires_verification: 1 }));

  assert.throws(
    () => insertOffer(db, { name: 'Bad flag', requires_verification: 2 }),
    /CHECK|constraint/i,
    'a requires_verification value other than 0 or 1 should violate a CHECK constraint',
  );
});

// ---------------------------------------------------------------------------
// End-to-end persistence and idempotency.
// ---------------------------------------------------------------------------

test('a sim offer row persists and reads back with its onboarding fields', () => {
  const db = model.createDatabase(':memory:');

  insertOffer(db, {
    type: 'ESIM',
    name: 'eSIM Instant',
    price: 0,
    requires_verification: 1,
    activation_type: 'POST_VERIFICATION',
  });

  const row = db.prepare('SELECT * FROM sim_offers WHERE name = ?').get('eSIM Instant');
  assert.equal(row.type, 'ESIM');
  assert.equal(row.price, 0);
  assert.equal(row.requires_verification, 1);
  assert.equal(row.activation_type, 'POST_VERIFICATION');
});

test('running migrations a second time is idempotent (no error, schema unchanged)', () => {
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
  assert.ok(tableExists(db, 'sim_offers'), 'sim_offers table should still exist after re-running');
});
