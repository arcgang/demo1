'use strict';

// The consent-purpose vocabulary shared by the schema (consent_record CHECK
// constraint) and the application layer, mirroring the frozen-enum pattern of
// src/requirement.js and src/status.js.
//
// This module is the single source of truth that keeps marketing /
// personalization consent conceptually separate from the operationally
// required processing that an order needs to be fulfilled. OPERATIONAL_ORDER_
// PROCESSING is required; MARKETING and PERSONALIZATION are optional and must
// be captured separately (POPIA: separate optional consent capture).
const CONSENT_PURPOSE = Object.freeze({
  OPERATIONAL_ORDER_PROCESSING: 'OPERATIONAL_ORDER_PROCESSING',
  MARKETING: 'MARKETING',
  PERSONALIZATION: 'PERSONALIZATION',
});

const CONSENT_PURPOSE_VALUES = Object.freeze(Object.values(CONSENT_PURPOSE));

function isValidConsentPurpose(value) {
  return CONSENT_PURPOSE_VALUES.includes(value);
}

// The purposes that are optional (opt-in). Everything else — currently only
// OPERATIONAL_ORDER_PROCESSING — is operationally required.
const OPTIONAL_CONSENT_PURPOSES = Object.freeze(
  new Set([CONSENT_PURPOSE.MARKETING, CONSENT_PURPOSE.PERSONALIZATION]),
);

function isOptionalConsentPurpose(purpose) {
  return OPTIONAL_CONSENT_PURPOSES.has(purpose);
}

module.exports = {
  CONSENT_PURPOSE,
  CONSENT_PURPOSE_VALUES,
  isValidConsentPurpose,
  OPTIONAL_CONSENT_PURPOSES,
  isOptionalConsentPurpose,
};
