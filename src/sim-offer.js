'use strict';

// The SIM/eSIM offer vocabulary shared by the schema (CHECK constraints) and
// the application layer, following the same enum-backed pattern as
// requirement.js and order-status.js.

// A SIM offer is either a physical SIM or an eSIM.
const SIM_TYPE = Object.freeze({
  SIM: 'SIM',
  ESIM: 'ESIM',
});

const SIM_TYPE_VALUES = Object.freeze(Object.values(SIM_TYPE));

function isValidSimType(value) {
  return SIM_TYPE_VALUES.includes(value);
}

// Onboarding implication: when the SIM/eSIM becomes usable. IMMEDIATE offers
// activate on purchase; POST_VERIFICATION offers activate only once identity
// verification (KYC/RICA) has completed.
const ACTIVATION_TYPE = Object.freeze({
  IMMEDIATE: 'IMMEDIATE',
  POST_VERIFICATION: 'POST_VERIFICATION',
});

const ACTIVATION_TYPE_VALUES = Object.freeze(Object.values(ACTIVATION_TYPE));

function isValidActivationType(value) {
  return ACTIVATION_TYPE_VALUES.includes(value);
}

module.exports = {
  SIM_TYPE,
  SIM_TYPE_VALUES,
  isValidSimType,
  ACTIVATION_TYPE,
  ACTIVATION_TYPE_VALUES,
  isValidActivationType,
};
