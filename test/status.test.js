'use strict';

// Acceptance tests (unit): the shared payment/activation status vocabulary.
//
// `src/status.js` mirrors the `src/requirement.js` pattern and is the single
// source of truth for the status strings used by schema CHECK constraints, the
// payment/activation services, and the retry-messaging helper. It exports:
//
//   PAYMENT_STATUS         frozen enum: INITIATED, PENDING, FAILED, CONFIRMED
//   PAYMENT_STATUS_VALUES  frozen array of the enum values
//   isValidPaymentStatus(value) -> boolean
//
//   ACTIVATION_STATUS         frozen enum: NOT_STARTED, PENDING, ACTIVATED, FAILED
//   ACTIVATION_STATUS_VALUES  frozen array of the enum values
//   isValidActivationStatus(value) -> boolean
//
// Every enum/helper is also re-exported from src/index.js.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const status = require('../src/status.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// PAYMENT_STATUS enum
// ---------------------------------------------------------------------------

test('exports a PAYMENT_STATUS object', () => {
  assert.equal(typeof status.PAYMENT_STATUS, 'object');
  assert.notEqual(status.PAYMENT_STATUS, null);
});

test('PAYMENT_STATUS has exactly the four defined members mapping to their own names', () => {
  assert.deepEqual(status.PAYMENT_STATUS, {
    INITIATED: 'INITIATED',
    PENDING: 'PENDING',
    FAILED: 'FAILED',
    CONFIRMED: 'CONFIRMED',
  });
});

test('PAYMENT_STATUS is frozen', () => {
  assert.equal(Object.isFrozen(status.PAYMENT_STATUS), true);
});

test('PAYMENT_STATUS cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    status.PAYMENT_STATUS.INITIATED = 'CHANGED';
  });
  assert.equal(status.PAYMENT_STATUS.INITIATED, 'INITIATED');
});

test('PAYMENT_STATUS cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    status.PAYMENT_STATUS.CANCELLED = 'CANCELLED';
  });
  assert.equal(status.PAYMENT_STATUS.CANCELLED, undefined);
});

// ---------------------------------------------------------------------------
// PAYMENT_STATUS_VALUES
// ---------------------------------------------------------------------------

test('exports PAYMENT_STATUS_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(status.PAYMENT_STATUS_VALUES));
  assert.deepEqual(
    [...status.PAYMENT_STATUS_VALUES].sort(),
    ['CONFIRMED', 'FAILED', 'INITIATED', 'PENDING'],
  );
});

test('PAYMENT_STATUS_VALUES matches Object.values(PAYMENT_STATUS)', () => {
  assert.deepEqual(
    [...status.PAYMENT_STATUS_VALUES],
    Object.values(status.PAYMENT_STATUS),
  );
});

test('PAYMENT_STATUS_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(status.PAYMENT_STATUS_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidPaymentStatus
// ---------------------------------------------------------------------------

test('exports isValidPaymentStatus as a function', () => {
  assert.equal(typeof status.isValidPaymentStatus, 'function');
});

test('isValidPaymentStatus accepts every PAYMENT_STATUS value', () => {
  for (const value of Object.values(status.PAYMENT_STATUS)) {
    assert.equal(status.isValidPaymentStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidPaymentStatus rejects unknown / malformed values', () => {
  assert.equal(status.isValidPaymentStatus('CANCELLED'), false);
  assert.equal(status.isValidPaymentStatus('initiated'), false);
  assert.equal(status.isValidPaymentStatus(''), false);
  assert.equal(status.isValidPaymentStatus(undefined), false);
  assert.equal(status.isValidPaymentStatus(null), false);
  assert.equal(status.isValidPaymentStatus(0), false);
});

test('isValidPaymentStatus does not accept an activation-only value', () => {
  assert.equal(status.isValidPaymentStatus('NOT_STARTED'), false);
  assert.equal(status.isValidPaymentStatus('ACTIVATED'), false);
});

// ---------------------------------------------------------------------------
// ACTIVATION_STATUS enum
// ---------------------------------------------------------------------------

test('exports an ACTIVATION_STATUS object', () => {
  assert.equal(typeof status.ACTIVATION_STATUS, 'object');
  assert.notEqual(status.ACTIVATION_STATUS, null);
});

test('ACTIVATION_STATUS has exactly the four defined members mapping to their own names', () => {
  assert.deepEqual(status.ACTIVATION_STATUS, {
    NOT_STARTED: 'NOT_STARTED',
    PENDING: 'PENDING',
    ACTIVATED: 'ACTIVATED',
    FAILED: 'FAILED',
  });
});

test('ACTIVATION_STATUS is frozen', () => {
  assert.equal(Object.isFrozen(status.ACTIVATION_STATUS), true);
});

test('ACTIVATION_STATUS cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    status.ACTIVATION_STATUS.NOT_STARTED = 'CHANGED';
  });
  assert.equal(status.ACTIVATION_STATUS.NOT_STARTED, 'NOT_STARTED');
});

test('ACTIVATION_STATUS cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    status.ACTIVATION_STATUS.SUSPENDED = 'SUSPENDED';
  });
  assert.equal(status.ACTIVATION_STATUS.SUSPENDED, undefined);
});

// ---------------------------------------------------------------------------
// ACTIVATION_STATUS_VALUES
// ---------------------------------------------------------------------------

test('exports ACTIVATION_STATUS_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(status.ACTIVATION_STATUS_VALUES));
  assert.deepEqual(
    [...status.ACTIVATION_STATUS_VALUES].sort(),
    ['ACTIVATED', 'FAILED', 'NOT_STARTED', 'PENDING'],
  );
});

test('ACTIVATION_STATUS_VALUES matches Object.values(ACTIVATION_STATUS)', () => {
  assert.deepEqual(
    [...status.ACTIVATION_STATUS_VALUES],
    Object.values(status.ACTIVATION_STATUS),
  );
});

test('ACTIVATION_STATUS_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(status.ACTIVATION_STATUS_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidActivationStatus
// ---------------------------------------------------------------------------

test('exports isValidActivationStatus as a function', () => {
  assert.equal(typeof status.isValidActivationStatus, 'function');
});

test('isValidActivationStatus accepts every ACTIVATION_STATUS value', () => {
  for (const value of Object.values(status.ACTIVATION_STATUS)) {
    assert.equal(status.isValidActivationStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidActivationStatus rejects unknown / malformed values', () => {
  assert.equal(status.isValidActivationStatus('SUSPENDED'), false);
  assert.equal(status.isValidActivationStatus('activated'), false);
  assert.equal(status.isValidActivationStatus(''), false);
  assert.equal(status.isValidActivationStatus(undefined), false);
  assert.equal(status.isValidActivationStatus(null), false);
  assert.equal(status.isValidActivationStatus(0), false);
});

test('isValidActivationStatus does not accept a payment-only value', () => {
  assert.equal(status.isValidActivationStatus('INITIATED'), false);
  assert.equal(status.isValidActivationStatus('CONFIRMED'), false);
});

// ---------------------------------------------------------------------------
// Re-export from the model API (src/index.js)
// ---------------------------------------------------------------------------

test('PAYMENT_STATUS is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.PAYMENT_STATUS, status.PAYMENT_STATUS);
});

test('PAYMENT_STATUS_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.PAYMENT_STATUS_VALUES, status.PAYMENT_STATUS_VALUES);
});

test('isValidPaymentStatus is re-exported from src/index.js', () => {
  assert.equal(model.isValidPaymentStatus, status.isValidPaymentStatus);
});

test('ACTIVATION_STATUS is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ACTIVATION_STATUS, status.ACTIVATION_STATUS);
});

test('ACTIVATION_STATUS_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ACTIVATION_STATUS_VALUES, status.ACTIVATION_STATUS_VALUES);
});

test('isValidActivationStatus is re-exported from src/index.js', () => {
  assert.equal(model.isValidActivationStatus, status.isValidActivationStatus);
});
