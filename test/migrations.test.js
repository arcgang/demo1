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

// True when `table` has any index whose key columns include `column`. This
// also covers the implicit index SQLite creates for a UNIQUE column.
function hasIndexOn(db, table, column) {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all();
  for (const idx of indexes) {
    const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all();
    if (cols.some((c) => c.name === column)) return true;
  }
  return false;
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
  // starting at 1. (The order-persistence migration extends this sequence.)
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be gap-free starting at 1');
  assert.ok(sorted.includes(1) && sorted.includes(2) && sorted.includes(3) && sorted.includes(4));

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

// ---------------------------------------------------------------------------
// Order persistence migration: `orders` + `order_items`.
//
// Persists a confirmed cart as an order with a unique, human-readable
// reference, a constrained status, a device (optional plan), and a
// non-negative total; plus an `order_items` table capturing the itemized
// breakdown (kind, source id, name, price, requirement). These tests are
// written BEFORE implementation and must fail until the migration exists.
//
// NOTE: the repository already contains migrations 1-4, so the order
// persistence migration is the next version in the gap-free sequence (5).
// ---------------------------------------------------------------------------

test('an order-persistence migration (version 5) exists and follows the pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  assert.ok(versions.includes(5), 'expected a migration with version 5 for order persistence');

  const migration = MIGRATIONS.find((m) => m.version === 5);
  assert.ok(migration, 'expected to find the version 5 migration');
  assert.equal(typeof migration.name, 'string', 'migration 5 should have a name');
  assert.ok(migration.name.length > 0, 'migration 5 name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'migration 5 should expose an up(db) function');
});

test('migration version 5 is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const versions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);
  assert.ok(versions.includes(5), 'version 5 should be recorded in schema_migrations');
});

test('the orders and order_items tables exist and are empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');

  assert.ok(tableExists(db, 'orders'), 'orders table should exist');
  assert.ok(tableExists(db, 'order_items'), 'order_items table should exist');

  assert.deepEqual(db.prepare('SELECT * FROM orders').all(), [], 'orders should be empty');
  assert.deepEqual(db.prepare('SELECT * FROM order_items').all(), [], 'order_items should be empty');
});

test('the orders table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'orders');

  for (const name of ['id', 'reference', 'status', 'device_id', 'plan_id', 'total', 'created_at']) {
    assert.ok(cols[name], `orders table should have a "${name}" column`);
  }

  assert.equal(cols.total.type.toUpperCase(), 'REAL', 'orders.total should be a REAL column');
  assert.equal(cols.status.type.toUpperCase(), 'TEXT', 'orders.status should be a TEXT column');
});

test('orders.plan_id is nullable; device_id references devices and plan_id references plans', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'orders');
  assert.equal(cols.plan_id.notnull, 0, 'orders.plan_id should be nullable');

  const fks = foreignKeys(db, 'orders');

  const deviceFk = fks.find((fk) => fk.from === 'device_id');
  assert.ok(deviceFk, 'orders.device_id should be a foreign key');
  assert.equal(deviceFk.table, 'devices', 'orders.device_id should reference devices');

  const planFk = fks.find((fk) => fk.from === 'plan_id');
  assert.ok(planFk, 'orders.plan_id should be a foreign key');
  assert.equal(planFk.table, 'plans', 'orders.plan_id should reference plans');
});

test('orders.reference is unique and indexed', () => {
  const db = model.createDatabase(':memory:');
  const device = model.createDevice(db, { name: 'iPhone 15', price: 18999 });

  db.prepare(
    'INSERT INTO orders (reference, status, device_id, total) VALUES (?, ?, ?, ?)',
  ).run('ORD-0001', firstOrderStatus(db), device.id, 18999);

  assert.throws(
    () =>
      db
        .prepare('INSERT INTO orders (reference, status, device_id, total) VALUES (?, ?, ?, ?)')
        .run('ORD-0001', firstOrderStatus(db), device.id, 18999),
    /UNIQUE|constraint/i,
    'a duplicate order reference should violate the unique constraint',
  );

  assert.ok(hasIndexOn(db, 'orders', 'reference'), 'orders.reference should be indexed');
});

test('orders.status is constrained by a CHECK enumeration', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'orders');
  assert.match(sql, /CHECK\s*\(/i, 'orders should declare a CHECK constraint');

  const allowed = checkAllowedValues(sql, 'status');
  assert.ok(allowed.length > 0, 'orders.status CHECK should enumerate allowed values');

  const device = model.createDevice(db, { name: 'iPhone 15', price: 18999 });

  // An enumerated value is accepted.
  assert.doesNotThrow(() =>
    db
      .prepare('INSERT INTO orders (reference, status, device_id, total) VALUES (?, ?, ?, ?)')
      .run('ORD-OK', allowed[0], device.id, 100),
  );

  // A value outside the enumeration is rejected.
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO orders (reference, status, device_id, total) VALUES (?, ?, ?, ?)')
        .run('ORD-BAD', 'NOT_A_REAL_STATUS', device.id, 100),
    /CHECK|constraint/i,
    'an unknown status should violate the CHECK constraint',
  );
});

test('orders.total is constrained to be non-negative', () => {
  const db = model.createDatabase(':memory:');
  const device = model.createDevice(db, { name: 'iPhone 15', price: 18999 });

  assert.throws(
    () =>
      db
        .prepare('INSERT INTO orders (reference, status, device_id, total) VALUES (?, ?, ?, ?)')
        .run('ORD-NEG', firstOrderStatus(db), device.id, -1),
    /CHECK|constraint/i,
    'a negative total should violate the CHECK (total >= 0) constraint',
  );
});

test('the order_items table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'order_items');

  // order_id links to the parent order; the remaining columns capture the
  // itemized breakdown: kind, source id, name, price, requirement.
  for (const name of ['order_id', 'kind', 'source_id', 'name', 'price', 'requirement']) {
    assert.ok(cols[name], `order_items table should have a "${name}" column`);
  }

  assert.equal(cols.price.type.toUpperCase(), 'REAL', 'order_items.price should be a REAL column');
});

test('order_items.order_id references orders and is indexed', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'order_items');

  const orderFk = fks.find((fk) => fk.from === 'order_id');
  assert.ok(orderFk, 'order_items.order_id should be a foreign key');
  assert.equal(orderFk.table, 'orders', 'order_items.order_id should reference orders');

  assert.ok(hasIndexOn(db, 'order_items', 'order_id'), 'order_items.order_id should be indexed');
});

test('order_items.requirement is constrained by the REQUIRED/OPTIONAL vocabulary', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'order_items');

  const allowed = checkAllowedValues(sql, 'requirement');
  assert.deepEqual(
    [...allowed].sort(),
    [model.REQUIREMENT.OPTIONAL, model.REQUIREMENT.REQUIRED].sort(),
    'order_items.requirement should mirror the REQUIRED/OPTIONAL enum',
  );
});

test('order_items foreign key is enforced (no orphan items)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO order_items (order_id, kind, source_id, name, price, requirement)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(9999, 'accessory', 1, 'Case', 199, model.REQUIREMENT.OPTIONAL),
    /FOREIGN KEY|constraint/i,
    'inserting an order item for a non-existent order should violate the foreign key',
  );
});

test('a confirmed order and its itemized breakdown persist end-to-end', () => {
  const db = model.createDatabase(':memory:');

  const device = model.createDevice(db, { name: 'iPhone 15', price: 18999 });
  const plan = model.createPlan(db, { name: 'Unlimited 20GB', price: 799 });
  const accessory = model.createAccessory(db, { name: 'Case', price: 199 });

  const orderInfo = db
    .prepare('INSERT INTO orders (reference, status, device_id, plan_id, total) VALUES (?, ?, ?, ?, ?)')
    .run('ORD-2001', firstOrderStatus(db), device.id, plan.id, 19997);
  const orderId = Number(orderInfo.lastInsertRowid);

  db.prepare(
    `INSERT INTO order_items (order_id, kind, source_id, name, price, requirement)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orderId, 'accessory', accessory.id, accessory.name, accessory.price, model.REQUIREMENT.OPTIONAL);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  assert.equal(order.reference, 'ORD-2001');
  assert.equal(order.device_id, device.id);
  assert.equal(order.plan_id, plan.id);
  assert.equal(order.total, 19997);

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  assert.equal(items.length, 1, 'the order should have its single line item persisted');
  assert.equal(items[0].kind, 'accessory');
  assert.equal(items[0].source_id, accessory.id);
  assert.equal(items[0].name, 'Case');
  assert.equal(items[0].price, 199);
  assert.equal(items[0].requirement, model.REQUIREMENT.OPTIONAL);
});

test('re-running migrations after the order tables exist is idempotent', () => {
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
  assert.ok(after.includes(5), 'version 5 should remain recorded after re-running');
  assert.ok(tableExists(db, 'orders'), 'orders table should still exist after re-running');
  assert.ok(tableExists(db, 'order_items'), 'order_items table should still exist after re-running');
});

// Pick a valid `orders.status` value from the CHECK enumeration so inserts in
// the tests above do not depend on the exact chosen vocabulary.
function firstOrderStatus(db) {
  const allowed = checkAllowedValues(tableSql(db, 'orders'), 'status');
  return allowed.length > 0 ? allowed[0] : 'PENDING';
}

// ---------------------------------------------------------------------------
// Order status-event migration: `order_status_events`.
//
// Records each milestone transition of an order as an append-only event row:
// which milestone (PAYMENT / VERIFICATION / FULFILMENT / ACTIVATION) moved into
// which state (PENDING / IN_PROGRESS / COMPLETE / BLOCKED / FAILED), an optional
// free-text detail, and when it occurred. Both the milestone and state columns
// are CHECK-constrained to the vocabularies exported by `src/status.js`, exactly
// as the requirement/order-status migrations interpolate their enum lists.
//
// The `orders` table already exists (migration 5) with a unique, indexed public
// reference, so this migration only introduces the events table plus its index.
// These tests are written BEFORE implementation and must fail until the
// migration exists.
//
// NOTE: the repository already contains migrations 1-5, so the status-event
// migration is the next version in the gap-free sequence (6).
// ---------------------------------------------------------------------------

const { MILESTONE_VALUES, STATUS_STATE_VALUES } = require('../src/status.js');

// Insert a minimal valid order and return its integer id, so status-event rows
// have a real parent to reference.
function insertOrder(db, reference = 'ORD-STATUS-1') {
  const device = model.createDevice(db, { name: 'iPhone 15', price: 18999 });
  const info = db
    .prepare('INSERT INTO orders (reference, status, device_id, total) VALUES (?, ?, ?, ?)')
    .run(reference, firstOrderStatus(db), device.id, 18999);
  return Number(info.lastInsertRowid);
}

test('a status-event migration (version 6) exists and follows the established pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  assert.ok(versions.includes(6), 'expected a migration with version 6 for order status events');

  // Versions must remain a monotonically increasing, gap-free sequence
  // starting at 1.
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be gap-free starting at 1');

  const migration = MIGRATIONS.find((m) => m.version === 6);
  assert.ok(migration, 'expected to find the version 6 migration');
  assert.equal(typeof migration.name, 'string', 'migration 6 should have a name');
  assert.ok(migration.name.length > 0, 'migration 6 name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'migration 6 should expose an up(db) function');
});

test('migration version 6 is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const versions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);
  assert.ok(versions.includes(6), 'version 6 should be recorded in schema_migrations');
});

test('the order_status_events table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'order_status_events'), 'order_status_events table should exist');
  assert.deepEqual(
    db.prepare('SELECT * FROM order_status_events').all(),
    [],
    'order_status_events should be empty on a fresh db',
  );
});

test('the order_status_events table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'order_status_events');

  for (const name of ['id', 'order_id', 'milestone', 'state', 'detail', 'occurred_at']) {
    assert.ok(cols[name], `order_status_events should have a "${name}" column`);
  }
});

test('order_status_events.order_id references orders and is indexed', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'order_status_events');

  const orderFk = fks.find((fk) => fk.from === 'order_id');
  assert.ok(orderFk, 'order_status_events.order_id should be a foreign key');
  assert.equal(orderFk.table, 'orders', 'order_status_events.order_id should reference orders');
  assert.equal(orderFk.to, 'id', 'order_status_events.order_id should reference orders(id)');

  assert.ok(
    hasIndexOn(db, 'order_status_events', 'order_id'),
    'order_status_events.order_id should be indexed',
  );
});

test('the orders public reference remains indexed after the status-event migration', () => {
  const db = model.createDatabase(':memory:');
  // The public order reference is unique and indexed for direct lookup/sharing.
  assert.ok(hasIndexOn(db, 'orders', 'reference'), 'orders reference column should be indexed');
});

test('order_status_events.milestone is constrained by the MILESTONE vocabulary', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'order_status_events');

  // The CHECK must enumerate exactly the MILESTONE values from src/status.js.
  const allowed = checkAllowedValues(sql, 'milestone');
  assert.deepEqual(
    [...allowed].sort(),
    [...MILESTONE_VALUES].sort(),
    'order_status_events.milestone CHECK should mirror the MILESTONE vocabulary',
  );

  const orderId = insertOrder(db, 'ORD-MILESTONE');

  // An enumerated milestone is accepted (paired with a valid state).
  assert.doesNotThrow(() =>
    db
      .prepare('INSERT INTO order_status_events (order_id, milestone, state) VALUES (?, ?, ?)')
      .run(orderId, MILESTONE_VALUES[0], STATUS_STATE_VALUES[0]),
  );

  // A value outside the enumeration is rejected.
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO order_status_events (order_id, milestone, state) VALUES (?, ?, ?)')
        .run(orderId, 'NOT_A_MILESTONE', STATUS_STATE_VALUES[0]),
    /CHECK|constraint/i,
    'an unknown milestone should violate the CHECK constraint',
  );
});

test('order_status_events.state is constrained by the STATUS_STATE vocabulary', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'order_status_events');

  const allowed = checkAllowedValues(sql, 'state');
  assert.deepEqual(
    [...allowed].sort(),
    [...STATUS_STATE_VALUES].sort(),
    'order_status_events.state CHECK should mirror the STATUS_STATE vocabulary',
  );

  const orderId = insertOrder(db, 'ORD-STATE');

  // An enumerated state is accepted (paired with a valid milestone).
  assert.doesNotThrow(() =>
    db
      .prepare('INSERT INTO order_status_events (order_id, milestone, state) VALUES (?, ?, ?)')
      .run(orderId, MILESTONE_VALUES[0], STATUS_STATE_VALUES[0]),
  );

  // A value outside the enumeration is rejected.
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO order_status_events (order_id, milestone, state) VALUES (?, ?, ?)')
        .run(orderId, MILESTONE_VALUES[0], 'NOT_A_REAL_STATE'),
    /CHECK|constraint/i,
    'an unknown state should violate the CHECK constraint',
  );
});

test('order_status_events.occurred_at defaults to the current timestamp', () => {
  const db = model.createDatabase(':memory:');
  const orderId = insertOrder(db, 'ORD-OCCURRED');

  const info = db
    .prepare('INSERT INTO order_status_events (order_id, milestone, state) VALUES (?, ?, ?)')
    .run(orderId, MILESTONE_VALUES[0], STATUS_STATE_VALUES[0]);

  const row = db
    .prepare('SELECT * FROM order_status_events WHERE id = ?')
    .get(Number(info.lastInsertRowid));

  assert.equal(typeof row.occurred_at, 'string', 'occurred_at should default to a timestamp string');
  assert.ok(row.occurred_at.length > 0, 'occurred_at default should be non-empty');
});

test('order_status_events foreign key is enforced (no orphan events)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO order_status_events (order_id, milestone, state) VALUES (?, ?, ?)')
        .run(9999, MILESTONE_VALUES[0], STATUS_STATE_VALUES[0]),
    /FOREIGN KEY|constraint/i,
    'inserting an event for a non-existent order should violate the foreign key',
  );
});

test('a milestone transition event persists end-to-end against a real order', () => {
  const db = model.createDatabase(':memory:');
  const orderId = insertOrder(db, 'ORD-3001');

  db.prepare(
    'INSERT INTO order_status_events (order_id, milestone, state, detail) VALUES (?, ?, ?, ?)',
  ).run(orderId, MILESTONE_VALUES[0], STATUS_STATE_VALUES[0], 'Payment confirmed.');

  const events = db
    .prepare('SELECT * FROM order_status_events WHERE order_id = ?')
    .all(orderId);

  assert.equal(events.length, 1, 'the order should have its single status event persisted');
  assert.equal(events[0].order_id, orderId);
  assert.equal(events[0].milestone, MILESTONE_VALUES[0]);
  assert.equal(events[0].state, STATUS_STATE_VALUES[0]);
  assert.equal(events[0].detail, 'Payment confirmed.');
});

test('re-running migrations after the status-event table exists is idempotent', () => {
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
  assert.ok(after.includes(6), 'version 6 should remain recorded after re-running');
  assert.ok(
    tableExists(db, 'order_status_events'),
    'order_status_events table should still exist after re-running',
  );
});
