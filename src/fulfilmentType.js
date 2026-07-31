'use strict';

// The fulfilment-type vocabulary shared by the schema (the `sim_offers` CHECK
// constraint) and the application layer. A SIM/eSIM offer is fulfilled either
// as a physical SIM (SIM) or as an embedded SIM profile (ESIM). Mirrors the
// `src/requirement.js` / `src/status.js` pattern and is the single source of
// truth for these strings.
const FULFILMENT_TYPE = Object.freeze({
  SIM: 'SIM',
  ESIM: 'ESIM',
});

const FULFILMENT_TYPE_VALUES = Object.freeze(Object.values(FULFILMENT_TYPE));

function isValidFulfilmentType(value) {
  return FULFILMENT_TYPE_VALUES.includes(value);
}

module.exports = { FULFILMENT_TYPE, FULFILMENT_TYPE_VALUES, isValidFulfilmentType };
