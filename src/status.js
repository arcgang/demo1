'use strict';

// The payment/activation status vocabulary shared by the schema (CHECK
// constraints), the payment/activation services, and the retry-messaging
// helper. This is the single source of truth for these status strings.

// A payment attempt progresses from INITIATED, through PENDING (awaiting
// provider confirmation), to a terminal CONFIRMED or FAILED state.
const PAYMENT_STATUS = Object.freeze({
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
  CONFIRMED: 'CONFIRMED',
});

const PAYMENT_STATUS_VALUES = Object.freeze(Object.values(PAYMENT_STATUS));

function isValidPaymentStatus(value) {
  return PAYMENT_STATUS_VALUES.includes(value);
}

// Activation begins NOT_STARTED, moves to PENDING once prerequisites are met,
// and ends in a terminal ACTIVATED or FAILED state.
const ACTIVATION_STATUS = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  ACTIVATED: 'ACTIVATED',
  FAILED: 'FAILED',
});

const ACTIVATION_STATUS_VALUES = Object.freeze(Object.values(ACTIVATION_STATUS));

function isValidActivationStatus(value) {
  return ACTIVATION_STATUS_VALUES.includes(value);
}

module.exports = {
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  isValidPaymentStatus,
  ACTIVATION_STATUS,
  ACTIVATION_STATUS_VALUES,
  isValidActivationStatus,
};
