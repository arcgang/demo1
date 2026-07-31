'use strict';

// The order/activation status vocabulary shared by the schema (CHECK
// constraints) and the application layer. This is the single source of truth
// for these status strings.
//
// A customer's journey moves through four PHASES, each of which carries its
// own set of meaningful states — this is deliberately NOT a generic
// "pending only" vocabulary. PENDING is the only value common to every phase;
// every phase adds its own distinct, meaningful states.

// The four phases of the order/activation journey.
const STATUS_PHASES = Object.freeze({
  PAYMENT: 'PAYMENT',
  VERIFICATION: 'VERIFICATION',
  FULFILMENT: 'FULFILMENT',
  ACTIVATION: 'ACTIVATION',
});

const STATUS_PHASES_VALUES = Object.freeze(Object.values(STATUS_PHASES));

function isValidStatusPhase(value) {
  return STATUS_PHASES_VALUES.includes(value);
}

// PAYMENT: a payment attempt is PENDING (awaiting provider confirmation),
// AUTHORIZED (funds confirmed), or FAILED.
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  FAILED: 'FAILED',
});

const PAYMENT_STATUS_VALUES = Object.freeze(Object.values(PAYMENT_STATUS));

function isValidPaymentStatus(value) {
  return PAYMENT_STATUS_VALUES.includes(value);
}

// VERIFICATION: KYC/RICA verification is NOT_REQUIRED for unregulated
// products, otherwise PENDING until it has PASSED or FAILED.
const VERIFICATION_STATUS = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
});

const VERIFICATION_STATUS_VALUES = Object.freeze(Object.values(VERIFICATION_STATUS));

function isValidVerificationStatus(value) {
  return VERIFICATION_STATUS_VALUES.includes(value);
}

// FULFILMENT: order fulfilment is PENDING, then IN_PROGRESS, then COMPLETED.
const FULFILMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
});

const FULFILMENT_STATUS_VALUES = Object.freeze(Object.values(FULFILMENT_STATUS));

function isValidFulfilmentStatus(value) {
  return FULFILMENT_STATUS_VALUES.includes(value);
}

// ACTIVATION: activation is PENDING, BLOCKED (waiting on payment/verification
// prerequisites), ACTIVE once complete, or FAILED.
const ACTIVATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  BLOCKED: 'BLOCKED',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
});

const ACTIVATION_STATUS_VALUES = Object.freeze(Object.values(ACTIVATION_STATUS));

function isValidActivationStatus(value) {
  return ACTIVATION_STATUS_VALUES.includes(value);
}

module.exports = {
  STATUS_PHASES,
  STATUS_PHASES_VALUES,
  isValidStatusPhase,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  isValidPaymentStatus,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_VALUES,
  isValidVerificationStatus,
  FULFILMENT_STATUS,
  FULFILMENT_STATUS_VALUES,
  isValidFulfilmentStatus,
  ACTIVATION_STATUS,
  ACTIVATION_STATUS_VALUES,
  isValidActivationStatus,
};
