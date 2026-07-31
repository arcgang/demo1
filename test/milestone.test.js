'use strict';

// Acceptance tests (unit): the shared activation-milestone vocabulary and its
// ordering.
//
// `src/milestone.js` mirrors the `src/requirement.js` / `src/order-status.js`
// pattern and is the single source of truth for the canonical activation
// milestones and their per-milestone status values. It is consumed by the
// schema CHECK constraints, the activation orchestration service, and the
// status-timeline service. It exports:
//
//   ACTIVATION_MILESTONE           frozen enum of the three canonical
//                                  milestones:
//                                    PAYMENT_COMPLETE
//                                    VERIFICATION_COMPLETE
//                                    ACTIVATION_COMPLETE
//   ACTIVATION_MILESTONE_VALUES    frozen array of the enum values
//
//   ACTIVATION_MILESTONE_SEQUENCE  frozen, ORDERED array describing the order
//                                  the milestones are reached in:
//                                    payment -> verification -> activation
//                                  i.e. exactly:
//                                    ['PAYMENT_COMPLETE',
//                                     'VERIFICATION_COMPLETE',
//                                     'ACTIVATION_COMPLETE']
//
//   MILESTONE_STATUS               frozen enum of the allowed per-milestone
//                                  status values:
//                                    PENDING  (not yet reached)
//                                    BLOCKED  (a prerequisite is not satisfied)
//                                    COMPLETE (the milestone has been reached)
//   MILESTONE_STATUS_VALUES        frozen array of the status values
//
//   isValidMilestone(value) -> boolean
//   isValidStatus(value)    -> boolean
//
// Every enum/list/helper is also re-exported from src/index.js (same
// references).
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const milestone = require('../src/milestone.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// ACTIVATION_MILESTONE enum
// ---------------------------------------------------------------------------

test('exports an ACTIVATION_MILESTONE object', () => {
  assert.equal(typeof milestone.ACTIVATION_MILESTONE, 'object');
  assert.notEqual(milestone.ACTIVATION_MILESTONE, null);
});

test('ACTIVATION_MILESTONE has exactly the three defined members mapping to their own names', () => {
  assert.deepEqual(milestone.ACTIVATION_MILESTONE, {
    PAYMENT_COMPLETE: 'PAYMENT_COMPLETE',
    VERIFICATION_COMPLETE: 'VERIFICATION_COMPLETE',
    ACTIVATION_COMPLETE: 'ACTIVATION_COMPLETE',
  });
});

test('ACTIVATION_MILESTONE is frozen', () => {
  assert.equal(Object.isFrozen(milestone.ACTIVATION_MILESTONE), true);
});

test('ACTIVATION_MILESTONE cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    milestone.ACTIVATION_MILESTONE.PAYMENT_COMPLETE = 'CHANGED';
  });
  assert.equal(milestone.ACTIVATION_MILESTONE.PAYMENT_COMPLETE, 'PAYMENT_COMPLETE');
});

test('ACTIVATION_MILESTONE cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    milestone.ACTIVATION_MILESTONE.FULFILMENT_COMPLETE = 'FULFILMENT_COMPLETE';
  });
  assert.equal(milestone.ACTIVATION_MILESTONE.FULFILMENT_COMPLETE, undefined);
});

// ---------------------------------------------------------------------------
// ACTIVATION_MILESTONE_VALUES
// ---------------------------------------------------------------------------

test('exports ACTIVATION_MILESTONE_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(milestone.ACTIVATION_MILESTONE_VALUES));
  assert.deepEqual(
    [...milestone.ACTIVATION_MILESTONE_VALUES].sort(),
    ['ACTIVATION_COMPLETE', 'PAYMENT_COMPLETE', 'VERIFICATION_COMPLETE'],
  );
});

test('ACTIVATION_MILESTONE_VALUES matches Object.values(ACTIVATION_MILESTONE)', () => {
  assert.deepEqual(
    [...milestone.ACTIVATION_MILESTONE_VALUES],
    Object.values(milestone.ACTIVATION_MILESTONE),
  );
});

test('ACTIVATION_MILESTONE_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(milestone.ACTIVATION_MILESTONE_VALUES), true);
});

// ---------------------------------------------------------------------------
// ACTIVATION_MILESTONE_SEQUENCE: ordered payment -> verification -> activation
// ---------------------------------------------------------------------------

test('exports ACTIVATION_MILESTONE_SEQUENCE as an array', () => {
  assert.ok(Array.isArray(milestone.ACTIVATION_MILESTONE_SEQUENCE));
});

test('ACTIVATION_MILESTONE_SEQUENCE is frozen', () => {
  assert.equal(Object.isFrozen(milestone.ACTIVATION_MILESTONE_SEQUENCE), true);
});

test('ACTIVATION_MILESTONE_SEQUENCE lists the milestones in canonical order', () => {
  // The story ordering is: payment first, then verification, then activation.
  assert.deepEqual(
    [...milestone.ACTIVATION_MILESTONE_SEQUENCE],
    ['PAYMENT_COMPLETE', 'VERIFICATION_COMPLETE', 'ACTIVATION_COMPLETE'],
  );
});

test('ACTIVATION_MILESTONE_SEQUENCE orders each milestone by index', () => {
  const seq = milestone.ACTIVATION_MILESTONE_SEQUENCE;
  assert.equal(seq[0], milestone.ACTIVATION_MILESTONE.PAYMENT_COMPLETE);
  assert.equal(seq[1], milestone.ACTIVATION_MILESTONE.VERIFICATION_COMPLETE);
  assert.equal(seq[2], milestone.ACTIVATION_MILESTONE.ACTIVATION_COMPLETE);
  // payment precedes verification precedes activation
  assert.ok(seq.indexOf('PAYMENT_COMPLETE') < seq.indexOf('VERIFICATION_COMPLETE'));
  assert.ok(seq.indexOf('VERIFICATION_COMPLETE') < seq.indexOf('ACTIVATION_COMPLETE'));
});

test('ACTIVATION_MILESTONE_SEQUENCE contains exactly the enum values (no more, no fewer)', () => {
  assert.deepEqual(
    [...milestone.ACTIVATION_MILESTONE_SEQUENCE].sort(),
    [...milestone.ACTIVATION_MILESTONE_VALUES].sort(),
  );
  assert.equal(
    milestone.ACTIVATION_MILESTONE_SEQUENCE.length,
    milestone.ACTIVATION_MILESTONE_VALUES.length,
  );
});

// ---------------------------------------------------------------------------
// MILESTONE_STATUS: PENDING / BLOCKED / COMPLETE
// ---------------------------------------------------------------------------

test('exports a MILESTONE_STATUS object', () => {
  assert.equal(typeof milestone.MILESTONE_STATUS, 'object');
  assert.notEqual(milestone.MILESTONE_STATUS, null);
});

test('MILESTONE_STATUS has exactly its allowed per-milestone status members', () => {
  // A milestone is PENDING until reached, may be BLOCKED on an unmet
  // prerequisite, and is COMPLETE once reached.
  assert.deepEqual(milestone.MILESTONE_STATUS, {
    PENDING: 'PENDING',
    BLOCKED: 'BLOCKED',
    COMPLETE: 'COMPLETE',
  });
});

test('MILESTONE_STATUS exposes the mandated PENDING and BLOCKED values', () => {
  assert.equal(milestone.MILESTONE_STATUS.PENDING, 'PENDING');
  assert.equal(milestone.MILESTONE_STATUS.BLOCKED, 'BLOCKED');
});

test('MILESTONE_STATUS is frozen and cannot gain members', () => {
  assert.equal(Object.isFrozen(milestone.MILESTONE_STATUS), true);
  assert.throws(() => {
    'use strict';
    milestone.MILESTONE_STATUS.CANCELLED = 'CANCELLED';
  });
  assert.equal(milestone.MILESTONE_STATUS.CANCELLED, undefined);
});

test('MILESTONE_STATUS_VALUES is a frozen array matching Object.values(MILESTONE_STATUS)', () => {
  assert.ok(Array.isArray(milestone.MILESTONE_STATUS_VALUES));
  assert.equal(Object.isFrozen(milestone.MILESTONE_STATUS_VALUES), true);
  assert.deepEqual(
    [...milestone.MILESTONE_STATUS_VALUES],
    Object.values(milestone.MILESTONE_STATUS),
  );
  assert.deepEqual(
    [...milestone.MILESTONE_STATUS_VALUES].sort(),
    ['BLOCKED', 'COMPLETE', 'PENDING'],
  );
});

// ---------------------------------------------------------------------------
// isValidMilestone
// ---------------------------------------------------------------------------

test('exports isValidMilestone as a function', () => {
  assert.equal(typeof milestone.isValidMilestone, 'function');
});

test('isValidMilestone accepts every ACTIVATION_MILESTONE value', () => {
  for (const value of Object.values(milestone.ACTIVATION_MILESTONE)) {
    assert.equal(milestone.isValidMilestone(value), true, `expected ${value} to be a valid milestone`);
  }
});

test('isValidMilestone rejects unknown / malformed values', () => {
  assert.equal(milestone.isValidMilestone('FULFILMENT_COMPLETE'), false);
  assert.equal(milestone.isValidMilestone('payment_complete'), false);
  assert.equal(milestone.isValidMilestone(''), false);
  assert.equal(milestone.isValidMilestone(undefined), false);
  assert.equal(milestone.isValidMilestone(null), false);
  assert.equal(milestone.isValidMilestone(0), false);
});

test('isValidMilestone does not accept a status value in place of a milestone', () => {
  // Milestones and statuses are distinct vocabularies.
  assert.equal(milestone.isValidMilestone('PENDING'), false);
  assert.equal(milestone.isValidMilestone('BLOCKED'), false);
  assert.equal(milestone.isValidMilestone('COMPLETE'), false);
});

// ---------------------------------------------------------------------------
// isValidStatus
// ---------------------------------------------------------------------------

test('exports isValidStatus as a function', () => {
  assert.equal(typeof milestone.isValidStatus, 'function');
});

test('isValidStatus accepts every MILESTONE_STATUS value', () => {
  for (const value of Object.values(milestone.MILESTONE_STATUS)) {
    assert.equal(milestone.isValidStatus(value), true, `expected ${value} to be a valid status`);
  }
});

test('isValidStatus rejects unknown / malformed values', () => {
  assert.equal(milestone.isValidStatus('SUSPENDED'), false);
  assert.equal(milestone.isValidStatus('pending'), false);
  assert.equal(milestone.isValidStatus('completed'), false);
  assert.equal(milestone.isValidStatus(''), false);
  assert.equal(milestone.isValidStatus(undefined), false);
  assert.equal(milestone.isValidStatus(null), false);
  assert.equal(milestone.isValidStatus(0), false);
});

test('isValidStatus does not accept a milestone value in place of a status', () => {
  assert.equal(milestone.isValidStatus('PAYMENT_COMPLETE'), false);
  assert.equal(milestone.isValidStatus('VERIFICATION_COMPLETE'), false);
  assert.equal(milestone.isValidStatus('ACTIVATION_COMPLETE'), false);
});

// ---------------------------------------------------------------------------
// Re-export from the model API (src/index.js) — same references
// ---------------------------------------------------------------------------

test('ACTIVATION_MILESTONE is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ACTIVATION_MILESTONE, milestone.ACTIVATION_MILESTONE);
});

test('ACTIVATION_MILESTONE_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ACTIVATION_MILESTONE_VALUES, milestone.ACTIVATION_MILESTONE_VALUES);
});

test('ACTIVATION_MILESTONE_SEQUENCE is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.ACTIVATION_MILESTONE_SEQUENCE, milestone.ACTIVATION_MILESTONE_SEQUENCE);
});

test('MILESTONE_STATUS is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.MILESTONE_STATUS, milestone.MILESTONE_STATUS);
});

test('MILESTONE_STATUS_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.MILESTONE_STATUS_VALUES, milestone.MILESTONE_STATUS_VALUES);
});

test('isValidMilestone is re-exported from src/index.js', () => {
  assert.equal(model.isValidMilestone, milestone.isValidMilestone);
});

test('isValidStatus is re-exported from src/index.js', () => {
  assert.equal(model.isValidStatus, milestone.isValidStatus);
});

// ---------------------------------------------------------------------------
// Co-existence with the existing vocabularies
// ---------------------------------------------------------------------------

test('adding milestone exports does not disturb the REQUIREMENT re-export', () => {
  assert.equal(typeof model.REQUIREMENT, 'object');
  assert.notEqual(model.REQUIREMENT, null);
  assert.equal(model.isValidRequirement('REQUIRED'), true);
});

test('adding milestone exports does not disturb the order-status re-export', () => {
  assert.equal(typeof model.ORDER_STATUS, 'object');
  assert.equal(model.isValidOrderStatus('PENDING'), true);
});
