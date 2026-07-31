'use strict';

// Acceptance tests (unit): the shared order-status + fulfilment/activation
// next-step vocabulary.
//
// `src/order-status.js` mirrors the `src/requirement.js` / `src/status.js`
// pattern and is the single source of truth for the order-lifecycle status
// strings and the "what happens next" step descriptors surfaced to the
// customer (confirmation / status-timeline screens). It exports:
//
//   ORDER_STATUS         frozen enum: PENDING, CONFIRMED, ACTIVATING, FAILED
//   ORDER_STATUS_VALUES  frozen array of the enum values
//   isValidOrderStatus(value) -> boolean
//
//   ORDER_NEXT_STEPS     frozen object keyed by every ORDER_STATUS value; each
//                        value is a frozen "next-expected step" descriptor of
//                        the shape:
//                          {
//                            step:    <string>  machine code for the next step
//                            message: <string>  non-empty user-facing message
//                            async:   <boolean> true when activation/fulfilment
//                                               continues asynchronously (the
//                                               customer must wait / poll rather
//                                               than take immediate action)
//                          }
//
// The async-continuation descriptors (async === true) cover the states where
// fulfilment or activation proceeds in the background: PENDING (awaiting
// payment/provider confirmation) and ACTIVATING (activation in progress).
//
// Every enum/helper/descriptor set is also re-exported from src/index.js.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const orderStatus = require('../src/order-status.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// ORDER_STATUS enum
// ---------------------------------------------------------------------------

test('exports an ORDER_STATUS object', () => {
  assert.equal(typeof orderStatus.ORDER_STATUS, 'object');
  assert.notEqual(orderStatus.ORDER_STATUS, null);
});

test('ORDER_STATUS has exactly the four defined members mapping to their own names', () => {
  assert.deepEqual(orderStatus.ORDER_STATUS, {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    ACTIVATING: 'ACTIVATING',
    FAILED: 'FAILED',
  });
});

test('ORDER_STATUS is frozen', () => {
  assert.equal(Object.isFrozen(orderStatus.ORDER_STATUS), true);
});

test('ORDER_STATUS cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    orderStatus.ORDER_STATUS.PENDING = 'CHANGED';
  });
  assert.equal(orderStatus.ORDER_STATUS.PENDING, 'PENDING');
});

test('ORDER_STATUS cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    orderStatus.ORDER_STATUS.CANCELLED = 'CANCELLED';
  });
  assert.equal(orderStatus.ORDER_STATUS.CANCELLED, undefined);
});

// ---------------------------------------------------------------------------
// ORDER_STATUS_VALUES
// ---------------------------------------------------------------------------

test('exports ORDER_STATUS_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(orderStatus.ORDER_STATUS_VALUES));
  assert.deepEqual(
    [...orderStatus.ORDER_STATUS_VALUES].sort(),
    ['ACTIVATING', 'CONFIRMED', 'FAILED', 'PENDING'],
  );
});

test('ORDER_STATUS_VALUES matches Object.values(ORDER_STATUS)', () => {
  assert.deepEqual(
    [...orderStatus.ORDER_STATUS_VALUES],
    Object.values(orderStatus.ORDER_STATUS),
  );
});

test('ORDER_STATUS_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(orderStatus.ORDER_STATUS_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidOrderStatus
// ---------------------------------------------------------------------------

test('exports isValidOrderStatus as a function', () => {
  assert.equal(typeof orderStatus.isValidOrderStatus, 'function');
});

test('isValidOrderStatus accepts every ORDER_STATUS value', () => {
  for (const value of Object.values(orderStatus.ORDER_STATUS)) {
    assert.equal(orderStatus.isValidOrderStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidOrderStatus rejects unknown / malformed values', () => {
  assert.equal(orderStatus.isValidOrderStatus('CANCELLED'), false);
  assert.equal(orderStatus.isValidOrderStatus('pending'), false);
  assert.equal(orderStatus.isValidOrderStatus(''), false);
  assert.equal(orderStatus.isValidOrderStatus(undefined), false);
  assert.equal(orderStatus.isValidOrderStatus(null), false);
  assert.equal(orderStatus.isValidOrderStatus(0), false);
});

test('isValidOrderStatus does not accept a payment-only or activation-only value', () => {
  // Order status is its own vocabulary, distinct from PAYMENT_STATUS /
  // ACTIVATION_STATUS in src/status.js.
  assert.equal(orderStatus.isValidOrderStatus('INITIATED'), false);
  assert.equal(orderStatus.isValidOrderStatus('NOT_STARTED'), false);
  assert.equal(orderStatus.isValidOrderStatus('ACTIVATED'), false);
});

// ---------------------------------------------------------------------------
// ORDER_NEXT_STEPS: next-expected fulfilment/activation step descriptors
// ---------------------------------------------------------------------------

test('exports an ORDER_NEXT_STEPS object', () => {
  assert.equal(typeof orderStatus.ORDER_NEXT_STEPS, 'object');
  assert.notEqual(orderStatus.ORDER_NEXT_STEPS, null);
});

test('ORDER_NEXT_STEPS is frozen', () => {
  assert.equal(Object.isFrozen(orderStatus.ORDER_NEXT_STEPS), true);
});

test('ORDER_NEXT_STEPS has a descriptor for exactly every ORDER_STATUS value', () => {
  assert.deepEqual(
    Object.keys(orderStatus.ORDER_NEXT_STEPS).sort(),
    [...orderStatus.ORDER_STATUS_VALUES].sort(),
  );
});

test('every ORDER_NEXT_STEPS descriptor is a frozen object shaped as documented', () => {
  for (const value of orderStatus.ORDER_STATUS_VALUES) {
    const descriptor = orderStatus.ORDER_NEXT_STEPS[value];
    assert.equal(typeof descriptor, 'object', `descriptor for ${value} should be an object`);
    assert.notEqual(descriptor, null, `descriptor for ${value} should not be null`);
    assert.equal(Object.isFrozen(descriptor), true, `descriptor for ${value} should be frozen`);

    // step: a non-empty machine code string.
    assert.equal(typeof descriptor.step, 'string', `${value}.step should be a string`);
    assert.notEqual(descriptor.step.trim(), '', `${value}.step should be non-empty`);

    // message: a non-empty user-facing string.
    assert.equal(typeof descriptor.message, 'string', `${value}.message should be a string`);
    assert.notEqual(descriptor.message.trim(), '', `${value}.message should be non-empty`);

    // async: a boolean flag.
    assert.equal(typeof descriptor.async, 'boolean', `${value}.async should be a boolean`);
  }
});

test('ORDER_NEXT_STEPS descriptors carry the documented next-step codes', () => {
  assert.equal(orderStatus.ORDER_NEXT_STEPS.PENDING.step, 'AWAIT_PAYMENT_CONFIRMATION');
  assert.equal(orderStatus.ORDER_NEXT_STEPS.CONFIRMED.step, 'BEGIN_ACTIVATION');
  assert.equal(orderStatus.ORDER_NEXT_STEPS.ACTIVATING.step, 'AWAIT_ACTIVATION_COMPLETION');
  assert.equal(orderStatus.ORDER_NEXT_STEPS.FAILED.step, 'RESOLVE_FAILURE');
});

// ---------------------------------------------------------------------------
// Async-continuation semantics
// ---------------------------------------------------------------------------

test('PENDING and ACTIVATING are flagged as async-continuation steps', () => {
  assert.equal(orderStatus.ORDER_NEXT_STEPS.PENDING.async, true);
  assert.equal(orderStatus.ORDER_NEXT_STEPS.ACTIVATING.async, true);
});

test('CONFIRMED and FAILED are not async-continuation steps', () => {
  assert.equal(orderStatus.ORDER_NEXT_STEPS.CONFIRMED.async, false);
  assert.equal(orderStatus.ORDER_NEXT_STEPS.FAILED.async, false);
});

test('the async-continuation descriptor set is exactly PENDING and ACTIVATING', () => {
  const asyncStates = orderStatus.ORDER_STATUS_VALUES.filter(
    (value) => orderStatus.ORDER_NEXT_STEPS[value].async === true,
  );
  assert.deepEqual([...asyncStates].sort(), ['ACTIVATING', 'PENDING']);
});

test('at least one async-continuation descriptor is present', () => {
  const asyncDescriptors = orderStatus.ORDER_STATUS_VALUES
    .map((value) => orderStatus.ORDER_NEXT_STEPS[value])
    .filter((descriptor) => descriptor.async === true);
  assert.ok(asyncDescriptors.length >= 1, 'expected at least one async-continuation step');
  for (const descriptor of asyncDescriptors) {
    assert.notEqual(descriptor.message.trim(), '', 'async step should carry a user-facing message');
  }
});

// ---------------------------------------------------------------------------
// Re-export from the model API (src/index.js)
// ---------------------------------------------------------------------------

test('ORDER_STATUS is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ORDER_STATUS, orderStatus.ORDER_STATUS);
});

test('ORDER_STATUS_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ORDER_STATUS_VALUES, orderStatus.ORDER_STATUS_VALUES);
});

test('isValidOrderStatus is re-exported from src/index.js', () => {
  assert.equal(model.isValidOrderStatus, orderStatus.isValidOrderStatus);
});

test('ORDER_NEXT_STEPS is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ORDER_NEXT_STEPS, orderStatus.ORDER_NEXT_STEPS);
});

// ---------------------------------------------------------------------------
// Co-existence with the existing REQUIREMENT vocabulary
// ---------------------------------------------------------------------------

test('adding order-status exports does not disturb the REQUIREMENT re-export', () => {
  assert.equal(typeof model.REQUIREMENT, 'object');
  assert.notEqual(model.REQUIREMENT, null);
  assert.equal(model.isValidRequirement('REQUIRED'), true);
});
