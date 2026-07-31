'use strict';

// A typed backend error carrying the blocking-state contract.
//
// `AppError` extends the built-in Error and pairs a validated reason code from
// the catalog in `reason-codes.js` with everything a caller needs to react to a
// failure: the customer-facing `userMessage`, a `nextStep` hint, the handling
// `category`, whether the failure is `retryable` (derived from the category),
// what happened to in-progress cart/order/payment state
// (`statePreservation`), and the originating `cause`.
//
// Defaults are sourced from the catalog so most call sites can construct one
// from just a reason code; the `fromReasonCode` factory keeps those sites terse.

const {
  CATEGORY,
  STATE_PRESERVATION,
  getReasonMeta,
} = require('./reason-codes.js');

// A failure is retryable only when its effective category says so.
function deriveRetryable(category) {
  return category === CATEGORY.RETRYABLE;
}

// By default nothing is lost: cart, order and payment state are all preserved.
function defaultStatePreservation() {
  return {
    cart: STATE_PRESERVATION.PRESERVED,
    order: STATE_PRESERVATION.PRESERVED,
    payment: STATE_PRESERVATION.PRESERVED,
  };
}

class AppError extends Error {
  constructor(reasonCode, opts = {}) {
    // Validates `reasonCode`; throws for unknown or malformed codes.
    const meta = getReasonMeta(reasonCode);

    const {
      userMessage = meta.message,
      nextStep = meta.nextStep,
      category = meta.category,
      statePreservation,
      cause,
    } = opts || {};

    // The Error `message` mirrors the customer-facing `userMessage`. Only pass
    // `cause` through to the Error options when one was actually supplied so it
    // stays absent otherwise.
    super(userMessage, cause === undefined ? undefined : { cause });

    this.name = 'AppError';
    this.reasonCode = reasonCode;
    this.category = category;
    this.retryable = deriveRetryable(category);
    this.userMessage = userMessage;
    this.nextStep = nextStep;
    this.statePreservation = {
      ...defaultStatePreservation(),
      ...(statePreservation || {}),
    };
  }
}

// Terse factory so call sites can write `fromReasonCode(REASON_CODE.X)` instead
// of `new AppError(REASON_CODE.X)`.
function fromReasonCode(reasonCode, opts) {
  return new AppError(reasonCode, opts);
}

module.exports = {
  AppError,
  fromReasonCode,
};
