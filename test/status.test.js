'use strict';

// Acceptance tests (unit): the shared order/activation status vocabulary.
//
// `src/status.js` mirrors the `src/requirement.js` pattern and is the single
// source of truth for the status strings consumed by the schema CHECK
// constraints and the service layer. Per the authoritative LLD contract it
// exposes TWO frozen vocabularies:
//
//   MILESTONE            frozen enum of the journey domains the status timeline
//                        aggregates: PAYMENT, VERIFICATION, FULFILMENT, ACTIVATION
//   STATUS_STATE         frozen enum of the meaningful states a milestone can be
//                        in — deliberately richer than a generic "pending":
//                        PENDING, IN_PROGRESS, COMPLETE, BLOCKED, FAILED
//
//   MILESTONE_VALUES     frozen array === Object.values(MILESTONE)
//   STATUS_STATE_VALUES  frozen array === Object.values(STATUS_STATE)
//
//   isValidMilestone(value)    -> boolean
//   isValidStatusState(value)  -> boolean
//
// These tests are written BEFORE the module is (re)implemented and must FAIL
// until the MILESTONE / STATUS_STATE vocabulary exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const status = require('../src/status.js');

// ---------------------------------------------------------------------------
// MILESTONE map
// ---------------------------------------------------------------------------

test('exports a MILESTONE object', () => {
  assert.equal(typeof status.MILESTONE, 'object');
  assert.notEqual(status.MILESTONE, null);
});

test('MILESTONE covers exactly the four required domains, each mapping to its own name', () => {
  assert.deepEqual(status.MILESTONE, {
    PAYMENT: 'PAYMENT',
    VERIFICATION: 'VERIFICATION',
    FULFILMENT: 'FULFILMENT',
    ACTIVATION: 'ACTIVATION',
  });
});

test('MILESTONE is frozen', () => {
  assert.equal(Object.isFrozen(status.MILESTONE), true);
});

test('MILESTONE cannot be mutated or extended', () => {
  assert.throws(() => {
    'use strict';
    status.MILESTONE.PAYMENT = 'CHANGED';
  });
  assert.throws(() => {
    'use strict';
    status.MILESTONE.BILLING = 'BILLING';
  });
  assert.equal(status.MILESTONE.PAYMENT, 'PAYMENT');
  assert.equal(status.MILESTONE.BILLING, undefined);
});

test('MILESTONE_VALUES is a frozen array matching Object.values(MILESTONE)', () => {
  assert.ok(Array.isArray(status.MILESTONE_VALUES));
  assert.equal(Object.isFrozen(status.MILESTONE_VALUES), true);
  assert.deepEqual([...status.MILESTONE_VALUES], Object.values(status.MILESTONE));
  assert.deepEqual(
    [...status.MILESTONE_VALUES].sort(),
    ['ACTIVATION', 'FULFILMENT', 'PAYMENT', 'VERIFICATION'],
  );
});

test('isValidMilestone accepts every MILESTONE value', () => {
  assert.equal(typeof status.isValidMilestone, 'function');
  for (const value of Object.values(status.MILESTONE)) {
    assert.equal(status.isValidMilestone(value), true, `expected ${value} to be valid`);
  }
});

test('isValidMilestone rejects unknown / malformed values', () => {
  assert.equal(status.isValidMilestone('BILLING'), false);
  assert.equal(status.isValidMilestone('payment'), false);
  assert.equal(status.isValidMilestone('PAYMENT '), false);
  assert.equal(status.isValidMilestone(''), false);
  assert.equal(status.isValidMilestone(undefined), false);
  assert.equal(status.isValidMilestone(null), false);
  assert.equal(status.isValidMilestone(0), false);
  assert.equal(status.isValidMilestone({}), false);
});

test('isValidMilestone rejects status-state values (the two vocabularies are distinct)', () => {
  assert.equal(status.isValidMilestone('PENDING'), false);
  assert.equal(status.isValidMilestone('COMPLETE'), false);
  assert.equal(status.isValidMilestone('BLOCKED'), false);
});

// ---------------------------------------------------------------------------
// STATUS_STATE map
// ---------------------------------------------------------------------------

test('exports a STATUS_STATE object', () => {
  assert.equal(typeof status.STATUS_STATE, 'object');
  assert.notEqual(status.STATUS_STATE, null);
});

test('STATUS_STATE has exactly the five meaningful states, each mapping to its own name', () => {
  assert.deepEqual(status.STATUS_STATE, {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETE: 'COMPLETE',
    BLOCKED: 'BLOCKED',
    FAILED: 'FAILED',
  });
});

test('STATUS_STATE carries meaningful states beyond a generic PENDING', () => {
  const beyondPending = Object.values(status.STATUS_STATE).filter((v) => v !== 'PENDING');
  assert.deepEqual(beyondPending.sort(), ['BLOCKED', 'COMPLETE', 'FAILED', 'IN_PROGRESS']);
});

test('STATUS_STATE is frozen', () => {
  assert.equal(Object.isFrozen(status.STATUS_STATE), true);
});

test('STATUS_STATE cannot be mutated or extended', () => {
  assert.throws(() => {
    'use strict';
    status.STATUS_STATE.PENDING = 'CHANGED';
  });
  assert.throws(() => {
    'use strict';
    status.STATUS_STATE.CANCELLED = 'CANCELLED';
  });
  assert.equal(status.STATUS_STATE.PENDING, 'PENDING');
  assert.equal(status.STATUS_STATE.CANCELLED, undefined);
});

test('STATUS_STATE_VALUES is a frozen array matching Object.values(STATUS_STATE)', () => {
  assert.ok(Array.isArray(status.STATUS_STATE_VALUES));
  assert.equal(Object.isFrozen(status.STATUS_STATE_VALUES), true);
  assert.deepEqual([...status.STATUS_STATE_VALUES], Object.values(status.STATUS_STATE));
  assert.deepEqual(
    [...status.STATUS_STATE_VALUES].sort(),
    ['BLOCKED', 'COMPLETE', 'FAILED', 'IN_PROGRESS', 'PENDING'],
  );
});

test('isValidStatusState accepts every STATUS_STATE value', () => {
  assert.equal(typeof status.isValidStatusState, 'function');
  for (const value of Object.values(status.STATUS_STATE)) {
    assert.equal(status.isValidStatusState(value), true, `expected ${value} to be valid`);
  }
});

test('isValidStatusState rejects unknown / malformed values', () => {
  assert.equal(status.isValidStatusState('CANCELLED'), false);
  assert.equal(status.isValidStatusState('complete'), false);
  assert.equal(status.isValidStatusState('COMPLETE '), false);
  assert.equal(status.isValidStatusState(''), false);
  assert.equal(status.isValidStatusState(undefined), false);
  assert.equal(status.isValidStatusState(null), false);
  assert.equal(status.isValidStatusState(0), false);
  assert.equal(status.isValidStatusState({}), false);
});

test('isValidStatusState rejects milestone-domain values (the two vocabularies are distinct)', () => {
  assert.equal(status.isValidStatusState('PAYMENT'), false);
  assert.equal(status.isValidStatusState('VERIFICATION'), false);
  assert.equal(status.isValidStatusState('ACTIVATION'), false);
});

// ---------------------------------------------------------------------------
// Completeness / shape guarantees
// ---------------------------------------------------------------------------

test('MILESTONE has exactly four members', () => {
  assert.equal(Object.keys(status.MILESTONE).length, 4);
  assert.equal(status.MILESTONE_VALUES.length, 4);
});

test('STATUS_STATE has exactly five members', () => {
  assert.equal(Object.keys(status.STATUS_STATE).length, 5);
  assert.equal(status.STATUS_STATE_VALUES.length, 5);
});
