'use strict';

// The audit-event, consent-purpose, and journey vocabularies shared by the
// schema (CHECK constraints on audit_event / consent_record), the
// ConsentAuditModule services, and the API/index surface. This module mirrors
// the src/requirement.js / src/order-status.js pattern and is the single
// source of truth for these domain strings.

// The category of business-critical or sensitive action captured in the
// audit_event log: reads of sensitive data, consent capture, and the outcome
// of payment / verification, order creation, and activation-status changes.
const AUDIT_EVENT_TYPE = Object.freeze({
  SENSITIVE_DATA_ACCESS: 'SENSITIVE_DATA_ACCESS',
  CONSENT_CAPTURE: 'CONSENT_CAPTURE',
  PAYMENT_OUTCOME: 'PAYMENT_OUTCOME',
  VERIFICATION_OUTCOME: 'VERIFICATION_OUTCOME',
  ORDER_CREATION: 'ORDER_CREATION',
  ACTIVATION_STATUS_CHANGE: 'ACTIVATION_STATUS_CHANGE',
});

const AUDIT_EVENT_TYPE_VALUES = Object.freeze(Object.values(AUDIT_EVENT_TYPE));

function isValidAuditEventType(value) {
  return AUDIT_EVENT_TYPE_VALUES.includes(value);
}

// The purpose a consent_record grants (or withholds). Optional consent
// purposes (marketing, personalization) must default to withheld; data
// processing covers the lawful basis for fulfilling the order itself.
const CONSENT_PURPOSE = Object.freeze({
  MARKETING: 'MARKETING',
  PERSONALIZATION: 'PERSONALIZATION',
  DATA_PROCESSING: 'DATA_PROCESSING',
});

const CONSENT_PURPOSE_VALUES = Object.freeze(Object.values(CONSENT_PURPOSE));

function isValidConsentPurpose(value) {
  return CONSENT_PURPOSE_VALUES.includes(value);
}

// The customer journey a captured event or consent record belongs to: device
// checkout, or SIM / eSIM onboarding.
const JOURNEY = Object.freeze({
  CHECKOUT: 'CHECKOUT',
  SIM_ONBOARDING: 'SIM_ONBOARDING',
  ESIM_ONBOARDING: 'ESIM_ONBOARDING',
});

const JOURNEY_VALUES = Object.freeze(Object.values(JOURNEY));

function isValidJourney(value) {
  return JOURNEY_VALUES.includes(value);
}

module.exports = {
  AUDIT_EVENT_TYPE,
  AUDIT_EVENT_TYPE_VALUES,
  isValidAuditEventType,
  CONSENT_PURPOSE,
  CONSENT_PURPOSE_VALUES,
  isValidConsentPurpose,
  JOURNEY,
  JOURNEY_VALUES,
  isValidJourney,
};
