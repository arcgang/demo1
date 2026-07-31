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

// ---------------------------------------------------------------------------
// Helpers for schema introspection via SQLite PRAGMAs.
// ---------------------------------------------------------------------------

// Map a table's columns by name via PRAGMA table_info.
function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
}

// List the foreign keys declared on a table via PRAGMA foreign_key_list.
function foreignKeys(db, table) {
  return db.prepare(`PRAGMA foreign_key_list(${table})`).all();
}

// True when `table` exists in the sqlite schema.
function tableExists(db, table) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
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
// Migration version 4: in-progress cart persistence schema.
//
// Introduces a `carts` table (scoped to a device with an optional plan) and a
// `cart_selected_attachments` join table capturing the OPTIONAL attachment ids
// a shopper has selected. These tests are written BEFORE implementation and
// must fail until the migration exists.
// ---------------------------------------------------------------------------

test('migration version 4 exists and follows the established pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);

  assert.ok(versions.includes(4), 'expected a migration with version 4');

  // Versions must remain a monotonically increasing, gap-free sequence
  // starting at 1 (later tasks may append further migrations beyond 4).
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be a gap-free sequence from 1');

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

test('the carts table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'carts'), 'carts table should exist');
  const rows = db.prepare('SELECT * FROM carts').all();
  assert.deepEqual(rows, [], 'carts table should be empty on a fresh db');
});

test('the cart_selected_attachments join table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'cart_selected_attachments'), 'cart_selected_attachments table should exist');
  const rows = db.prepare('SELECT * FROM cart_selected_attachments').all();
  assert.deepEqual(rows, [], 'cart_selected_attachments table should be empty on a fresh db');
});

test('the carts table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'carts');

  for (const name of ['id', 'device_id', 'plan_id', 'updated_at']) {
    assert.ok(cols[name], `carts table should have a "${name}" column`);
  }
});

test('carts.device_id references devices and plan_id references plans', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'carts');

  const deviceFk = fks.find((fk) => fk.from === 'device_id');
  assert.ok(deviceFk, 'carts.device_id should be a foreign key');
  assert.equal(deviceFk.table, 'devices', 'carts.device_id should reference the devices table');

  const planFk = fks.find((fk) => fk.from === 'plan_id');
  assert.ok(planFk, 'carts.plan_id should be a foreign key');
  assert.equal(planFk.table, 'plans', 'carts.plan_id should reference the plans table');
});

test('carts.plan_id is nullable', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'carts');
  // notnull === 0 means the column allows NULL.
  assert.equal(cols.plan_id.notnull, 0, 'carts.plan_id should be nullable');
});

test('the cart_selected_attachments table has cart_id and attachment_id columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'cart_selected_attachments');

  for (const name of ['cart_id', 'attachment_id']) {
    assert.ok(cols[name], `cart_selected_attachments table should have a "${name}" column`);
  }
});

test('cart_selected_attachments references carts and attachments', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'cart_selected_attachments');

  const cartFk = fks.find((fk) => fk.from === 'cart_id');
  assert.ok(cartFk, 'cart_selected_attachments.cart_id should be a foreign key');
  assert.equal(cartFk.table, 'carts', 'cart_id should reference the carts table');

  const attachmentFk = fks.find((fk) => fk.from === 'attachment_id');
  assert.ok(attachmentFk, 'cart_selected_attachments.attachment_id should be a foreign key');
  assert.equal(
    attachmentFk.table,
    'attachments',
    'attachment_id should reference the attachments table',
  );
});

test('a cart and its selected optional attachments persist end-to-end', () => {
  const db = model.createDatabase(':memory:');

  // Build the minimal catalog the cart references.
  const device = model.createDevice(db, { name: 'iPhone 15', price: 18999 });
  const plan = model.createPlan(db, { name: 'Unlimited 20GB', price: 799 });
  const accessory = model.createAccessory(db, { name: 'Case', price: 199 });
  const attachment = model.attach(db, {
    deviceId: device.id,
    planId: plan.id,
    accessoryId: accessory.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });

  const cartInfo = db
    .prepare('INSERT INTO carts (device_id, plan_id) VALUES (?, ?)')
    .run(device.id, plan.id);
  const cartId = Number(cartInfo.lastInsertRowid);

  db.prepare(
    'INSERT INTO cart_selected_attachments (cart_id, attachment_id) VALUES (?, ?)',
  ).run(cartId, attachment.id);

  const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId);
  assert.equal(cart.device_id, device.id);
  assert.equal(cart.plan_id, plan.id);

  const selected = db
    .prepare('SELECT attachment_id FROM cart_selected_attachments WHERE cart_id = ?')
    .all(cartId);
  assert.deepEqual(
    selected.map((r) => r.attachment_id),
    [attachment.id],
    'the selected optional attachment should be persisted for the cart',
  );
});

test('cart foreign keys are enforced (PRAGMA foreign_keys is ON)', () => {
  const db = model.createDatabase(':memory:');
  // No device with id 999 exists, so the FK should reject the insert.
  assert.throws(
    () => db.prepare('INSERT INTO carts (device_id) VALUES (?)').run(999),
    /FOREIGN KEY|constraint/i,
    'inserting a cart for a non-existent device should violate the foreign key',
  );
});

test('running migrations a second time is idempotent (no error, schema unchanged)', () => {
  const db = model.createDatabase(':memory:');

  const before = db
    .prepare(`SELECT version FROM schema_migrations ORDER BY version`)
    .all()
    .map((r) => r.version);

  // Re-running must not throw ("table already exists") and must not duplicate
  // the bookkeeping rows.
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const after = db
    .prepare(`SELECT version FROM schema_migrations ORDER BY version`)
    .all()
    .map((r) => r.version);

  assert.deepEqual(after, before, 'schema_migrations should be unchanged after re-running');
  assert.ok(after.includes(4), 'version 4 should remain recorded after re-running');

  // Tables remain queryable after the repeated runs.
  assert.ok(tableExists(db, 'carts'), 'carts table should still exist after re-running');
  assert.ok(
    tableExists(db, 'cart_selected_attachments'),
    'cart_selected_attachments table should still exist after re-running',
  );
});
