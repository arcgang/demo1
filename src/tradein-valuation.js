'use strict';

// Deterministic, rule-based mock of the external Trade-In Valuation Boundary
// (HLD section 9.3, realized by `TradeInAdapter` in section 8.1). This is a
// stand-in for the real Trade-In Valuation Service: it performs NO network
// calls. An indicative credit RANGE is derived from purely in-process rules
// keyed off the device model and its condition, so demo runs are fully
// reproducible — identical inputs always yield an identical range.
//
// This module owns the shared trade-in condition vocabulary. It follows the
// same enum shape as the other vocabulary modules (src/order-status.js,
// src/status.js): a frozen name->name map, a frozen values array, and an
// `isValid...` guard. Input validation uses the explicit, plain
// `throw new Error(...)` style of src/index.js and src/cart.js.

// The device-condition tiers, best to worst. The HLD trade-in quote example
// (section 5.9) submits condition "GOOD", so that tier must exist.
const TRADE_IN_CONDITION = Object.freeze({
  LIKE_NEW: 'LIKE_NEW',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  POOR: 'POOR',
});

const TRADE_IN_CONDITION_VALUES = Object.freeze(Object.values(TRADE_IN_CONDITION));

function isValidTradeInCondition(value) {
  return TRADE_IN_CONDITION_VALUES.includes(value);
}

// The credit multiplier applied to a model's baseline value for each condition
// tier. Distinct per tier so every condition yields a distinct value range.
const CONDITION_MULTIPLIER = Object.freeze({
  [TRADE_IN_CONDITION.LIKE_NEW]: 1.0,
  [TRADE_IN_CONDITION.GOOD]: 0.75,
  [TRADE_IN_CONDITION.FAIR]: 0.5,
  [TRADE_IN_CONDITION.POOR]: 0.25,
});

// The indicative currency for the demo market (ZAR, matching HLD section 5.9).
// The mock does not localize; a real adapter would resolve currency per market.
const DEFAULT_CURRENCY = 'ZAR';

// Baseline (LIKE_NEW) credit anchoring the range, and the half-width of the
// indicative spread expressed as a fraction of the tier value.
const BASE_VALUE = 2000;
const SPREAD_FRACTION = 0.1;

// Derive a stable, non-negative baseline value from the device model string so
// that different models produce different quotes without any lookup table —
// unrecognised models are valued too, deterministically. This is a simple
// rolling hash; its only requirements are determinism and a bounded spread.
function baselineForModel(deviceModel) {
  let hash = 0;
  for (let i = 0; i < deviceModel.length; i += 1) {
    hash = (hash * 31 + deviceModel.charCodeAt(i)) % 100000;
  }
  // Baseline in the range [BASE_VALUE, BASE_VALUE + 3000).
  return BASE_VALUE + (hash % 3000);
}

// Value a device for trade-in, returning an indicative credit RANGE:
//   { valueMin, valueMax, currency }  with 0 <= valueMin <= valueMax.
// `deviceModel` is required (a non-blank string) and `condition` must be a
// member of the shared TRADE_IN_CONDITION vocabulary. Extra device attributes
// (brand, storageGb, screenCondition, ...) are accepted and ignored by the
// mock rules.
function valuateTradeIn({ deviceModel, condition } = {}) {
  if (typeof deviceModel !== 'string' || deviceModel.trim() === '') {
    throw new Error('deviceModel is required');
  }
  if (condition === undefined || condition === null) {
    throw new Error('condition is required (must be one of the trade-in condition vocabulary)');
  }
  if (!isValidTradeInCondition(condition)) {
    throw new Error(
      `condition must be one of ${TRADE_IN_CONDITION_VALUES.join(', ')}; received "${condition}"`,
    );
  }

  const tierValue = baselineForModel(deviceModel.trim()) * CONDITION_MULTIPLIER[condition];
  const spread = tierValue * SPREAD_FRACTION;

  // Round to whole currency units so the range is clean and reproducible.
  const valueMin = Math.max(0, Math.round(tierValue - spread));
  const valueMax = Math.round(tierValue + spread);

  return { valueMin, valueMax, currency: DEFAULT_CURRENCY };
}

module.exports = {
  TRADE_IN_CONDITION,
  TRADE_IN_CONDITION_VALUES,
  isValidTradeInCondition,
  valuateTradeIn,
};
