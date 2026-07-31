'use strict';

// Error normalization: turn ANY thrown value into the stable, serializable
// shape the future API/frontend layer consumes.
//
//   {
//     reasonCode,          // a REASON_CODE value
//     message,             // customer-facing message (never a raw Error message)
//     nextStep,            // next-step hint
//     category,            // a CATEGORY value
//     retryable,           // boolean, derived from category
//     statePreservation,   // { cart, order, payment } of STATE_PRESERVATION values
//   }
//
// An `AppError` already carries this contract, so its fields map straight
// through (`userMessage` becomes the output `message`). Anything else — a bare
// Error, an Error subclass, or a non-Error thrown value — is downgraded to the
// UNEXPECTED reason code: non-retryable, with every state facet UNKNOWN, and
// its own message kept out of the customer-facing `message`.

const { AppError } = require('./app-error.js');
const {
  REASON_CODE,
  STATE_PRESERVATION,
  getReasonMeta,
} = require('./reason-codes.js');

// Copy the { cart, order, payment } facets into a fresh plain object so the
// output never shares a reference with (or the prototype of) the source error.
function plainStatePreservation(source) {
  return {
    cart: source.cart,
    order: source.order,
    payment: source.payment,
  };
}

// Every state facet is UNKNOWN when we could not classify the failure.
function unknownStatePreservation() {
  return {
    cart: STATE_PRESERVATION.UNKNOWN,
    order: STATE_PRESERVATION.UNKNOWN,
    payment: STATE_PRESERVATION.UNKNOWN,
  };
}

// The downgrade used for anything that is not a well-formed AppError. The raw
// value's own message is deliberately dropped from the customer-facing output.
function unexpectedShape() {
  const meta = getReasonMeta(REASON_CODE.UNEXPECTED);
  return {
    reasonCode: REASON_CODE.UNEXPECTED,
    message: meta.message,
    nextStep: meta.nextStep,
    category: meta.category,
    retryable: false,
    statePreservation: unknownStatePreservation(),
  };
}

function toUserFacingError(err) {
  if (err instanceof AppError) {
    return {
      reasonCode: err.reasonCode,
      message: err.userMessage,
      nextStep: err.nextStep,
      category: err.category,
      retryable: err.retryable,
      statePreservation: plainStatePreservation(err.statePreservation),
    };
  }

  return unexpectedShape();
}

module.exports = {
  toUserFacingError,
};
