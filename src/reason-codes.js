'use strict';

// The error reason-code and message catalog: the single source of truth for
// blocking-state messaging. It mirrors the frozen-enum pattern of
// `requirement.js` and `status.js`.
//
// Each REASON_CODE names a failure that already exists in the service layer
// today (see `index.js` and `recommend.js`) and carries a user-friendly
// explanation (`message`), a next-step hint (`nextStep`) and a default
// `category`. The catalog and every vocabulary here are immutable (frozen).

// ---------------------------------------------------------------------------
// REASON_CODE enum
// ---------------------------------------------------------------------------

const REASON_CODE = Object.freeze({
  // recommend()/attach(): a device id was missing or not a usable value.
  MISSING_OR_INVALID_DEVICE_ID: 'MISSING_OR_INVALID_DEVICE_ID',
  // The supplied device id references no catalog device.
  UNKNOWN_DEVICE: 'UNKNOWN_DEVICE',
  // recommend(): a customer context is required but was not supplied.
  MISSING_CUSTOMER_CONTEXT: 'MISSING_CUSTOMER_CONTEXT',
  // attach(): the requirement flag was missing or not REQUIRED/OPTIONAL.
  MISSING_OR_INVALID_REQUIREMENT: 'MISSING_OR_INVALID_REQUIREMENT',
  // attach(): an attachment referenced neither a bundle nor an accessory.
  NO_ADDON_REFERENCED: 'NO_ADDON_REFERENCED',
  // getAttachmentsForDevice*(): the requirement filter was not a valid value.
  INVALID_REQUIREMENT_FILTER: 'INVALID_REQUIREMENT_FILTER',
  // Generic fallback for anything not otherwise classified.
  UNEXPECTED: 'UNEXPECTED',
});

const REASON_CODE_VALUES = Object.freeze(Object.values(REASON_CODE));

// ---------------------------------------------------------------------------
// CATEGORY vocabulary
// ---------------------------------------------------------------------------

// How a blocking state should be handled: the customer can safely retry, they
// need to contact support, or they need to provide/correct documentation.
const CATEGORY = Object.freeze({
  RETRYABLE: 'RETRYABLE',
  NEEDS_SUPPORT: 'NEEDS_SUPPORT',
  NEEDS_DOCUMENTATION: 'NEEDS_DOCUMENTATION',
});

const CATEGORY_VALUES = Object.freeze(Object.values(CATEGORY));

// ---------------------------------------------------------------------------
// STATE_PRESERVATION vocabulary
// ---------------------------------------------------------------------------

// What happened to any in-progress cart/order/payment state when the failure
// occurred: it was kept, it was thrown away, or its fate is not known.
const STATE_PRESERVATION = Object.freeze({
  PRESERVED: 'PRESERVED',
  DISCARDED: 'DISCARDED',
  UNKNOWN: 'UNKNOWN',
});

const STATE_PRESERVATION_VALUES = Object.freeze(Object.values(STATE_PRESERVATION));

// ---------------------------------------------------------------------------
// Catalog: message + next-step + default category per reason code
// ---------------------------------------------------------------------------

const CATALOG = Object.freeze({
  [REASON_CODE.MISSING_OR_INVALID_DEVICE_ID]: Object.freeze({
    code: REASON_CODE.MISSING_OR_INVALID_DEVICE_ID,
    message: 'We could not tell which device you are looking at.',
    nextStep: 'Choose a device again and retry.',
    category: CATEGORY.RETRYABLE,
  }),
  [REASON_CODE.UNKNOWN_DEVICE]: Object.freeze({
    code: REASON_CODE.UNKNOWN_DEVICE,
    message: 'The selected device is no longer available in our catalog.',
    nextStep: 'Return to the catalog and pick an available device.',
    category: CATEGORY.RETRYABLE,
  }),
  [REASON_CODE.MISSING_CUSTOMER_CONTEXT]: Object.freeze({
    code: REASON_CODE.MISSING_CUSTOMER_CONTEXT,
    message: 'We need to know who you are before we can tailor recommendations.',
    nextStep: 'Sign in or continue as a guest, then retry.',
    category: CATEGORY.NEEDS_SUPPORT,
  }),
  [REASON_CODE.MISSING_OR_INVALID_REQUIREMENT]: Object.freeze({
    code: REASON_CODE.MISSING_OR_INVALID_REQUIREMENT,
    message: 'This add-on is missing a valid required-or-optional setting.',
    nextStep: 'Mark the add-on as REQUIRED or OPTIONAL and try again.',
    category: CATEGORY.NEEDS_DOCUMENTATION,
  }),
  [REASON_CODE.NO_ADDON_REFERENCED]: Object.freeze({
    code: REASON_CODE.NO_ADDON_REFERENCED,
    message: 'No bundle or accessory was chosen to attach to this device.',
    nextStep: 'Select at least one bundle or accessory, then retry.',
    category: CATEGORY.RETRYABLE,
  }),
  [REASON_CODE.INVALID_REQUIREMENT_FILTER]: Object.freeze({
    code: REASON_CODE.INVALID_REQUIREMENT_FILTER,
    message: 'The requirement filter used to load add-ons was not valid.',
    nextStep: 'Filter by REQUIRED or OPTIONAL, or clear the filter, and retry.',
    category: CATEGORY.NEEDS_DOCUMENTATION,
  }),
  [REASON_CODE.UNEXPECTED]: Object.freeze({
    code: REASON_CODE.UNEXPECTED,
    message: 'Something went wrong on our side while processing your request.',
    nextStep: 'Please try again shortly or contact support if it persists.',
    category: CATEGORY.NEEDS_SUPPORT,
  }),
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

// Return true when `code` is one of the known REASON_CODE values.
function isValidReasonCode(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, code);
}

// Return the frozen metadata ({ code, message, nextStep, category }) for a
// known reason code. Throws for unknown or malformed codes.
function getReasonMeta(code) {
  if (!isValidReasonCode(code)) {
    throw new Error(`unknown reason code: ${JSON.stringify(code)}`);
  }
  return CATALOG[code];
}

module.exports = {
  REASON_CODE,
  REASON_CODE_VALUES,
  CATEGORY,
  CATEGORY_VALUES,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
  getReasonMeta,
  isValidReasonCode,
};
