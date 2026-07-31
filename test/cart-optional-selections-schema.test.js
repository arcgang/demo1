'use strict';

// Acceptance tests: a migration adds durable storage for a shopper's
// in-progress device/plan/optional-add-on selection so a transient failure
// does not lose it. Per the authoritative LLD contract this introduces:
//
//   - a `carts` table (id, device_id REFERENCES devices, plan_id REFERENCES
//     plans, created_at, updated_at)
//   - a `cart_optional_selections` join table (cart_id REFERENCES carts,
//     attachment_id REFERENCES attachments) with a UNIQUE constraint on
//     (cart_id, attachment_id)
//
// These tests are written BEFORE implementation and must fail until the
// migration exists. They deliberately key on the contract's distinguishing
// details (the `cart_optional_selections` table name, the `carts.created_at`
// column, and the composite UNIQUE constraint) so they exercise this feature
// specifically rather than any pre-existing cart scaffolding.
//
// NOTE ON MIGRATION VERSION: the task text names "version 3", but the
// repository has since grown additional migrations, so version 3 is already
// taken by an unrelated migration. The durable acceptance criteria are the
// resulting schema shape, constraints, foreign-key enforcement, and
// idempotent re-runnability -- NOT a specific integer -- so these tests assert
// those properties and that migration versions remain a gap-free sequence from
// 1, without hard-coding a version number that would conflict with the
// existing migration set.

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

function tableExists(db, table) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
}

// Build the minimal catalog + attachment a cart can reference and return the
// created ids so a test can persist a cart and an optional selection.
function seedCatalog(db) {
  const device = model.createDevice(db, { name: 'iPhone 15', price: 18999 });
  const plan = model.createPlan(db, { name: 'Unlimited 20GB', price: 799 });
  const accessory = model.createAccessory(db, { name: 'Case', price: 199 });
  const attachment = model.attach(db, {
    deviceId: device.id,
    planId: plan.id,
    accessoryId: accessory.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });
  return { device, plan, accessory, attachment };
}

function insertCart(db, deviceId, planId = null) {
  const info = db
    .prepare('INSERT INTO carts (device_id, plan_id) VALUES (?, ?)')
    .run(deviceId, planId);
  return Number(info.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Migration bookkeeping and shape.
// ---------------------------------------------------------------------------

test('the migration set stays a gap-free sequence from 1 after adding cart persistence', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be gap-free starting at 1');

  // Every migration continues to follow the established pattern.
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
  assert.deepEqual([...recorded].sort((a, b) => a - b), declared,
    'schema_migrations should record exactly the declared migration versions');
});

// ---------------------------------------------------------------------------
// carts table.
// ---------------------------------------------------------------------------

test('the carts table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'carts'), 'carts table should exist');
  assert.deepEqual(db.prepare('SELECT * FROM carts').all(), [], 'carts should be empty on a fresh db');
});

test('the carts table has the contract columns (including created_at and updated_at)', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'carts');

  for (const name of ['id', 'device_id', 'plan_id', 'created_at', 'updated_at']) {
    assert.ok(cols[name], `carts table should have a "${name}" column`);
  }
});

test('carts.device_id references devices and carts.plan_id references plans', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'carts');

  const deviceFk = fks.find((fk) => fk.from === 'device_id');
  assert.ok(deviceFk, 'carts.device_id should be a foreign key');
  assert.equal(deviceFk.table, 'devices', 'carts.device_id should reference the devices table');

  const planFk = fks.find((fk) => fk.from === 'plan_id');
  assert.ok(planFk, 'carts.plan_id should be a foreign key');
  assert.equal(planFk.table, 'plans', 'carts.plan_id should reference the plans table');
});

test('carts.plan_id is nullable (device is required, plan is optional)', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'carts');
  // notnull === 0 means the column allows NULL.
  assert.equal(cols.plan_id.notnull, 0, 'carts.plan_id should be nullable');

  const { device } = seedCatalog(db);
  // A cart with a device but no plan should be insertable.
  assert.doesNotThrow(
    () => insertCart(db, device.id, null),
    'a cart with a device and no plan should be allowed',
  );
});

test('carts.created_at and updated_at are populated on insert without being supplied', () => {
  const db = model.createDatabase(':memory:');
  const { device } = seedCatalog(db);
  const cartId = insertCart(db, device.id, null);

  const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId);
  assert.ok(cart.created_at, 'carts.created_at should default to a timestamp on insert');
  assert.ok(cart.updated_at, 'carts.updated_at should default to a timestamp on insert');
});

test('carts foreign keys are enforced (PRAGMA foreign_keys is ON)', () => {
  const db = model.createDatabase(':memory:');
  // No device with id 999 exists, so the FK should reject the insert.
  assert.throws(
    () => db.prepare('INSERT INTO carts (device_id) VALUES (?)').run(999),
    /FOREIGN KEY|constraint/i,
    'inserting a cart for a non-existent device should violate the foreign key',
  );
});

// ---------------------------------------------------------------------------
// cart_optional_selections join table.
// ---------------------------------------------------------------------------

test('the cart_optional_selections table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(
    tableExists(db, 'cart_optional_selections'),
    'cart_optional_selections table should exist',
  );
  assert.deepEqual(
    db.prepare('SELECT * FROM cart_optional_selections').all(),
    [],
    'cart_optional_selections should be empty on a fresh db',
  );
});

test('cart_optional_selections has cart_id and attachment_id columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'cart_optional_selections');

  for (const name of ['cart_id', 'attachment_id']) {
    assert.ok(cols[name], `cart_optional_selections should have a "${name}" column`);
  }
});

test('cart_optional_selections references carts and attachments', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'cart_optional_selections');

  const cartFk = fks.find((fk) => fk.from === 'cart_id');
  assert.ok(cartFk, 'cart_optional_selections.cart_id should be a foreign key');
  assert.equal(cartFk.table, 'carts', 'cart_id should reference the carts table');

  const attachmentFk = fks.find((fk) => fk.from === 'attachment_id');
  assert.ok(attachmentFk, 'cart_optional_selections.attachment_id should be a foreign key');
  assert.equal(
    attachmentFk.table,
    'attachments',
    'attachment_id should reference the attachments table',
  );
});

test('cart_optional_selections enforces UNIQUE (cart_id, attachment_id)', () => {
  const db = model.createDatabase(':memory:');
  const { device, plan, attachment } = seedCatalog(db);
  const cartId = insertCart(db, device.id, plan.id);

  const insertSelection = () =>
    db
      .prepare('INSERT INTO cart_optional_selections (cart_id, attachment_id) VALUES (?, ?)')
      .run(cartId, attachment.id);

  assert.doesNotThrow(insertSelection, 'the first selection of an attachment should be allowed');
  assert.throws(
    insertSelection,
    /UNIQUE|constraint/i,
    'selecting the same attachment twice for the same cart should violate the UNIQUE constraint',
  );
});

test('cart_optional_selections foreign keys are enforced (no orphan selections)', () => {
  const db = model.createDatabase(':memory:');
  const { device, plan, attachment } = seedCatalog(db);
  const cartId = insertCart(db, device.id, plan.id);

  // Non-existent cart is rejected.
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO cart_optional_selections (cart_id, attachment_id) VALUES (?, ?)')
        .run(9999, attachment.id),
    /FOREIGN KEY|constraint/i,
    'a selection for a non-existent cart should violate the foreign key',
  );

  // Non-existent attachment is rejected.
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO cart_optional_selections (cart_id, attachment_id) VALUES (?, ?)')
        .run(cartId, 9999),
    /FOREIGN KEY|constraint/i,
    'a selection for a non-existent attachment should violate the foreign key',
  );
});

test('a cart and its optional selections persist end-to-end', () => {
  const db = model.createDatabase(':memory:');
  const { device, plan, attachment } = seedCatalog(db);

  const cartId = insertCart(db, device.id, plan.id);
  db.prepare(
    'INSERT INTO cart_optional_selections (cart_id, attachment_id) VALUES (?, ?)',
  ).run(cartId, attachment.id);

  const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId);
  assert.equal(cart.device_id, device.id);
  assert.equal(cart.plan_id, plan.id);

  const selected = db
    .prepare('SELECT attachment_id FROM cart_optional_selections WHERE cart_id = ?')
    .all(cartId);
  assert.deepEqual(
    selected.map((r) => r.attachment_id),
    [attachment.id],
    'the selected optional attachment should be persisted for the cart',
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

  // Re-running must not throw ("table already exists") and must not duplicate
  // the bookkeeping rows.
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const after = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  assert.deepEqual(after, before, 'schema_migrations should be unchanged after re-running');

  // The new tables remain queryable after the repeated runs.
  assert.ok(tableExists(db, 'carts'), 'carts table should still exist after re-running');
  assert.ok(
    tableExists(db, 'cart_optional_selections'),
    'cart_optional_selections table should still exist after re-running',
  );
});

test('persisted carts and selections survive a second runMigrations pass', () => {
  const db = model.createDatabase(':memory:');
  const { device, plan, attachment } = seedCatalog(db);

  const cartId = insertCart(db, device.id, plan.id);
  db.prepare(
    'INSERT INTO cart_optional_selections (cart_id, attachment_id) VALUES (?, ?)',
  ).run(cartId, attachment.id);

  // A re-run of the migrations must not wipe or duplicate existing data.
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const carts = db.prepare('SELECT * FROM carts').all();
  assert.equal(carts.length, 1, 'the persisted cart should survive a repeated migration run');

  const selections = db.prepare('SELECT * FROM cart_optional_selections').all();
  assert.equal(selections.length, 1, 'the persisted selection should survive a repeated migration run');
});
