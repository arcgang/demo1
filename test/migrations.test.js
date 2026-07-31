'use strict';

// Acceptance tests: migrations create the schema for the recommendation /
// attachment data model. The implementation is expected to live at
// `src/index.js` and expose a small data-model API (see README of the task).
//
// These tests are written BEFORE implementation and must fail until the
// schema, migrations, seed and query layer exist.

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

test('createDatabase returns a usable database handle', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(db, 'expected createDatabase to return a database handle');
});

test('migrations create the devices/plans/bundles/accessories tables (queryable and empty on a fresh db)', () => {
  const db = model.createDatabase(':memory:');

  // If the migrations ran, each entity table exists and yields an empty list.
  assert.deepEqual(model.getDevices(db), [], 'devices table should exist and be empty');
  assert.deepEqual(model.getPlans(db), [], 'plans table should exist and be empty');
  assert.deepEqual(model.getBundles(db), [], 'bundles table should exist and be empty');
  assert.deepEqual(model.getAccessories(db), [], 'accessories table should exist and be empty');
});

test('migrations create the attachments relationship (no attachments on a fresh db)', () => {
  const db = model.createDatabase(':memory:');
  assert.deepEqual(
    model.getAttachmentsForDevice(db, 1),
    [],
    'a fresh database should return no attachments for any device',
  );
});

test('the model exposes the REQUIRED/OPTIONAL requirement vocabulary', () => {
  assert.ok(model.REQUIREMENT, 'expected a REQUIREMENT enum to be exported');
  assert.equal(model.REQUIREMENT.REQUIRED, 'REQUIRED');
  assert.equal(model.REQUIREMENT.OPTIONAL, 'OPTIONAL');
});

// ---------------------------------------------------------------------------
// Migration version 4: consent_records + audit_events (POPIA/consent + audit)
// ---------------------------------------------------------------------------
//
// These tests are written BEFORE implementation and must fail until the v4
// migration exists. The migration is expected to follow the established
// pattern in `src/migrations.js`: a monotonically increasing `version`, an
// `up(db)` that creates the tables (idempotently, alongside the existing
// migrations), and bookkeeping recorded in `schema_migrations`. No new exports
// from `src/index.js` are required, so the schema is exercised directly
// through the database handle.

test('migration version 4 exists and follows the established pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);

  assert.ok(versions.includes(4), 'expected a migration with version 4');

  // Versions must remain a monotonically increasing, gap-free sequence.
  const sorted = [...versions].sort((a, b) => a - b);
  assert.deepEqual(sorted, [1, 2, 3, 4], 'migration versions should be 1, 2, 3, 4');

  const migration = MIGRATIONS.find((m) => m.version === 4);
  assert.equal(typeof migration.name, 'string', 'migration 4 should have a name');
  assert.ok(migration.name.length > 0, 'migration 4 name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'migration 4 should expose an up(db) function');
});

test('migration version 4 is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  const versions = rows.map((r) => r.version);
  assert.ok(versions.includes(4), 'version 4 should be recorded in schema_migrations');
});

test('runMigrations is idempotent when applied repeatedly (v4 included)', () => {
  const db = model.createDatabase(':memory:');
  // A second run against an already-migrated database must not throw
  // (e.g. no "table already exists" errors) and must not duplicate bookkeeping.
  assert.doesNotThrow(() => runMigrations(db), 'runMigrations should be safe to re-run');

  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  const versions = rows.map((r) => r.version);
  assert.deepEqual(versions, [1, 2, 3, 4], 'each migration should be recorded exactly once');
});

test('the consent_records table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  const rows = db.prepare('SELECT * FROM consent_records').all();
  assert.deepEqual(rows, [], 'consent_records table should exist and be empty on a fresh db');
});

test('the audit_events table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  const rows = db.prepare('SELECT * FROM audit_events').all();
  assert.deepEqual(rows, [], 'audit_events table should exist and be empty on a fresh db');
});

test('the consent_records table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'consent_records');

  for (const name of ['id', 'subject_ref', 'purpose', 'granted', 'journey', 'recorded_at']) {
    assert.ok(cols[name], `consent_records table should have a "${name}" column`);
  }

  // id is the autoincrement primary key.
  assert.equal(cols.id.pk, 1, 'id should be the primary key');

  // The consent-defining columns are NOT NULL.
  assert.equal(cols.subject_ref.notnull, 1, 'subject_ref should be NOT NULL');
  assert.equal(cols.purpose.notnull, 1, 'purpose should be NOT NULL');
  assert.equal(cols.granted.notnull, 1, 'granted should be NOT NULL');
  assert.equal(cols.journey.notnull, 1, 'journey should be NOT NULL');
  assert.equal(cols.recorded_at.notnull, 1, 'recorded_at should be NOT NULL');
});

test('the audit_events table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'audit_events');

  for (const name of ['id', 'event_type', 'subject_ref', 'journey', 'detail', 'recorded_at']) {
    assert.ok(cols[name], `audit_events table should have a "${name}" column`);
  }

  // id is the autoincrement primary key.
  assert.equal(cols.id.pk, 1, 'id should be the primary key');

  // Required columns.
  assert.equal(cols.event_type.notnull, 1, 'event_type should be NOT NULL');
  assert.equal(cols.journey.notnull, 1, 'journey should be NOT NULL');
  assert.equal(cols.recorded_at.notnull, 1, 'recorded_at should be NOT NULL');

  // subject_ref is nullable (audit events are not always tied to a subject).
  assert.equal(cols.subject_ref.notnull, 0, 'subject_ref should be nullable');
});

test('a valid consent_record row can be inserted and read back', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO consent_records (subject_ref, purpose, granted, journey)
     VALUES (?, ?, ?, ?)`,
  ).run('cust_1001', 'MARKETING', 0, 'CHECKOUT');

  const row = db.prepare('SELECT * FROM consent_records WHERE subject_ref = ?').get('cust_1001');
  assert.equal(row.subject_ref, 'cust_1001');
  assert.equal(row.purpose, 'MARKETING');
  assert.equal(row.granted, 0);
  assert.equal(row.journey, 'CHECKOUT');
  // recorded_at is defaulted by the schema.
  assert.ok(row.recorded_at, 'recorded_at should be populated by default');
});

test('recorded_at defaults are applied for consent_records and audit_events', () => {
  const db = model.createDatabase(':memory:');

  db.prepare(
    `INSERT INTO consent_records (subject_ref, purpose, granted, journey)
     VALUES (?, ?, ?, ?)`,
  ).run('cust_2002', 'PERSONALIZATION', 1, 'ONBOARDING');
  const consent = db
    .prepare('SELECT recorded_at FROM consent_records WHERE subject_ref = ?')
    .get('cust_2002');
  assert.ok(consent.recorded_at, 'consent_records.recorded_at should default');

  db.prepare(
    `INSERT INTO audit_events (event_type, journey)
     VALUES (?, ?)`,
  ).run('CONSENT_CAPTURE', 'ONBOARDING');
  const audit = db
    .prepare('SELECT recorded_at FROM audit_events WHERE event_type = ?')
    .get('CONSENT_CAPTURE');
  assert.ok(audit.recorded_at, 'audit_events.recorded_at should default');
});

test('consent_records.granted is constrained to the 0/1 flag values (CHECK constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO consent_records (subject_ref, purpose, granted, journey)
           VALUES (?, ?, ?, ?)`,
        )
        .run('cust_3003', 'MARKETING', 2, 'CHECKOUT'),
    /CHECK|constraint/i,
    'a granted value other than 0 or 1 should violate a CHECK constraint',
  );
});

test('a valid audit_event row can be inserted with a null subject_ref', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO audit_events (event_type, subject_ref, journey, detail)
     VALUES (?, ?, ?, ?)`,
  ).run('SENSITIVE_DATA_ACCESS', null, 'CHECKOUT', 'accessed id document');

  const row = db
    .prepare('SELECT * FROM audit_events WHERE event_type = ?')
    .get('SENSITIVE_DATA_ACCESS');
  assert.equal(row.event_type, 'SENSITIVE_DATA_ACCESS');
  assert.equal(row.subject_ref, null);
  assert.equal(row.journey, 'CHECKOUT');
  assert.equal(row.detail, 'accessed id document');
});

test('an index exists on audit_events(event_type)', () => {
  const db = model.createDatabase(':memory:');
  const indexes = db.prepare(`PRAGMA index_list(audit_events)`).all();
  const covers = indexes.some((idx) => {
    const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all().map((c) => c.name);
    return cols.length === 1 && cols[0] === 'event_type';
  });
  assert.ok(covers, 'expected an index on audit_events(event_type)');
});

test('an index exists on consent_records(subject_ref)', () => {
  const db = model.createDatabase(':memory:');
  const indexes = db.prepare(`PRAGMA index_list(consent_records)`).all();
  const covers = indexes.some((idx) => {
    const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all().map((c) => c.name);
    return cols.length === 1 && cols[0] === 'subject_ref';
  });
  assert.ok(covers, 'expected an index on consent_records(subject_ref)');
});
