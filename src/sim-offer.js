'use strict';

// The SIM offer type vocabulary shared by the schema (CHECK constraint) and the
// application layer. A SIM/eSIM offer is either a physical SIM or a digital
// ESIM, following the SIM/eSIM onboarding scope in the LLD.
const SIM_OFFER_TYPE = Object.freeze({
  SIM: 'SIM',
  ESIM: 'ESIM',
});

const SIM_OFFER_TYPE_VALUES = Object.freeze(Object.values(SIM_OFFER_TYPE));

function isValidSimOfferType(value) {
  return SIM_OFFER_TYPE_VALUES.includes(value);
}

module.exports = { SIM_OFFER_TYPE, SIM_OFFER_TYPE_VALUES, isValidSimOfferType };
