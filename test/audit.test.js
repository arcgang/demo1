'use strict';

// Acceptance tests (unit): the shared audit-event / consent-purpose / journey
// vocabulary.
//
// `src/audit.js` mirrors the `src/requirement.js` / `src/order-status.js`
// pattern and is the single source of truth for these domain strings, shared
// by the schema (CHECK constraints on audit_event / consent_record), the
// ConsentAuditModule services, and the API/index surface. Per the LLD it
// exposes THREE frozen vocabularies, each with a values list and a validator:
//
//   AUDIT_EVENT_TYPE            frozen enum: SENSITIVE_DATA_ACCESS,
//                              CONSENT_CAPTURE, PAYMENT_OUTCOME,
//                              VERIFICATION_OUTCOME, ORDER_CREATION,
//                              ACTIVATION_STATUS_CHANGE
//   AUDIT_EVENT_TYPE_VALUES    frozen array === Object.values(AUDIT_EVENT_TYPE)
//   isValidAuditEventType(value) -> boolean
//
//   CONSENT_PURPOSE            frozen enum: MARKETING, PERSONALIZATION,
//                              DATA_PROCESSING
//   CONSENT_PURPOSE_VALUES     frozen array === Object.values(CONSENT_PURPOSE)
//   isValidConsentPurpose(value) -> boolean
//
//   JOURNEY                    frozen enum: CHECKOUT, SIM_ONBOARDING,
//                              ESIM_ONBOARDING
//   JOURNEY_VALUES             frozen array === Object.values(JOURNEY)
//   isValidJourney(value)      -> boolean
//
// Every enum/helper is also re-exported from src/index.js (same reference).
//
// These tests are written BEFORE the module exists and must FAIL until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const audit = require('../src/audit.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// AUDIT_EVENT_TYPE enum
// ---------------------------------------------------------------------------

test('exports an AUDIT_EVENT_TYPE object', () => {
  assert.equal(typeof audit.AUDIT_EVENT_TYPE, 'object');
  assert.notEqual(audit.AUDIT_EVENT_TYPE, null);
});

test('AUDIT_EVENT_TYPE has exactly the six defined members mapping to their own names', () => {
  assert.deepEqual(audit.AUDIT_EVENT_TYPE, {
    SENSITIVE_DATA_ACCESS: 'SENSITIVE_DATA_ACCESS',
    CONSENT_CAPTURE: 'CONSENT_CAPTURE',
    PAYMENT_OUTCOME: 'PAYMENT_OUTCOME',
    VERIFICATION_OUTCOME: 'VERIFICATION_OUTCOME',
    ORDER_CREATION: 'ORDER_CREATION',
    ACTIVATION_STATUS_CHANGE: 'ACTIVATION_STATUS_CHANGE',
  });
});

test('AUDIT_EVENT_TYPE is frozen', () => {
  assert.equal(Object.isFrozen(audit.AUDIT_EVENT_TYPE), true);
});

test('AUDIT_EVENT_TYPE cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    audit.AUDIT_EVENT_TYPE.SENSITIVE_DATA_ACCESS = 'CHANGED';
  });
  assert.equal(audit.AUDIT_EVENT_TYPE.SENSITIVE_DATA_ACCESS, 'SENSITIVE_DATA_ACCESS');
});

test('AUDIT_EVENT_TYPE cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    audit.AUDIT_EVENT_TYPE.LOGIN = 'LOGIN';
  });
  assert.equal(audit.AUDIT_EVENT_TYPE.LOGIN, undefined);
});

// ---------------------------------------------------------------------------
// AUDIT_EVENT_TYPE_VALUES
// ---------------------------------------------------------------------------

test('exports AUDIT_EVENT_TYPE_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(audit.AUDIT_EVENT_TYPE_VALUES));
  assert.deepEqual(
    [...audit.AUDIT_EVENT_TYPE_VALUES].sort(),
    [
      'ACTIVATION_STATUS_CHANGE',
      'CONSENT_CAPTURE',
      'ORDER_CREATION',
      'PAYMENT_OUTCOME',
      'SENSITIVE_DATA_ACCESS',
      'VERIFICATION_OUTCOME',
    ],
  );
});

test('AUDIT_EVENT_TYPE_VALUES matches Object.values(AUDIT_EVENT_TYPE)', () => {
  assert.deepEqual(
    [...audit.AUDIT_EVENT_TYPE_VALUES],
    Object.values(audit.AUDIT_EVENT_TYPE),
  );
});

test('AUDIT_EVENT_TYPE_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(audit.AUDIT_EVENT_TYPE_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidAuditEventType
// ---------------------------------------------------------------------------

test('exports isValidAuditEventType as a function', () => {
  assert.equal(typeof audit.isValidAuditEventType, 'function');
});

test('isValidAuditEventType accepts every AUDIT_EVENT_TYPE value', () => {
  for (const value of Object.values(audit.AUDIT_EVENT_TYPE)) {
    assert.equal(audit.isValidAuditEventType(value), true, `expected ${value} to be valid`);
  }
});

test('isValidAuditEventType rejects unknown / malformed values', () => {
  assert.equal(audit.isValidAuditEventType('LOGIN'), false);
  assert.equal(audit.isValidAuditEventType('sensitive_data_access'), false);
  assert.equal(audit.isValidAuditEventType(''), false);
  assert.equal(audit.isValidAuditEventType(undefined), false);
  assert.equal(audit.isValidAuditEventType(null), false);
  assert.equal(audit.isValidAuditEventType(0), false);
});

test('isValidAuditEventType does not accept a consent-purpose or journey value', () => {
  // The audit-event vocabulary is distinct from CONSENT_PURPOSE / JOURNEY.
  assert.equal(audit.isValidAuditEventType('MARKETING'), false);
  assert.equal(audit.isValidAuditEventType('CHECKOUT'), false);
});

// ---------------------------------------------------------------------------
// CONSENT_PURPOSE enum
// ---------------------------------------------------------------------------

test('exports a CONSENT_PURPOSE object', () => {
  assert.equal(typeof audit.CONSENT_PURPOSE, 'object');
  assert.notEqual(audit.CONSENT_PURPOSE, null);
});

test('CONSENT_PURPOSE has exactly the three defined members mapping to their own names', () => {
  assert.deepEqual(audit.CONSENT_PURPOSE, {
    MARKETING: 'MARKETING',
    PERSONALIZATION: 'PERSONALIZATION',
    DATA_PROCESSING: 'DATA_PROCESSING',
  });
});

test('CONSENT_PURPOSE is frozen', () => {
  assert.equal(Object.isFrozen(audit.CONSENT_PURPOSE), true);
});

test('CONSENT_PURPOSE cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    audit.CONSENT_PURPOSE.MARKETING = 'CHANGED';
  });
  assert.equal(audit.CONSENT_PURPOSE.MARKETING, 'MARKETING');
});

test('CONSENT_PURPOSE cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    audit.CONSENT_PURPOSE.ANALYTICS = 'ANALYTICS';
  });
  assert.equal(audit.CONSENT_PURPOSE.ANALYTICS, undefined);
});

// ---------------------------------------------------------------------------
// CONSENT_PURPOSE_VALUES
// ---------------------------------------------------------------------------

test('exports CONSENT_PURPOSE_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(audit.CONSENT_PURPOSE_VALUES));
  assert.deepEqual(
    [...audit.CONSENT_PURPOSE_VALUES].sort(),
    ['DATA_PROCESSING', 'MARKETING', 'PERSONALIZATION'],
  );
});

test('CONSENT_PURPOSE_VALUES matches Object.values(CONSENT_PURPOSE)', () => {
  assert.deepEqual(
    [...audit.CONSENT_PURPOSE_VALUES],
    Object.values(audit.CONSENT_PURPOSE),
  );
});

test('CONSENT_PURPOSE_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(audit.CONSENT_PURPOSE_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidConsentPurpose
// ---------------------------------------------------------------------------

test('exports isValidConsentPurpose as a function', () => {
  assert.equal(typeof audit.isValidConsentPurpose, 'function');
});

test('isValidConsentPurpose accepts every CONSENT_PURPOSE value', () => {
  for (const value of Object.values(audit.CONSENT_PURPOSE)) {
    assert.equal(audit.isValidConsentPurpose(value), true, `expected ${value} to be valid`);
  }
});

test('isValidConsentPurpose rejects unknown / malformed values', () => {
  assert.equal(audit.isValidConsentPurpose('ANALYTICS'), false);
  assert.equal(audit.isValidConsentPurpose('marketing'), false);
  assert.equal(audit.isValidConsentPurpose(''), false);
  assert.equal(audit.isValidConsentPurpose(undefined), false);
  assert.equal(audit.isValidConsentPurpose(null), false);
  assert.equal(audit.isValidConsentPurpose(0), false);
});

test('isValidConsentPurpose does not accept an audit-event or journey value', () => {
  assert.equal(audit.isValidConsentPurpose('CONSENT_CAPTURE'), false);
  assert.equal(audit.isValidConsentPurpose('CHECKOUT'), false);
});

// ---------------------------------------------------------------------------
// JOURNEY enum
// ---------------------------------------------------------------------------

test('exports a JOURNEY object', () => {
  assert.equal(typeof audit.JOURNEY, 'object');
  assert.notEqual(audit.JOURNEY, null);
});

test('JOURNEY has exactly the three defined members mapping to their own names', () => {
  assert.deepEqual(audit.JOURNEY, {
    CHECKOUT: 'CHECKOUT',
    SIM_ONBOARDING: 'SIM_ONBOARDING',
    ESIM_ONBOARDING: 'ESIM_ONBOARDING',
  });
});

test('JOURNEY is frozen', () => {
  assert.equal(Object.isFrozen(audit.JOURNEY), true);
});

test('JOURNEY cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    audit.JOURNEY.CHECKOUT = 'CHANGED';
  });
  assert.equal(audit.JOURNEY.CHECKOUT, 'CHECKOUT');
});

test('JOURNEY cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    audit.JOURNEY.UPGRADE = 'UPGRADE';
  });
  assert.equal(audit.JOURNEY.UPGRADE, undefined);
});

// ---------------------------------------------------------------------------
// JOURNEY_VALUES
// ---------------------------------------------------------------------------

test('exports JOURNEY_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(audit.JOURNEY_VALUES));
  assert.deepEqual(
    [...audit.JOURNEY_VALUES].sort(),
    ['CHECKOUT', 'ESIM_ONBOARDING', 'SIM_ONBOARDING'],
  );
});

test('JOURNEY_VALUES matches Object.values(JOURNEY)', () => {
  assert.deepEqual(
    [...audit.JOURNEY_VALUES],
    Object.values(audit.JOURNEY),
  );
});

test('JOURNEY_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(audit.JOURNEY_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidJourney
// ---------------------------------------------------------------------------

test('exports isValidJourney as a function', () => {
  assert.equal(typeof audit.isValidJourney, 'function');
});

test('isValidJourney accepts every JOURNEY value', () => {
  for (const value of Object.values(audit.JOURNEY)) {
    assert.equal(audit.isValidJourney(value), true, `expected ${value} to be valid`);
  }
});

test('isValidJourney rejects unknown / malformed values', () => {
  assert.equal(audit.isValidJourney('UPGRADE'), false);
  assert.equal(audit.isValidJourney('checkout'), false);
  assert.equal(audit.isValidJourney(''), false);
  assert.equal(audit.isValidJourney(undefined), false);
  assert.equal(audit.isValidJourney(null), false);
  assert.equal(audit.isValidJourney(0), false);
});

test('isValidJourney does not accept an audit-event or consent-purpose value', () => {
  assert.equal(audit.isValidJourney('ORDER_CREATION'), false);
  assert.equal(audit.isValidJourney('MARKETING'), false);
});

// ---------------------------------------------------------------------------
// Re-export from the model API (src/index.js)
// ---------------------------------------------------------------------------

test('AUDIT_EVENT_TYPE is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.AUDIT_EVENT_TYPE, audit.AUDIT_EVENT_TYPE);
});

test('AUDIT_EVENT_TYPE_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.AUDIT_EVENT_TYPE_VALUES, audit.AUDIT_EVENT_TYPE_VALUES);
});

test('isValidAuditEventType is re-exported from src/index.js', () => {
  assert.equal(model.isValidAuditEventType, audit.isValidAuditEventType);
});

test('CONSENT_PURPOSE is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.CONSENT_PURPOSE, audit.CONSENT_PURPOSE);
});

test('CONSENT_PURPOSE_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.CONSENT_PURPOSE_VALUES, audit.CONSENT_PURPOSE_VALUES);
});

test('isValidConsentPurpose is re-exported from src/index.js', () => {
  assert.equal(model.isValidConsentPurpose, audit.isValidConsentPurpose);
});

test('JOURNEY is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.JOURNEY, audit.JOURNEY);
});

test('JOURNEY_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.JOURNEY_VALUES, audit.JOURNEY_VALUES);
});

test('isValidJourney is re-exported from src/index.js', () => {
  assert.equal(model.isValidJourney, audit.isValidJourney);
});

// ---------------------------------------------------------------------------
// Co-existence with the existing vocabularies
// ---------------------------------------------------------------------------

test('adding audit exports does not disturb the existing re-exports', () => {
  assert.equal(typeof model.REQUIREMENT, 'object');
  assert.equal(model.isValidRequirement('REQUIRED'), true);
  assert.equal(typeof model.ORDER_STATUS, 'object');
  assert.equal(model.isValidOrderStatus('PENDING'), true);
});
