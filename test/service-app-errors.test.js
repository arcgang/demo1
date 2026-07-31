'use strict';

// Acceptance tests: the existing service layer throws typed AppError instances
// carrying reason codes instead of bare `new Error(...)`.
//
// This is the refactor contract for:
//
//   src/index.js
//     assertName / normalizePrice        (via createDevice/createPlan/... )
//     attach                              (requirement mandatory, requirement
//                                          invalid, deviceId required, no add-on
//                                          referenced)
//     getAttachmentsForDevice /
//     getAttachmentsForDevicePlan         (requirement-filter validation)
//   src/cart.js
//     recalculateCart                     (deviceId required, unknown device)
//   src/recommend.js
//     recommend                           (deviceId required, customer required)
//
// Every one of these paths must now throw an `AppError` (from src/app-error.js)
// whose `reasonCode` is drawn from the catalog in src/reason-codes.js, whose
// `category` and derived `retryable` flag match the catalog, and whose
// `statePreservation` is a valid { cart, order, payment } object. Because these
// are validation / lookup failures that touch no persisted state, the cart must
// be reported PRESERVED. The human-readable detail is retained on the message.
//
// No service path may throw a bare Error anymore.
//
// These tests are written BEFORE the refactor and MUST fail until it lands.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { AppError } = require('../src/app-error.js');
const {
  REASON_CODE,
  REASON_CODE_VALUES,
  CATEGORY,
  CATEGORY_VALUES,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
} = require('../src/reason-codes.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

// Capture the error a thunk throws (failing loudly if it does not throw).
function capture(fn) {
  let thrown;
  let didThrow = false;
  try {
    fn();
  } catch (err) {
    didThrow = true;
    thrown = err;
  }
  assert.ok(didThrow, 'expected the service call to throw');
  return thrown;
}

// Shared structural assertions common to every AppError a service throws.
function assertAppErrorShape(err) {
  assert.ok(err instanceof AppError, 'thrown value must be an AppError instance');
  assert.ok(err instanceof Error, 'AppError must still be an Error');
  // A bare `new Error(...)` is an Error but NOT an AppError, so the instanceof
  // AppError check above is what guards against a bare throw. Belt and braces:
  assert.equal(err.name, 'AppError', 'the error name must identify it as an AppError');

  assert.ok(
    REASON_CODE_VALUES.includes(err.reasonCode),
    `reasonCode "${err.reasonCode}" must be a known catalog reason code`,
  );
  assert.ok(
    CATEGORY_VALUES.includes(err.category),
    `category "${err.category}" must be a known category`,
  );
  // retryable is DERIVED from the category (RETRYABLE -> true, else false).
  assert.equal(
    err.retryable,
    err.category === CATEGORY.RETRYABLE,
    'retryable must be derived from the category',
  );

  assert.equal(typeof err.statePreservation, 'object', 'statePreservation must be an object');
  assert.notEqual(err.statePreservation, null, 'statePreservation must not be null');
  for (const facet of ['cart', 'order', 'payment']) {
    assert.ok(
      STATE_PRESERVATION_VALUES.includes(err.statePreservation[facet]),
      `statePreservation.${facet} must be a STATE_PRESERVATION value`,
    );
  }
  // None of these validation/lookup failures throw away an in-progress cart.
  assert.equal(
    err.statePreservation.cart,
    STATE_PRESERVATION.PRESERVED,
    'a stateless service failure must report the cart as PRESERVED',
  );
}

// Assert a thunk throws an AppError with an exact reasonCode/category/retryable,
// still carrying human-readable detail matching `detail`.
function assertServiceError(fn, { reasonCode, category, detail }) {
  const err = capture(fn);
  assertAppErrorShape(err);
  assert.equal(err.reasonCode, reasonCode, `expected reasonCode ${reasonCode}`);
  assert.equal(err.category, category, `expected category ${category}`);
  assert.equal(
    err.retryable,
    category === CATEGORY.RETRYABLE,
    'retryable must follow the expected category',
  );
  if (detail) {
    assert.match(err.message, detail, 'the human-readable detail must be retained on the message');
  }
  return err;
}

// ---------------------------------------------------------------------------
// src/index.js — assertName / normalizePrice (via the catalog creators)
// ---------------------------------------------------------------------------
//
// The catalog has no dedicated code for name/price validation, so these paths
// are only required to throw a well-formed AppError (a known catalog reason
// code, consistent category/retryable, valid statePreservation) rather than a
// bare Error — and to keep their human-readable detail.

test('createDevice with a missing name throws an AppError (not a bare Error), keeping the detail', () => {
  const db = freshDb();
  const err = capture(() => model.createDevice(db, { price: 10 }));
  assertAppErrorShape(err);
  assert.match(err.message, /name/i, 'the name-required detail must be retained');
});

test('createDevice with a blank name throws an AppError', () => {
  const db = freshDb();
  const err = capture(() => model.createDevice(db, { name: '   ', price: 10 }));
  assertAppErrorShape(err);
  assert.match(err.message, /name/i);
});

test('createPlan with a non-string name throws an AppError', () => {
  const db = freshDb();
  const err = capture(() => model.createPlan(db, { name: 42, price: 10 }));
  assertAppErrorShape(err);
});

test('createDevice with a negative price throws an AppError, keeping the detail', () => {
  const db = freshDb();
  const err = capture(() => model.createDevice(db, { name: 'Phone', price: -1 }));
  assertAppErrorShape(err);
  assert.match(err.message, /price/i, 'the price detail must be retained');
});

test('createBundle with a non-numeric price throws an AppError', () => {
  const db = freshDb();
  const err = capture(() => model.createBundle(db, { name: 'Bundle', price: 'free' }));
  assertAppErrorShape(err);
  assert.match(err.message, /price/i);
});

// ---------------------------------------------------------------------------
// src/index.js — attach()
// ---------------------------------------------------------------------------

test('attach without a requirement throws MISSING_OR_INVALID_REQUIREMENT (NEEDS_DOCUMENTATION, not retryable)', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone', price: 100 });
  const accessory = model.createAccessory(db, { name: 'Case', price: 9 });

  assertServiceError(
    () => model.attach(db, { deviceId: device.id, accessoryId: accessory.id }),
    {
      reasonCode: REASON_CODE.MISSING_OR_INVALID_REQUIREMENT,
      category: CATEGORY.NEEDS_DOCUMENTATION,
      detail: /requirement|required|optional/i,
    },
  );
});

test('attach with an invalid requirement value throws MISSING_OR_INVALID_REQUIREMENT', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone', price: 100 });
  const accessory = model.createAccessory(db, { name: 'Case', price: 9 });

  assertServiceError(
    () =>
      model.attach(db, {
        deviceId: device.id,
        accessoryId: accessory.id,
        requirement: 'MAYBE',
      }),
    {
      reasonCode: REASON_CODE.MISSING_OR_INVALID_REQUIREMENT,
      category: CATEGORY.NEEDS_DOCUMENTATION,
      detail: /requirement/i,
    },
  );
});

test('attach without a deviceId throws MISSING_OR_INVALID_DEVICE_ID (RETRYABLE)', () => {
  const db = freshDb();
  const accessory = model.createAccessory(db, { name: 'Case', price: 9 });

  assertServiceError(
    () =>
      model.attach(db, {
        accessoryId: accessory.id,
        requirement: model.REQUIREMENT.OPTIONAL,
      }),
    {
      reasonCode: REASON_CODE.MISSING_OR_INVALID_DEVICE_ID,
      category: CATEGORY.RETRYABLE,
      detail: /device/i,
    },
  );
});

test('attach referencing neither a bundle nor an accessory throws NO_ADDON_REFERENCED (RETRYABLE)', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone', price: 100 });

  assertServiceError(
    () =>
      model.attach(db, {
        deviceId: device.id,
        requirement: model.REQUIREMENT.OPTIONAL,
      }),
    {
      reasonCode: REASON_CODE.NO_ADDON_REFERENCED,
      category: CATEGORY.RETRYABLE,
      detail: /(bundle|accessory|add-?on)/i,
    },
  );
});

// ---------------------------------------------------------------------------
// src/index.js — getAttachmentsForDevice / getAttachmentsForDevicePlan filter
// ---------------------------------------------------------------------------

test('getAttachmentsForDevice with an invalid requirement filter throws INVALID_REQUIREMENT_FILTER (NEEDS_DOCUMENTATION)', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone', price: 100 });

  assertServiceError(
    () => model.getAttachmentsForDevice(db, device.id, { requirement: 'SOMETIMES' }),
    {
      reasonCode: REASON_CODE.INVALID_REQUIREMENT_FILTER,
      category: CATEGORY.NEEDS_DOCUMENTATION,
      detail: /requirement/i,
    },
  );
});

test('getAttachmentsForDevicePlan with an invalid requirement filter throws INVALID_REQUIREMENT_FILTER', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone', price: 100 });
  const plan = model.createPlan(db, { name: 'Unlimited', price: 40 });

  assertServiceError(
    () =>
      model.getAttachmentsForDevicePlan(db, device.id, plan.id, { requirement: 'SOMETIMES' }),
    {
      reasonCode: REASON_CODE.INVALID_REQUIREMENT_FILTER,
      category: CATEGORY.NEEDS_DOCUMENTATION,
      detail: /requirement/i,
    },
  );
});

// ---------------------------------------------------------------------------
// src/cart.js — recalculateCart()
// ---------------------------------------------------------------------------

test('recalculateCart without a deviceId throws MISSING_OR_INVALID_DEVICE_ID with the cart PRESERVED', () => {
  const db = freshDb();

  const err = assertServiceError(
    () => model.recalculateCart(db, { selectedOptionalAttachmentIds: [] }),
    {
      reasonCode: REASON_CODE.MISSING_OR_INVALID_DEVICE_ID,
      category: CATEGORY.RETRYABLE,
      detail: /device/i,
    },
  );
  // Cart recalculation is stateless — the in-progress cart survives the failure.
  assert.equal(err.statePreservation.cart, STATE_PRESERVATION.PRESERVED);
});

test('recalculateCart for an unknown device throws UNKNOWN_DEVICE with the cart PRESERVED', () => {
  const db = freshDb();

  const err = assertServiceError(
    () => model.recalculateCart(db, { deviceId: 999999, selectedOptionalAttachmentIds: [] }),
    {
      reasonCode: REASON_CODE.UNKNOWN_DEVICE,
      category: CATEGORY.RETRYABLE,
      detail: /device/i,
    },
  );
  assert.equal(err.statePreservation.cart, STATE_PRESERVATION.PRESERVED);
});

// ---------------------------------------------------------------------------
// src/recommend.js — recommend()
// ---------------------------------------------------------------------------

test('recommend without a deviceId throws MISSING_OR_INVALID_DEVICE_ID (RETRYABLE)', () => {
  const db = freshDb();

  assertServiceError(
    () => model.recommend(db, { customer: { id: 1, type: 'prepaid' } }),
    {
      reasonCode: REASON_CODE.MISSING_OR_INVALID_DEVICE_ID,
      category: CATEGORY.RETRYABLE,
      detail: /device/i,
    },
  );
});

test('recommend without a customer context throws MISSING_CUSTOMER_CONTEXT (NEEDS_SUPPORT, not retryable)', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone', price: 100 });

  assertServiceError(
    () => model.recommend(db, { deviceId: device.id }),
    {
      reasonCode: REASON_CODE.MISSING_CUSTOMER_CONTEXT,
      category: CATEGORY.NEEDS_SUPPORT,
      detail: /customer/i,
    },
  );
});

// ---------------------------------------------------------------------------
// No service path throws a bare Error anymore
// ---------------------------------------------------------------------------

test('no covered service path throws a bare (non-AppError) Error', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone', price: 100 });
  const plan = model.createPlan(db, { name: 'Unlimited', price: 40 });
  const accessory = model.createAccessory(db, { name: 'Case', price: 9 });

  const failingCalls = [
    () => model.createDevice(db, { price: 10 }), // missing name
    () => model.createDevice(db, { name: 'X', price: -5 }), // bad price
    () => model.attach(db, { deviceId: device.id, accessoryId: accessory.id }), // no requirement
    () =>
      model.attach(db, {
        deviceId: device.id,
        accessoryId: accessory.id,
        requirement: 'NOPE',
      }), // bad requirement
    () => model.attach(db, { accessoryId: accessory.id, requirement: model.REQUIREMENT.OPTIONAL }), // no deviceId
    () => model.attach(db, { deviceId: device.id, requirement: model.REQUIREMENT.OPTIONAL }), // no add-on
    () => model.getAttachmentsForDevice(db, device.id, { requirement: 'NOPE' }),
    () => model.getAttachmentsForDevicePlan(db, device.id, plan.id, { requirement: 'NOPE' }),
    () => model.recalculateCart(db, {}), // no deviceId
    () => model.recalculateCart(db, { deviceId: 999999 }), // unknown device
    () => model.recommend(db, { customer: {} }), // no deviceId
    () => model.recommend(db, { deviceId: device.id }), // no customer
  ];

  for (const call of failingCalls) {
    const err = capture(call);
    assert.ok(
      err instanceof AppError,
      `expected an AppError, got ${err && err.constructor && err.constructor.name}: ${err && err.message}`,
    );
  }
});
