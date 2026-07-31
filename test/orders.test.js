'use strict';

// Acceptance tests: the order record model functions.
//
// `src/index.js` exposes two model-layer functions that persist and retrieve
// orders, following the same makeCreator/shapeRow conventions as the rest of
// the catalog model:
//
//   createOrder(db, { deviceId, planId, total, orderReference })
//     Persist a confirmed cart as an order row and return the shaped order.
//     A unique `order_reference` is generated when `orderReference` is not
//     supplied. `deviceId` and `total` are validated the same way
//     `normalizePrice` validates prices (total defaults to 0, must be a
//     non-negative number). A freshly created order begins PENDING.
//
//   getOrderByReference(db, orderReference)
//     Look up a persisted order by its unique reference and return the shaped
//     order, or a nullish value when no order carries that reference.
//
// Both functions are re-exported from src/index.js module.exports. This
// defines the order record API that the order-status code consumes.
//
// These tests are written BEFORE the functions exist and must fail until they
// are implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

// Seed a device (and optionally a plan) so a created order can satisfy the
// orders.device_id / orders.plan_id foreign keys.
function seedDeviceAndPlan(db) {
  const device = model.createDevice(db, { name: 'Phone X', price: 799 });
  const plan = model.createPlan(db, { name: 'Unlimited', price: 60 });
  return { device, plan };
}

// ---------------------------------------------------------------------------
// Exports / shape
// ---------------------------------------------------------------------------

test('createOrder and getOrderByReference are re-exported as functions from src/index.js', () => {
  assert.equal(typeof model.createOrder, 'function');
  assert.equal(typeof model.getOrderByReference, 'function');
});

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

test('createOrder persists an order and returns its shaped record', () => {
  const db = freshDb();
  const { device, plan } = seedDeviceAndPlan(db);

  const order = model.createOrder(db, {
    deviceId: device.id,
    planId: plan.id,
    total: 859,
  });

  assert.equal(typeof order.id, 'number', 'order carries a numeric id');
  assert.ok(order.id > 0, 'order id is a real row id');
  assert.equal(order.deviceId, device.id);
  assert.equal(order.planId, plan.id);
  assert.equal(order.total, 859);
  assert.equal(typeof order.reference, 'string');
  assert.ok(order.reference.length > 0, 'order carries a non-empty reference');
});

test('a freshly created order begins in the PENDING status', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  const order = model.createOrder(db, { deviceId: device.id, total: 799 });

  assert.equal(order.status, 'PENDING');
});

test('createOrder defaults planId to null when no plan is supplied', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  const order = model.createOrder(db, { deviceId: device.id, total: 799 });

  assert.equal(order.planId, null);
});

test('createOrder defaults total to 0 when it is not supplied', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  const order = model.createOrder(db, { deviceId: device.id });

  assert.equal(order.total, 0);
});

test('createOrder generates a reference of the ORD- form when none is supplied', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  const order = model.createOrder(db, { deviceId: device.id, total: 799 });

  assert.ok(
    order.reference.startsWith('ORD-'),
    `expected a generated ORD- reference, received "${order.reference}"`,
  );
});

test('createOrder uses an explicitly supplied orderReference verbatim', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  const order = model.createOrder(db, {
    deviceId: device.id,
    total: 799,
    orderReference: 'ORD-CUSTOM-1',
  });

  assert.equal(order.reference, 'ORD-CUSTOM-1');

  const fetched = model.getOrderByReference(db, 'ORD-CUSTOM-1');
  assert.ok(fetched, 'the order is retrievable by its supplied reference');
  assert.equal(fetched.id, order.id);
});

// ---------------------------------------------------------------------------
// Reference uniqueness
// ---------------------------------------------------------------------------

test('orders created without an explicit reference each receive a distinct reference', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  const references = [];
  for (let i = 0; i < 25; i += 1) {
    const order = model.createOrder(db, { deviceId: device.id, total: 100 + i });
    references.push(order.reference);
  }

  assert.equal(
    new Set(references).size,
    references.length,
    'every generated order reference must be unique',
  );
});

test('createOrder rejects a duplicate explicit reference', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  model.createOrder(db, { deviceId: device.id, total: 799, orderReference: 'ORD-DUP-1' });

  assert.throws(
    () => model.createOrder(db, { deviceId: device.id, total: 799, orderReference: 'ORD-DUP-1' }),
    'a reference collision must be rejected (the column is UNIQUE)',
  );
});

// ---------------------------------------------------------------------------
// Retrieval by reference
// ---------------------------------------------------------------------------

test('getOrderByReference returns the shaped order for a known reference', () => {
  const db = freshDb();
  const { device, plan } = seedDeviceAndPlan(db);

  const created = model.createOrder(db, {
    deviceId: device.id,
    planId: plan.id,
    total: 859,
  });

  const fetched = model.getOrderByReference(db, created.reference);

  assert.ok(fetched, 'an order exists for the generated reference');
  assert.equal(fetched.id, created.id);
  assert.equal(fetched.reference, created.reference);
  assert.equal(fetched.deviceId, device.id);
  assert.equal(fetched.planId, plan.id);
  assert.equal(fetched.total, 859);
  assert.equal(fetched.status, 'PENDING');
});

test('getOrderByReference returns a nullish value for an unknown reference', () => {
  const db = freshDb();
  seedDeviceAndPlan(db);

  const fetched = model.getOrderByReference(db, 'ORD-DOES-NOT-EXIST');

  assert.equal(fetched ?? null, null);
});

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

test('createOrder throws when no arguments are supplied', () => {
  const db = freshDb();
  assert.throws(() => model.createOrder(db));
});

test('createOrder throws when deviceId is missing', () => {
  const db = freshDb();
  seedDeviceAndPlan(db);

  assert.throws(() => model.createOrder(db, { total: 799 }));
});

test('createOrder throws when total is negative', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  assert.throws(() => model.createOrder(db, { deviceId: device.id, total: -1 }));
});

test('createOrder throws when total is not a number', () => {
  const db = freshDb();
  const { device } = seedDeviceAndPlan(db);

  assert.throws(() => model.createOrder(db, { deviceId: device.id, total: '799' }));
  assert.throws(() => model.createOrder(db, { deviceId: device.id, total: NaN }));
});
