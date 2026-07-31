'use strict';

// Acceptance tests (unit): the shared order/activation status vocabulary.
//
// `src/status.js` follows the `src/requirement.js` pattern and is the single
// source of truth for the status strings used by schema CHECK constraints and
// the application layer. It models the journey as a set of PHASES, each with
// its own meaningful state values (NOT a generic "pending only" vocabulary):
//
//   STATUS_PHASES              frozen enum: PAYMENT, VERIFICATION, FULFILMENT, ACTIVATION
//
//   PAYMENT_STATUS             frozen enum: PENDING, AUTHORIZED, FAILED
//   VERIFICATION_STATUS        frozen enum: NOT_REQUIRED, PENDING, PASSED, FAILED
//   FULFILMENT_STATUS          frozen enum: PENDING, IN_PROGRESS, COMPLETED
//   ACTIVATION_STATUS          frozen enum: PENDING, BLOCKED, ACTIVE, FAILED
//
//   <PHASE>_STATUS_VALUES      frozen array of each phase's enum values
//
//   isValidPaymentStatus(value)      -> boolean
//   isValidVerificationStatus(value) -> boolean
//   isValidFulfilmentStatus(value)   -> boolean
//   isValidActivationStatus(value)   -> boolean
//
// Every enum/list/helper is also re-exported from src/index.js.
//
// These tests are written BEFORE the module is (re)implemented and must fail
// until the phase-based vocabulary exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const status = require('../src/status.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// STATUS_PHASES enum
// ---------------------------------------------------------------------------

test('exports a STATUS_PHASES object', () => {
  assert.equal(typeof status.STATUS_PHASES, 'object');
  assert.notEqual(status.STATUS_PHASES, null);
});

test('STATUS_PHASES has exactly the four phases mapping to their own names', () => {
  assert.deepEqual(status.STATUS_PHASES, {
    PAYMENT: 'PAYMENT',
    VERIFICATION: 'VERIFICATION',
    FULFILMENT: 'FULFILMENT',
    ACTIVATION: 'ACTIVATION',
  });
});

test('STATUS_PHASES is frozen', () => {
  assert.equal(Object.isFrozen(status.STATUS_PHASES), true);
});

test('STATUS_PHASES cannot be mutated or extended', () => {
  assert.throws(() => {
    'use strict';
    status.STATUS_PHASES.PAYMENT = 'CHANGED';
  });
  assert.throws(() => {
    'use strict';
    status.STATUS_PHASES.BILLING = 'BILLING';
  });
  assert.equal(status.STATUS_PHASES.PAYMENT, 'PAYMENT');
  assert.equal(status.STATUS_PHASES.BILLING, undefined);
});

// ---------------------------------------------------------------------------
// PAYMENT_STATUS: PENDING / AUTHORIZED / FAILED
// ---------------------------------------------------------------------------

test('PAYMENT_STATUS has exactly its three meaningful members', () => {
  assert.deepEqual(status.PAYMENT_STATUS, {
    PENDING: 'PENDING',
    AUTHORIZED: 'AUTHORIZED',
    FAILED: 'FAILED',
  });
});

test('PAYMENT_STATUS is frozen and cannot gain members', () => {
  assert.equal(Object.isFrozen(status.PAYMENT_STATUS), true);
  assert.throws(() => {
    'use strict';
    status.PAYMENT_STATUS.REFUNDED = 'REFUNDED';
  });
  assert.equal(status.PAYMENT_STATUS.REFUNDED, undefined);
});

test('PAYMENT_STATUS_VALUES is a frozen array matching Object.values(PAYMENT_STATUS)', () => {
  assert.ok(Array.isArray(status.PAYMENT_STATUS_VALUES));
  assert.equal(Object.isFrozen(status.PAYMENT_STATUS_VALUES), true);
  assert.deepEqual([...status.PAYMENT_STATUS_VALUES], Object.values(status.PAYMENT_STATUS));
  assert.deepEqual([...status.PAYMENT_STATUS_VALUES].sort(), ['AUTHORIZED', 'FAILED', 'PENDING']);
});

test('isValidPaymentStatus accepts every PAYMENT_STATUS value', () => {
  assert.equal(typeof status.isValidPaymentStatus, 'function');
  for (const value of Object.values(status.PAYMENT_STATUS)) {
    assert.equal(status.isValidPaymentStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidPaymentStatus rejects unknown / malformed values', () => {
  assert.equal(status.isValidPaymentStatus('REFUNDED'), false);
  assert.equal(status.isValidPaymentStatus('authorized'), false);
  assert.equal(status.isValidPaymentStatus(''), false);
  assert.equal(status.isValidPaymentStatus(undefined), false);
  assert.equal(status.isValidPaymentStatus(null), false);
  assert.equal(status.isValidPaymentStatus(0), false);
});

test('isValidPaymentStatus rejects states meaningful only to other phases', () => {
  assert.equal(status.isValidPaymentStatus('NOT_REQUIRED'), false);
  assert.equal(status.isValidPaymentStatus('IN_PROGRESS'), false);
  assert.equal(status.isValidPaymentStatus('ACTIVE'), false);
  assert.equal(status.isValidPaymentStatus('BLOCKED'), false);
});

// ---------------------------------------------------------------------------
// VERIFICATION_STATUS: NOT_REQUIRED / PENDING / PASSED / FAILED
// ---------------------------------------------------------------------------

test('VERIFICATION_STATUS has exactly its four meaningful members', () => {
  assert.deepEqual(status.VERIFICATION_STATUS, {
    NOT_REQUIRED: 'NOT_REQUIRED',
    PENDING: 'PENDING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
  });
});

test('VERIFICATION_STATUS is frozen and cannot gain members', () => {
  assert.equal(Object.isFrozen(status.VERIFICATION_STATUS), true);
  assert.throws(() => {
    'use strict';
    status.VERIFICATION_STATUS.REVIEW = 'REVIEW';
  });
  assert.equal(status.VERIFICATION_STATUS.REVIEW, undefined);
});

test('VERIFICATION_STATUS_VALUES is a frozen array matching Object.values(VERIFICATION_STATUS)', () => {
  assert.ok(Array.isArray(status.VERIFICATION_STATUS_VALUES));
  assert.equal(Object.isFrozen(status.VERIFICATION_STATUS_VALUES), true);
  assert.deepEqual(
    [...status.VERIFICATION_STATUS_VALUES],
    Object.values(status.VERIFICATION_STATUS),
  );
  assert.deepEqual(
    [...status.VERIFICATION_STATUS_VALUES].sort(),
    ['FAILED', 'NOT_REQUIRED', 'PASSED', 'PENDING'],
  );
});

test('isValidVerificationStatus accepts every VERIFICATION_STATUS value', () => {
  assert.equal(typeof status.isValidVerificationStatus, 'function');
  for (const value of Object.values(status.VERIFICATION_STATUS)) {
    assert.equal(status.isValidVerificationStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidVerificationStatus rejects unknown / malformed values', () => {
  assert.equal(status.isValidVerificationStatus('REVIEW'), false);
  assert.equal(status.isValidVerificationStatus('passed'), false);
  assert.equal(status.isValidVerificationStatus(''), false);
  assert.equal(status.isValidVerificationStatus(undefined), false);
  assert.equal(status.isValidVerificationStatus(null), false);
});

test('isValidVerificationStatus rejects states meaningful only to other phases', () => {
  assert.equal(status.isValidVerificationStatus('AUTHORIZED'), false);
  assert.equal(status.isValidVerificationStatus('IN_PROGRESS'), false);
  assert.equal(status.isValidVerificationStatus('ACTIVE'), false);
});

// ---------------------------------------------------------------------------
// FULFILMENT_STATUS: PENDING / IN_PROGRESS / COMPLETED
// ---------------------------------------------------------------------------

test('FULFILMENT_STATUS has exactly its three meaningful members', () => {
  assert.deepEqual(status.FULFILMENT_STATUS, {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
  });
});

test('FULFILMENT_STATUS is frozen and cannot gain members', () => {
  assert.equal(Object.isFrozen(status.FULFILMENT_STATUS), true);
  assert.throws(() => {
    'use strict';
    status.FULFILMENT_STATUS.CANCELLED = 'CANCELLED';
  });
  assert.equal(status.FULFILMENT_STATUS.CANCELLED, undefined);
});

test('FULFILMENT_STATUS_VALUES is a frozen array matching Object.values(FULFILMENT_STATUS)', () => {
  assert.ok(Array.isArray(status.FULFILMENT_STATUS_VALUES));
  assert.equal(Object.isFrozen(status.FULFILMENT_STATUS_VALUES), true);
  assert.deepEqual([...status.FULFILMENT_STATUS_VALUES], Object.values(status.FULFILMENT_STATUS));
  assert.deepEqual(
    [...status.FULFILMENT_STATUS_VALUES].sort(),
    ['COMPLETED', 'IN_PROGRESS', 'PENDING'],
  );
});

test('isValidFulfilmentStatus accepts every FULFILMENT_STATUS value', () => {
  assert.equal(typeof status.isValidFulfilmentStatus, 'function');
  for (const value of Object.values(status.FULFILMENT_STATUS)) {
    assert.equal(status.isValidFulfilmentStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidFulfilmentStatus rejects unknown / malformed values', () => {
  assert.equal(status.isValidFulfilmentStatus('CANCELLED'), false);
  assert.equal(status.isValidFulfilmentStatus('completed'), false);
  assert.equal(status.isValidFulfilmentStatus(''), false);
  assert.equal(status.isValidFulfilmentStatus(undefined), false);
  assert.equal(status.isValidFulfilmentStatus(null), false);
});

test('isValidFulfilmentStatus rejects states meaningful only to other phases', () => {
  assert.equal(status.isValidFulfilmentStatus('AUTHORIZED'), false);
  assert.equal(status.isValidFulfilmentStatus('NOT_REQUIRED'), false);
  assert.equal(status.isValidFulfilmentStatus('ACTIVE'), false);
});

// ---------------------------------------------------------------------------
// ACTIVATION_STATUS: PENDING / BLOCKED / ACTIVE / FAILED
// ---------------------------------------------------------------------------

test('ACTIVATION_STATUS has exactly its four meaningful members', () => {
  assert.deepEqual(status.ACTIVATION_STATUS, {
    PENDING: 'PENDING',
    BLOCKED: 'BLOCKED',
    ACTIVE: 'ACTIVE',
    FAILED: 'FAILED',
  });
});

test('ACTIVATION_STATUS is frozen and cannot gain members', () => {
  assert.equal(Object.isFrozen(status.ACTIVATION_STATUS), true);
  assert.throws(() => {
    'use strict';
    status.ACTIVATION_STATUS.SUSPENDED = 'SUSPENDED';
  });
  assert.equal(status.ACTIVATION_STATUS.SUSPENDED, undefined);
});

test('ACTIVATION_STATUS_VALUES is a frozen array matching Object.values(ACTIVATION_STATUS)', () => {
  assert.ok(Array.isArray(status.ACTIVATION_STATUS_VALUES));
  assert.equal(Object.isFrozen(status.ACTIVATION_STATUS_VALUES), true);
  assert.deepEqual([...status.ACTIVATION_STATUS_VALUES], Object.values(status.ACTIVATION_STATUS));
  assert.deepEqual(
    [...status.ACTIVATION_STATUS_VALUES].sort(),
    ['ACTIVE', 'BLOCKED', 'FAILED', 'PENDING'],
  );
});

test('isValidActivationStatus accepts every ACTIVATION_STATUS value', () => {
  assert.equal(typeof status.isValidActivationStatus, 'function');
  for (const value of Object.values(status.ACTIVATION_STATUS)) {
    assert.equal(status.isValidActivationStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidActivationStatus rejects unknown / malformed values', () => {
  assert.equal(status.isValidActivationStatus('SUSPENDED'), false);
  assert.equal(status.isValidActivationStatus('active'), false);
  assert.equal(status.isValidActivationStatus(''), false);
  assert.equal(status.isValidActivationStatus(undefined), false);
  assert.equal(status.isValidActivationStatus(null), false);
});

test('isValidActivationStatus rejects states meaningful only to other phases', () => {
  assert.equal(status.isValidActivationStatus('AUTHORIZED'), false);
  assert.equal(status.isValidActivationStatus('NOT_REQUIRED'), false);
  assert.equal(status.isValidActivationStatus('IN_PROGRESS'), false);
  assert.equal(status.isValidActivationStatus('COMPLETED'), false);
});

// ---------------------------------------------------------------------------
// Cross-phase distinctness: this is NOT a generic "pending only" vocabulary
// ---------------------------------------------------------------------------

test('each phase carries meaningful states beyond a shared PENDING', () => {
  // PENDING is the only value shared by all four phases; every phase must add
  // its own distinct, meaningful states.
  const only = (arr, shared) => [...arr].filter((v) => !shared.includes(v));
  const SHARED = ['PENDING'];
  assert.deepEqual(only(status.PAYMENT_STATUS_VALUES, SHARED).sort(), ['AUTHORIZED', 'FAILED']);
  assert.deepEqual(
    only(status.VERIFICATION_STATUS_VALUES, SHARED).sort(),
    ['FAILED', 'NOT_REQUIRED', 'PASSED'],
  );
  assert.deepEqual(
    only(status.FULFILMENT_STATUS_VALUES, SHARED).sort(),
    ['COMPLETED', 'IN_PROGRESS'],
  );
  assert.deepEqual(
    only(status.ACTIVATION_STATUS_VALUES, SHARED).sort(),
    ['ACTIVE', 'BLOCKED', 'FAILED'],
  );
});

test('PENDING is a valid state in every phase', () => {
  assert.equal(status.isValidPaymentStatus('PENDING'), true);
  assert.equal(status.isValidVerificationStatus('PENDING'), true);
  assert.equal(status.isValidFulfilmentStatus('PENDING'), true);
  assert.equal(status.isValidActivationStatus('PENDING'), true);
});

// ---------------------------------------------------------------------------
// Re-export from the model API (src/index.js) — same references
// ---------------------------------------------------------------------------

test('STATUS_PHASES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.STATUS_PHASES, status.STATUS_PHASES);
});

test('each phase enum is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.PAYMENT_STATUS, status.PAYMENT_STATUS);
  assert.equal(model.VERIFICATION_STATUS, status.VERIFICATION_STATUS);
  assert.equal(model.FULFILMENT_STATUS, status.FULFILMENT_STATUS);
  assert.equal(model.ACTIVATION_STATUS, status.ACTIVATION_STATUS);
});

test('each phase value list is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.PAYMENT_STATUS_VALUES, status.PAYMENT_STATUS_VALUES);
  assert.equal(model.VERIFICATION_STATUS_VALUES, status.VERIFICATION_STATUS_VALUES);
  assert.equal(model.FULFILMENT_STATUS_VALUES, status.FULFILMENT_STATUS_VALUES);
  assert.equal(model.ACTIVATION_STATUS_VALUES, status.ACTIVATION_STATUS_VALUES);
});

test('each isValid* helper is re-exported from src/index.js', () => {
  assert.equal(model.isValidPaymentStatus, status.isValidPaymentStatus);
  assert.equal(model.isValidVerificationStatus, status.isValidVerificationStatus);
  assert.equal(model.isValidFulfilmentStatus, status.isValidFulfilmentStatus);
  assert.equal(model.isValidActivationStatus, status.isValidActivationStatus);
});
