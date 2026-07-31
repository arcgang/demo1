'use strict';

// Acceptance tests (unit): the shared number-porting / verification vocabulary.
//
// `src/porting.js` mirrors the `src/requirement.js` / `src/status.js` /
// `src/order-status.js` pattern and is the single source of truth for the
// porting-domain vocabulary consumed by the migration (schema CHECK
// constraints), the onboarding/verification services, the API, and the UI.
// It exports frozen enums, frozen `*_VALUES` arrays, and `isValid*` helpers:
//
//   DONOR_NETWORK            frozen code list of donor operators (the network a
//                            ported-in number is leaving), including an OTHER
//                            sentinel for operators outside the known list
//   DONOR_NETWORK_VALUES     frozen array of the code-list values
//   isValidDonorNetwork(value) -> boolean   (membership of the code list)
//   isValidDonorOperator(value) -> boolean  (free-text donor operator: any
//                            non-empty, trimmed string — used when the donor
//                            network is captured as free text rather than a
//                            code)
//
//   OWNERSHIP_TYPE           frozen enum: INDIVIDUAL, BUSINESS
//   OWNERSHIP_TYPE_VALUES    frozen array of the enum values
//   isValidOwnershipType(value) -> boolean
//
//   VERIFICATION_STATUS         frozen enum: NOT_STARTED, PENDING,
//                               ADDITIONAL_VERIFICATION_REQUIRED, VERIFIED,
//                               FAILED
//   VERIFICATION_STATUS_VALUES  frozen array of the enum values
//   isValidVerificationStatus(value) -> boolean
//
//   PORTING_OUTCOME          frozen enum: ELIGIBLE, NEEDS_VERIFICATION,
//                            UNSUPPORTED
//   PORTING_OUTCOME_VALUES   frozen array of the enum values
//   isValidPortingOutcome(value) -> boolean
//
// Every enum/helper is also re-exported from src/index.js.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const porting = require('../src/porting.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// DONOR_NETWORK code list
// ---------------------------------------------------------------------------

test('exports a DONOR_NETWORK object', () => {
  assert.equal(typeof porting.DONOR_NETWORK, 'object');
  assert.notEqual(porting.DONOR_NETWORK, null);
});

test('DONOR_NETWORK has exactly the defined members mapping to their own names', () => {
  assert.deepEqual(porting.DONOR_NETWORK, {
    MTN: 'MTN',
    TELKOM: 'TELKOM',
    CELLC: 'CELLC',
    RAIN: 'RAIN',
    OTHER: 'OTHER',
  });
});

test('DONOR_NETWORK is frozen', () => {
  assert.equal(Object.isFrozen(porting.DONOR_NETWORK), true);
});

test('DONOR_NETWORK cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    porting.DONOR_NETWORK.MTN = 'CHANGED';
  });
  assert.equal(porting.DONOR_NETWORK.MTN, 'MTN');
});

test('DONOR_NETWORK cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    porting.DONOR_NETWORK.VODACOM = 'VODACOM';
  });
  assert.equal(porting.DONOR_NETWORK.VODACOM, undefined);
});

test('DONOR_NETWORK includes an OTHER sentinel for out-of-list operators', () => {
  assert.equal(porting.DONOR_NETWORK.OTHER, 'OTHER');
});

// ---------------------------------------------------------------------------
// DONOR_NETWORK_VALUES
// ---------------------------------------------------------------------------

test('exports DONOR_NETWORK_VALUES as an array of the code-list values', () => {
  assert.ok(Array.isArray(porting.DONOR_NETWORK_VALUES));
  assert.deepEqual(
    [...porting.DONOR_NETWORK_VALUES].sort(),
    ['CELLC', 'MTN', 'OTHER', 'RAIN', 'TELKOM'],
  );
});

test('DONOR_NETWORK_VALUES matches Object.values(DONOR_NETWORK)', () => {
  assert.deepEqual(
    [...porting.DONOR_NETWORK_VALUES],
    Object.values(porting.DONOR_NETWORK),
  );
});

test('DONOR_NETWORK_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(porting.DONOR_NETWORK_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidDonorNetwork (code-list membership)
// ---------------------------------------------------------------------------

test('exports isValidDonorNetwork as a function', () => {
  assert.equal(typeof porting.isValidDonorNetwork, 'function');
});

test('isValidDonorNetwork accepts every DONOR_NETWORK value', () => {
  for (const value of Object.values(porting.DONOR_NETWORK)) {
    assert.equal(porting.isValidDonorNetwork(value), true, `expected ${value} to be valid`);
  }
});

test('isValidDonorNetwork rejects unknown / malformed values', () => {
  assert.equal(porting.isValidDonorNetwork('VODACOM'), false);
  assert.equal(porting.isValidDonorNetwork('mtn'), false);
  assert.equal(porting.isValidDonorNetwork(''), false);
  assert.equal(porting.isValidDonorNetwork('  MTN  '), false);
  assert.equal(porting.isValidDonorNetwork(undefined), false);
  assert.equal(porting.isValidDonorNetwork(null), false);
  assert.equal(porting.isValidDonorNetwork(0), false);
});

// ---------------------------------------------------------------------------
// isValidDonorOperator (free-text donor operator)
// ---------------------------------------------------------------------------

test('exports isValidDonorOperator as a function', () => {
  assert.equal(typeof porting.isValidDonorOperator, 'function');
});

test('isValidDonorOperator accepts any non-empty operator name (free text)', () => {
  assert.equal(porting.isValidDonorOperator('MTN'), true);
  assert.equal(porting.isValidDonorOperator('Some Regional Operator'), true);
  // Known codes are, of course, also acceptable operator names.
  for (const value of porting.DONOR_NETWORK_VALUES) {
    assert.equal(porting.isValidDonorOperator(value), true, `expected ${value} to be accepted`);
  }
});

test('isValidDonorOperator rejects empty / whitespace / non-string values', () => {
  assert.equal(porting.isValidDonorOperator(''), false);
  assert.equal(porting.isValidDonorOperator('   '), false);
  assert.equal(porting.isValidDonorOperator(undefined), false);
  assert.equal(porting.isValidDonorOperator(null), false);
  assert.equal(porting.isValidDonorOperator(0), false);
  assert.equal(porting.isValidDonorOperator(42), false);
  assert.equal(porting.isValidDonorOperator({}), false);
});

// ---------------------------------------------------------------------------
// OWNERSHIP_TYPE enum
// ---------------------------------------------------------------------------

test('exports an OWNERSHIP_TYPE object', () => {
  assert.equal(typeof porting.OWNERSHIP_TYPE, 'object');
  assert.notEqual(porting.OWNERSHIP_TYPE, null);
});

test('OWNERSHIP_TYPE has exactly the two defined members mapping to their own names', () => {
  assert.deepEqual(porting.OWNERSHIP_TYPE, {
    INDIVIDUAL: 'INDIVIDUAL',
    BUSINESS: 'BUSINESS',
  });
});

test('OWNERSHIP_TYPE is frozen', () => {
  assert.equal(Object.isFrozen(porting.OWNERSHIP_TYPE), true);
});

test('OWNERSHIP_TYPE cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    porting.OWNERSHIP_TYPE.INDIVIDUAL = 'CHANGED';
  });
  assert.equal(porting.OWNERSHIP_TYPE.INDIVIDUAL, 'INDIVIDUAL');
});

test('OWNERSHIP_TYPE cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    porting.OWNERSHIP_TYPE.GOVERNMENT = 'GOVERNMENT';
  });
  assert.equal(porting.OWNERSHIP_TYPE.GOVERNMENT, undefined);
});

// ---------------------------------------------------------------------------
// OWNERSHIP_TYPE_VALUES
// ---------------------------------------------------------------------------

test('exports OWNERSHIP_TYPE_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(porting.OWNERSHIP_TYPE_VALUES));
  assert.deepEqual(
    [...porting.OWNERSHIP_TYPE_VALUES].sort(),
    ['BUSINESS', 'INDIVIDUAL'],
  );
});

test('OWNERSHIP_TYPE_VALUES matches Object.values(OWNERSHIP_TYPE)', () => {
  assert.deepEqual(
    [...porting.OWNERSHIP_TYPE_VALUES],
    Object.values(porting.OWNERSHIP_TYPE),
  );
});

test('OWNERSHIP_TYPE_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(porting.OWNERSHIP_TYPE_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidOwnershipType
// ---------------------------------------------------------------------------

test('exports isValidOwnershipType as a function', () => {
  assert.equal(typeof porting.isValidOwnershipType, 'function');
});

test('isValidOwnershipType accepts every OWNERSHIP_TYPE value', () => {
  for (const value of Object.values(porting.OWNERSHIP_TYPE)) {
    assert.equal(porting.isValidOwnershipType(value), true, `expected ${value} to be valid`);
  }
});

test('isValidOwnershipType rejects unknown / malformed values', () => {
  assert.equal(porting.isValidOwnershipType('GOVERNMENT'), false);
  assert.equal(porting.isValidOwnershipType('individual'), false);
  assert.equal(porting.isValidOwnershipType(''), false);
  assert.equal(porting.isValidOwnershipType(undefined), false);
  assert.equal(porting.isValidOwnershipType(null), false);
  assert.equal(porting.isValidOwnershipType(0), false);
});

// ---------------------------------------------------------------------------
// VERIFICATION_STATUS enum
// ---------------------------------------------------------------------------

test('exports a VERIFICATION_STATUS object', () => {
  assert.equal(typeof porting.VERIFICATION_STATUS, 'object');
  assert.notEqual(porting.VERIFICATION_STATUS, null);
});

test('VERIFICATION_STATUS has exactly the five defined members mapping to their own names', () => {
  assert.deepEqual(porting.VERIFICATION_STATUS, {
    NOT_STARTED: 'NOT_STARTED',
    PENDING: 'PENDING',
    ADDITIONAL_VERIFICATION_REQUIRED: 'ADDITIONAL_VERIFICATION_REQUIRED',
    VERIFIED: 'VERIFIED',
    FAILED: 'FAILED',
  });
});

test('VERIFICATION_STATUS is frozen', () => {
  assert.equal(Object.isFrozen(porting.VERIFICATION_STATUS), true);
});

test('VERIFICATION_STATUS cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    porting.VERIFICATION_STATUS.NOT_STARTED = 'CHANGED';
  });
  assert.equal(porting.VERIFICATION_STATUS.NOT_STARTED, 'NOT_STARTED');
});

test('VERIFICATION_STATUS cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    porting.VERIFICATION_STATUS.CANCELLED = 'CANCELLED';
  });
  assert.equal(porting.VERIFICATION_STATUS.CANCELLED, undefined);
});

// ---------------------------------------------------------------------------
// VERIFICATION_STATUS_VALUES
// ---------------------------------------------------------------------------

test('exports VERIFICATION_STATUS_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(porting.VERIFICATION_STATUS_VALUES));
  assert.deepEqual(
    [...porting.VERIFICATION_STATUS_VALUES].sort(),
    ['ADDITIONAL_VERIFICATION_REQUIRED', 'FAILED', 'NOT_STARTED', 'PENDING', 'VERIFIED'],
  );
});

test('VERIFICATION_STATUS_VALUES matches Object.values(VERIFICATION_STATUS)', () => {
  assert.deepEqual(
    [...porting.VERIFICATION_STATUS_VALUES],
    Object.values(porting.VERIFICATION_STATUS),
  );
});

test('VERIFICATION_STATUS_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(porting.VERIFICATION_STATUS_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidVerificationStatus
// ---------------------------------------------------------------------------

test('exports isValidVerificationStatus as a function', () => {
  assert.equal(typeof porting.isValidVerificationStatus, 'function');
});

test('isValidVerificationStatus accepts every VERIFICATION_STATUS value', () => {
  for (const value of Object.values(porting.VERIFICATION_STATUS)) {
    assert.equal(porting.isValidVerificationStatus(value), true, `expected ${value} to be valid`);
  }
});

test('isValidVerificationStatus rejects unknown / malformed values', () => {
  assert.equal(porting.isValidVerificationStatus('CANCELLED'), false);
  assert.equal(porting.isValidVerificationStatus('verified'), false);
  assert.equal(porting.isValidVerificationStatus(''), false);
  assert.equal(porting.isValidVerificationStatus(undefined), false);
  assert.equal(porting.isValidVerificationStatus(null), false);
  assert.equal(porting.isValidVerificationStatus(0), false);
});

test('isValidVerificationStatus does not accept a payment/activation-only value', () => {
  // The porting verification vocabulary is distinct from PAYMENT_STATUS /
  // ACTIVATION_STATUS in src/status.js and from ORDER_STATUS in
  // src/order-status.js.
  assert.equal(porting.isValidVerificationStatus('INITIATED'), false);
  assert.equal(porting.isValidVerificationStatus('CONFIRMED'), false);
  assert.equal(porting.isValidVerificationStatus('ACTIVATED'), false);
  assert.equal(porting.isValidVerificationStatus('ACTIVATING'), false);
});

// ---------------------------------------------------------------------------
// PORTING_OUTCOME enum
// ---------------------------------------------------------------------------

test('exports a PORTING_OUTCOME object', () => {
  assert.equal(typeof porting.PORTING_OUTCOME, 'object');
  assert.notEqual(porting.PORTING_OUTCOME, null);
});

test('PORTING_OUTCOME has exactly the three defined members mapping to their own names', () => {
  assert.deepEqual(porting.PORTING_OUTCOME, {
    ELIGIBLE: 'ELIGIBLE',
    NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
    UNSUPPORTED: 'UNSUPPORTED',
  });
});

test('PORTING_OUTCOME is frozen', () => {
  assert.equal(Object.isFrozen(porting.PORTING_OUTCOME), true);
});

test('PORTING_OUTCOME cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    porting.PORTING_OUTCOME.ELIGIBLE = 'CHANGED';
  });
  assert.equal(porting.PORTING_OUTCOME.ELIGIBLE, 'ELIGIBLE');
});

test('PORTING_OUTCOME cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    porting.PORTING_OUTCOME.DEFERRED = 'DEFERRED';
  });
  assert.equal(porting.PORTING_OUTCOME.DEFERRED, undefined);
});

// ---------------------------------------------------------------------------
// PORTING_OUTCOME_VALUES
// ---------------------------------------------------------------------------

test('exports PORTING_OUTCOME_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(porting.PORTING_OUTCOME_VALUES));
  assert.deepEqual(
    [...porting.PORTING_OUTCOME_VALUES].sort(),
    ['ELIGIBLE', 'NEEDS_VERIFICATION', 'UNSUPPORTED'],
  );
});

test('PORTING_OUTCOME_VALUES matches Object.values(PORTING_OUTCOME)', () => {
  assert.deepEqual(
    [...porting.PORTING_OUTCOME_VALUES],
    Object.values(porting.PORTING_OUTCOME),
  );
});

test('PORTING_OUTCOME_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(porting.PORTING_OUTCOME_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidPortingOutcome
// ---------------------------------------------------------------------------

test('exports isValidPortingOutcome as a function', () => {
  assert.equal(typeof porting.isValidPortingOutcome, 'function');
});

test('isValidPortingOutcome accepts every PORTING_OUTCOME value', () => {
  for (const value of Object.values(porting.PORTING_OUTCOME)) {
    assert.equal(porting.isValidPortingOutcome(value), true, `expected ${value} to be valid`);
  }
});

test('isValidPortingOutcome rejects unknown / malformed values', () => {
  assert.equal(porting.isValidPortingOutcome('DEFERRED'), false);
  assert.equal(porting.isValidPortingOutcome('eligible'), false);
  assert.equal(porting.isValidPortingOutcome(''), false);
  assert.equal(porting.isValidPortingOutcome(undefined), false);
  assert.equal(porting.isValidPortingOutcome(null), false);
  assert.equal(porting.isValidPortingOutcome(0), false);
});

// ---------------------------------------------------------------------------
// Re-export from the model API (src/index.js)
// ---------------------------------------------------------------------------

test('DONOR_NETWORK is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.DONOR_NETWORK, porting.DONOR_NETWORK);
});

test('DONOR_NETWORK_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.DONOR_NETWORK_VALUES, porting.DONOR_NETWORK_VALUES);
});

test('isValidDonorNetwork is re-exported from src/index.js', () => {
  assert.equal(model.isValidDonorNetwork, porting.isValidDonorNetwork);
});

test('isValidDonorOperator is re-exported from src/index.js', () => {
  assert.equal(model.isValidDonorOperator, porting.isValidDonorOperator);
});

test('OWNERSHIP_TYPE is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.OWNERSHIP_TYPE, porting.OWNERSHIP_TYPE);
});

test('OWNERSHIP_TYPE_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.OWNERSHIP_TYPE_VALUES, porting.OWNERSHIP_TYPE_VALUES);
});

test('isValidOwnershipType is re-exported from src/index.js', () => {
  assert.equal(model.isValidOwnershipType, porting.isValidOwnershipType);
});

test('VERIFICATION_STATUS is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.VERIFICATION_STATUS, porting.VERIFICATION_STATUS);
});

test('VERIFICATION_STATUS_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.VERIFICATION_STATUS_VALUES, porting.VERIFICATION_STATUS_VALUES);
});

test('isValidVerificationStatus is re-exported from src/index.js', () => {
  assert.equal(model.isValidVerificationStatus, porting.isValidVerificationStatus);
});

test('PORTING_OUTCOME is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.PORTING_OUTCOME, porting.PORTING_OUTCOME);
});

test('PORTING_OUTCOME_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.PORTING_OUTCOME_VALUES, porting.PORTING_OUTCOME_VALUES);
});

test('isValidPortingOutcome is re-exported from src/index.js', () => {
  assert.equal(model.isValidPortingOutcome, porting.isValidPortingOutcome);
});

// ---------------------------------------------------------------------------
// Co-existence with the existing shared vocabularies
// ---------------------------------------------------------------------------

test('adding porting exports does not disturb the existing re-exports', () => {
  assert.equal(model.isValidRequirement('REQUIRED'), true);
  assert.equal(model.isValidMilestone('PAYMENT'), true);
  assert.equal(model.isValidStatusState('COMPLETE'), true);
  assert.equal(model.isValidOrderStatus('PENDING'), true);
});
