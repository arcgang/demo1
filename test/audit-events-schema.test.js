'use strict';

// Acceptance tests: migration version 5 (create_audit_events) introduces the
// `audit_events` table that models the HLD AuditEvent object, capturing
// sensitive-data access and critical consent/verification/payment actions.
// These tests are written BEFORE implementation and must fail until the
// migration exists.
//
// The migration is expected to follow the existing pattern in
// `src/migrations.js`: a monotonically increasing `version`, an `up(db)` that
// creates the table with CHECK constraints and an index, and bookkeeping
// recorded in `schema_migrations`. No new exports from `src/index.js` are
// required, so the schema is exercised directly through the database handle.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS, runMigrations } = require('../src/migrations.js');

// Helper: introspect a table's columns via PRAGMA table_info.
function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
}

// Helper: introspect a table's indexes via PRAGMA index_list / index_info.
function indexColumns(db, table) {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all();
  const result = [];
  for (const idx of indexes) {
    const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all().map((c) => c.name);
    result.push({ name: idx.name, columns: cols });
  }
  return result;
}

test('migration version 5 exists and follows the established pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);

  assert.ok(versions.includes(5), 'expected a migration with version 5');

  // Version 5 must be the greatest version (monotonically increasing sequence).
  assert.equal(Math.max(...versions), 5, 'version 5 should be the latest migration');

  const migration = MIGRATIONS.find((m) => m.version === 5);
  assert.equal(typeof migration.name, 'string', 'migration 5 should have a name');
  assert.equal(migration.name, 'create_audit_events', 'migration 5 should be named create_audit_events');
  assert.equal(typeof migration.up, 'function', 'migration 5 should expose an up(db) function');
});

test('migration version 5 is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  const versions = rows.map((r) => r.version);
  assert.ok(versions.includes(5), 'version 5 should be recorded in schema_migrations');
});

test('the audit_events table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  const rows = db.prepare('SELECT * FROM audit_events').all();
  assert.deepEqual(rows, [], 'audit_events table should exist and be empty on a fresh db');
});

test('the audit_events table captures the AuditEvent columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'audit_events');

  for (const name of [
    'id',
    'event_type',
    'journey',
    'subject_ref',
    'actor',
    'detail',
    'occurred_at',
  ]) {
    assert.ok(cols[name], `audit_events table should have a "${name}" column`);
  }

  // id is an INTEGER primary key.
  assert.equal(cols.id.pk, 1, 'id should be the primary key');
  assert.match(String(cols.id.type).toUpperCase(), /INT/, 'id should be an INTEGER column');
});

test('required columns are NOT NULL and metadata columns are nullable', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'audit_events');

  // NOT NULL columns per the design.
  for (const name of ['event_type', 'journey', 'subject_ref', 'occurred_at']) {
    assert.equal(cols[name].notnull, 1, `${name} should be NOT NULL`);
  }

  // actor and detail are optional (nullable) metadata columns.
  for (const name of ['actor', 'detail']) {
    assert.equal(cols[name].notnull, 0, `${name} should be nullable`);
  }
});

test('there is an index on (journey, occurred_at)', () => {
  const db = model.createDatabase(':memory:');
  const indexes = indexColumns(db, 'audit_events');

  const match = indexes.find(
    (idx) => idx.columns.length >= 2 && idx.columns[0] === 'journey' && idx.columns[1] === 'occurred_at',
  );
  assert.ok(match, 'expected an index leading with (journey, occurred_at)');
});

test('a valid audit event row can be inserted and read back', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO audit_events (event_type, journey, subject_ref, actor, detail)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    'SENSITIVE_DATA_ACCESS',
    'CHECKOUT',
    'ver_9001',
    'system',
    JSON.stringify({ field: 'idDocumentNumber' }),
  );

  const row = db.prepare('SELECT * FROM audit_events WHERE subject_ref = ?').get('ver_9001');
  assert.equal(row.event_type, 'SENSITIVE_DATA_ACCESS');
  assert.equal(row.journey, 'CHECKOUT');
  assert.equal(row.subject_ref, 'ver_9001');
  assert.equal(row.actor, 'system');
  assert.deepEqual(JSON.parse(row.detail), { field: 'idDocumentNumber' });
  assert.ok(typeof row.id === 'number' || typeof row.id === 'bigint', 'id should be assigned');
});

test('actor and detail may be omitted (stored as NULL)', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO audit_events (event_type, journey, subject_ref)
     VALUES (?, ?, ?)`,
  ).run('CONSENT_CAPTURED', 'ONBOARDING', 'cust_1001');

  const row = db.prepare('SELECT * FROM audit_events WHERE subject_ref = ?').get('cust_1001');
  assert.equal(row.actor, null, 'actor should default to NULL when omitted');
  assert.equal(row.detail, null, 'detail should default to NULL when omitted');
});

test('journey is constrained to CHECKOUT / ONBOARDING (CHECK constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO audit_events (event_type, journey, subject_ref)
           VALUES (?, ?, ?)`,
        )
        .run('SENSITIVE_DATA_ACCESS', 'BROWSE', 'cust_1001'),
    /CHECK|constraint/i,
    'a journey value other than CHECKOUT/ONBOARDING should violate a CHECK constraint',
  );
});

test('event_type is required (NOT NULL constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO audit_events (event_type, journey, subject_ref)
           VALUES (?, ?, ?)`,
        )
        .run(null, 'CHECKOUT', 'cust_1001'),
    /NOT NULL|constraint/i,
    'a null event_type should violate a NOT NULL constraint',
  );
});

test('subject_ref is required (NOT NULL constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO audit_events (event_type, journey, subject_ref)
           VALUES (?, ?, ?)`,
        )
        .run('CONSENT_CAPTURED', 'ONBOARDING', null),
    /NOT NULL|constraint/i,
    'a null subject_ref should violate a NOT NULL constraint',
  );
});

test('occurred_at is populated with a default timestamp when omitted', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO audit_events (event_type, journey, subject_ref)
     VALUES (?, ?, ?)`,
  ).run('PAYMENT_CONFIRMED', 'CHECKOUT', 'ord_3001');

  const row = db.prepare('SELECT * FROM audit_events WHERE subject_ref = ?').get('ord_3001');
  assert.ok(row.occurred_at, 'occurred_at should be populated by default');
  assert.match(
    String(row.occurred_at),
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    "occurred_at default should be a datetime('now') string",
  );
});

test('runMigrations is idempotent: version 5 applies exactly once and re-running is a no-op', () => {
  const db = model.createDatabase(':memory:');

  // Re-running migrations against an already-migrated database must not throw
  // (e.g. no "table already exists") and must not duplicate bookkeeping.
  assert.doesNotThrow(() => runMigrations(db), 're-running runMigrations should be a no-op');
  runMigrations(db);

  const count = db
    .prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = ?')
    .get(5).n;
  assert.equal(Number(count), 1, 'version 5 should be recorded exactly once');

  // The table is still intact and queryable after repeated runs.
  assert.deepEqual(db.prepare('SELECT * FROM audit_events').all(), []);
});
