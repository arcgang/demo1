'use strict';

// Acceptance tests (unit): the deterministic, rule-based trade-in valuation
// mock adapter (HLD section 9.3, "Trade-In Valuation Boundary").
//
// `src/tradein-valuation.js` is a mock of the external Trade-In Valuation
// Service. It performs NO network calls: valuation is derived from purely
// in-process rules keyed off device model and condition, so demo runs are
// fully reproducible.
//
// It exports:
//
//   valuateTradeIn({ deviceModel, condition, ...attributes })
//     Validate the inputs and return an indicative value RANGE of the shape:
//       {
//         valueMin: <number>   lower bound of the indicative credit (>= 0)
//         valueMax: <number>   upper bound of the indicative credit
//         currency: <string>   non-empty ISO currency code
//       }
//     with valueMin <= valueMax. The result is fully determined by the inputs:
//     identical inputs yield an identical range.
//
//   TRADE_IN_CONDITION          frozen enum of the shared condition vocabulary
//   TRADE_IN_CONDITION_VALUES   frozen array of the enum values
//   isValidTradeInCondition(v)  -> boolean
//
// Input validation follows the explicit, plain-`throw new Error(...)` style
// used in src/index.js and src/cart.js:
//   - a missing/blank `deviceModel` throws;
//   - a missing / invalid `condition` (not in the shared vocabulary) throws.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const tradeIn = require('../src/tradein-valuation.js');

// A representative, arbitrary device model. Valuation is keyed off model but an
// unrecognised model is NOT a validation error — only missing/blank models are.
const MODEL = 'iPhone 12';

// ---------------------------------------------------------------------------
// Exports / shape
// ---------------------------------------------------------------------------

test('module exports valuateTradeIn as a function', () => {
  assert.equal(typeof tradeIn.valuateTradeIn, 'function');
});

test('module exports the shared condition vocabulary', () => {
  assert.equal(typeof tradeIn.TRADE_IN_CONDITION, 'object');
  assert.notEqual(tradeIn.TRADE_IN_CONDITION, null);
  assert.ok(Array.isArray(tradeIn.TRADE_IN_CONDITION_VALUES));
  assert.equal(typeof tradeIn.isValidTradeInCondition, 'function');
});

test('TRADE_IN_CONDITION is frozen and maps each member to its own name', () => {
  assert.equal(Object.isFrozen(tradeIn.TRADE_IN_CONDITION), true);
  for (const [key, value] of Object.entries(tradeIn.TRADE_IN_CONDITION)) {
    assert.equal(key, value, `condition ${key} should map to its own name`);
  }
});

test('TRADE_IN_CONDITION_VALUES matches Object.values(TRADE_IN_CONDITION) and is frozen', () => {
  assert.deepEqual(
    [...tradeIn.TRADE_IN_CONDITION_VALUES],
    Object.values(tradeIn.TRADE_IN_CONDITION),
  );
  assert.equal(Object.isFrozen(tradeIn.TRADE_IN_CONDITION_VALUES), true);
});

test('the condition vocabulary offers multiple distinct tiers, including GOOD', () => {
  // The HLD trade-in quote example (5.9) uses condition "GOOD"; the vocabulary
  // must recognise it, and must offer more than one tier so tiers can differ.
  assert.ok(
    tradeIn.TRADE_IN_CONDITION_VALUES.length >= 2,
    'expected at least two condition tiers',
  );
  assert.equal(tradeIn.isValidTradeInCondition('GOOD'), true);
});

test('isValidTradeInCondition accepts every vocabulary value and rejects others', () => {
  for (const value of tradeIn.TRADE_IN_CONDITION_VALUES) {
    assert.equal(tradeIn.isValidTradeInCondition(value), true, `expected ${value} to be valid`);
  }
  assert.equal(tradeIn.isValidTradeInCondition('DEFINITELY_NOT_A_CONDITION'), false);
  assert.equal(tradeIn.isValidTradeInCondition('good'), false); // case-sensitive
  assert.equal(tradeIn.isValidTradeInCondition(''), false);
  assert.equal(tradeIn.isValidTradeInCondition(undefined), false);
  assert.equal(tradeIn.isValidTradeInCondition(null), false);
});

// ---------------------------------------------------------------------------
// A valid quote returns a well-formed min <= max range
// ---------------------------------------------------------------------------

test('valuateTradeIn returns a { valueMin, valueMax, currency } range', () => {
  const quote = tradeIn.valuateTradeIn({ deviceModel: MODEL, condition: 'GOOD' });

  assert.equal(typeof quote, 'object');
  assert.notEqual(quote, null);
  assert.equal(typeof quote.valueMin, 'number');
  assert.equal(typeof quote.valueMax, 'number');
  assert.equal(typeof quote.currency, 'string');
  assert.notEqual(quote.currency.trim(), '');
});

test('the returned range has valueMin <= valueMax and both are non-negative', () => {
  const quote = tradeIn.valuateTradeIn({ deviceModel: MODEL, condition: 'GOOD' });

  assert.ok(Number.isFinite(quote.valueMin), 'valueMin should be a finite number');
  assert.ok(Number.isFinite(quote.valueMax), 'valueMax should be a finite number');
  assert.ok(quote.valueMin >= 0, 'valueMin should be non-negative');
  assert.ok(
    quote.valueMin <= quote.valueMax,
    `expected valueMin (${quote.valueMin}) <= valueMax (${quote.valueMax})`,
  );
});

test('valuateTradeIn is deterministic: identical inputs yield an identical range', () => {
  const args = { deviceModel: MODEL, condition: 'GOOD' };
  assert.deepEqual(
    tradeIn.valuateTradeIn(args),
    tradeIn.valuateTradeIn({ ...args }),
  );
});

test('extra device attributes are accepted alongside the required inputs', () => {
  // The signature is ({ deviceModel, condition, ...attributes }); passing extra
  // attributes (as the HLD device payload carries) must not break valuation.
  const quote = tradeIn.valuateTradeIn({
    deviceModel: MODEL,
    condition: 'GOOD',
    brand: 'Apple',
    storageGb: 128,
    screenCondition: 'MINOR_SCRATCHES',
  });
  assert.ok(quote.valueMin <= quote.valueMax);
});

// ---------------------------------------------------------------------------
// Each condition tier produces a distinct valuation
// ---------------------------------------------------------------------------

test('each condition tier produces a distinct value range for the same model', () => {
  const ranges = tradeIn.TRADE_IN_CONDITION_VALUES.map((condition) =>
    tradeIn.valuateTradeIn({ deviceModel: MODEL, condition }),
  );

  // Every tier is a well-formed range.
  for (const range of ranges) {
    assert.ok(range.valueMin <= range.valueMax);
  }

  // No two tiers collapse to the same [min, max] pair.
  const fingerprints = ranges.map((r) => `${r.valueMin}:${r.valueMax}`);
  assert.equal(
    new Set(fingerprints).size,
    fingerprints.length,
    'each condition tier should produce a distinct value range',
  );
});

// ---------------------------------------------------------------------------
// Validation errors: missing model / invalid (or missing) condition
// ---------------------------------------------------------------------------

test('valuateTradeIn throws when called with no arguments', () => {
  assert.throws(() => tradeIn.valuateTradeIn());
});

test('valuateTradeIn throws when deviceModel is missing or blank', () => {
  assert.throws(() => tradeIn.valuateTradeIn({ condition: 'GOOD' }));
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: '', condition: 'GOOD' }));
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: '   ', condition: 'GOOD' }));
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: null, condition: 'GOOD' }));
});

test('valuateTradeIn throws when condition is missing', () => {
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: MODEL }));
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: MODEL, condition: null }));
});

test('valuateTradeIn throws when condition is not in the shared vocabulary', () => {
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: MODEL, condition: 'BRAND_NEW_ISH' }));
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: MODEL, condition: 'good' }));
  assert.throws(() => tradeIn.valuateTradeIn({ deviceModel: MODEL, condition: 42 }));
});
