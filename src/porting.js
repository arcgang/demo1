'use strict';

// The number-porting / verification vocabulary shared by the schema (CHECK
// constraints), the onboarding/verification services, the API, and the UI.
// This is the single source of truth for these porting-domain strings; it is
// distinct from the payment/activation vocabulary in src/status.js and the
// order-lifecycle vocabulary in src/order-status.js.

// The donor network is the operator a ported-in number is leaving. It is
// captured as a code from this list; OTHER is a sentinel for operators outside
// the known list (which are then recorded as a free-text donor operator name).
const DONOR_NETWORK = Object.freeze({
  MTN: 'MTN',
  TELKOM: 'TELKOM',
  CELLC: 'CELLC',
  RAIN: 'RAIN',
  OTHER: 'OTHER',
});

const DONOR_NETWORK_VALUES = Object.freeze(Object.values(DONOR_NETWORK));

// Membership of the donor-network code list.
function isValidDonorNetwork(value) {
  return DONOR_NETWORK_VALUES.includes(value);
}

// A free-text donor operator name — used when the donor network is captured as
// text rather than a code (e.g. for the OTHER case). Any non-empty, trimmed
// string is acceptable.
function isValidDonorOperator(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Who owns the number being ported in.
const OWNERSHIP_TYPE = Object.freeze({
  INDIVIDUAL: 'INDIVIDUAL',
  BUSINESS: 'BUSINESS',
});

const OWNERSHIP_TYPE_VALUES = Object.freeze(Object.values(OWNERSHIP_TYPE));

function isValidOwnershipType(value) {
  return OWNERSHIP_TYPE_VALUES.includes(value);
}

// The KYC/RICA verification state of a porting/onboarding case. Verification
// begins NOT_STARTED, moves to PENDING once submitted, may require
// ADDITIONAL_VERIFICATION_REQUIRED, and ends in a terminal VERIFIED or FAILED
// state.
const VERIFICATION_STATUS = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  ADDITIONAL_VERIFICATION_REQUIRED: 'ADDITIONAL_VERIFICATION_REQUIRED',
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
});

const VERIFICATION_STATUS_VALUES = Object.freeze(Object.values(VERIFICATION_STATUS));

function isValidVerificationStatus(value) {
  return VERIFICATION_STATUS_VALUES.includes(value);
}

// The outcome of a porting eligibility assessment: ELIGIBLE to port,
// NEEDS_VERIFICATION (further verification required before porting can
// proceed), or UNSUPPORTED (porting is not available for this number/donor).
const PORTING_OUTCOME = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
  UNSUPPORTED: 'UNSUPPORTED',
});

const PORTING_OUTCOME_VALUES = Object.freeze(Object.values(PORTING_OUTCOME));

function isValidPortingOutcome(value) {
  return PORTING_OUTCOME_VALUES.includes(value);
}

module.exports = {
  DONOR_NETWORK,
  DONOR_NETWORK_VALUES,
  isValidDonorNetwork,
  isValidDonorOperator,
  OWNERSHIP_TYPE,
  OWNERSHIP_TYPE_VALUES,
  isValidOwnershipType,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_VALUES,
  isValidVerificationStatus,
  PORTING_OUTCOME,
  PORTING_OUTCOME_VALUES,
  isValidPortingOutcome,
};
