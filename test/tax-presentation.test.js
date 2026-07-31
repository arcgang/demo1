'use strict';

// Acceptance tests (unit): the tax presentation service.
//
// `presentTax(amount, marketContext)` applies the market's tax rules and
// returns a tax presentation breakdown that the catalog browse service embeds
// per displayed offer.
//
// The service is expected to live in src/tax.js and to be re-exported from the
// data-model API as
//
//   model.presentTax(amount, marketContext)
//
// following the existing pattern used by recommend/recalculateCart/resolveMarket.
//
// `marketContext` is shaped like the MarketContext returned by resolveMarket:
//
//   {
//     code, name, currency, defaultLanguage,
//     tax: { rate, inclusive, label },
//   }
//
// The return value is a breakdown shaped like:
//
//   {
//     net,        // amount before tax
//     tax,        // the tax portion
//     gross,      // amount including tax (net + tax)
//     rate,       // the tax rate applied (0 when absent)
//     label,      // the tax label (e.g. 'VAT')
//     inclusive,  // boolean: was the input treated as tax-inclusive?
//   }
//
// Semantics:
//   - When tax.inclusive is TRUE the input `amount` is the GROSS figure and the
//     tax is BACK-COMPUTED (net = amount / (1 + rate), tax = amount - net).
//   - When tax.inclusive is FALSE the tax is ADDED ON TOP
//     (net = amount, tax = amount * rate, gross = amount + tax).
//   - A zero or absent rate is handled gracefully: no tax, net == gross == amount.
//
// These tests are written BEFORE the service exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const tax = require('../src/tax.js');

// Currency-scale tolerance for back-computed (inclusive) figures where the exact
// division does not land on a clean binary float.
const EPS = 1e-9;

function approx(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${message} (expected ~${expected}, got ${actual})`,
  );
}

// Build a MarketContext-shaped object for a given set of tax rules.
function marketContext({ rate, inclusive, label = 'VAT', currency = 'ZAR' }) {
  return {
    code: 'ZA',
    name: 'South Africa',
    currency,
    defaultLanguage: 'en-ZA',
    tax: { rate, inclusive, label },
  };
}

// ---------------------------------------------------------------------------
// Exposure / contract
// ---------------------------------------------------------------------------

test('presentTax is exported from src/tax.js', () => {
  assert.equal(typeof tax.presentTax, 'function', 'src/tax.js should export presentTax');
});

test('presentTax is re-exported from the model API', () => {
  assert.equal(typeof model.presentTax, 'function', 'model.presentTax should be a function');
});

test('the same presentTax function is shared between src/tax.js and the model API', () => {
  assert.equal(model.presentTax, tax.presentTax, 'the model should re-export the tax service');
});

// ---------------------------------------------------------------------------
// Tax-exclusive markets: tax is ADDED ON TOP of the input amount
// ---------------------------------------------------------------------------

test('exclusive market adds tax on top of the amount', () => {
  const ctx = marketContext({ rate: 0.15, inclusive: false });

  const breakdown = model.presentTax(100, ctx);

  approx(breakdown.net, 100, 'net equals the input amount for an exclusive market');
  approx(breakdown.tax, 15, 'tax is amount * rate');
  approx(breakdown.gross, 115, 'gross is amount + tax');
  assert.equal(breakdown.inclusive, false, 'inclusive flag reflects the market rule');
  assert.equal(breakdown.rate, 0.15, 'the applied rate is echoed');
  assert.equal(breakdown.label, 'VAT', 'the tax label is echoed');
});

test('exclusive market: gross is strictly greater than the input amount', () => {
  const ctx = marketContext({ rate: 0.18, inclusive: false });

  const breakdown = model.presentTax(200, ctx);

  approx(breakdown.net, 200, 'net is the pre-tax input amount');
  approx(breakdown.tax, 36, 'tax is 200 * 0.18');
  approx(breakdown.gross, 236, 'gross is 200 + 36');
});

// ---------------------------------------------------------------------------
// Tax-inclusive markets: the input amount is GROSS, tax is BACK-COMPUTED
// ---------------------------------------------------------------------------

test('inclusive market treats the amount as gross and back-computes the tax', () => {
  const ctx = marketContext({ rate: 0.15, inclusive: true });

  const breakdown = model.presentTax(115, ctx);

  approx(breakdown.gross, 115, 'gross equals the input amount for an inclusive market');
  approx(breakdown.net, 100, 'net is amount / (1 + rate)');
  approx(breakdown.tax, 15, 'tax is gross - net');
  assert.equal(breakdown.inclusive, true, 'inclusive flag reflects the market rule');
  assert.equal(breakdown.rate, 0.15, 'the applied rate is echoed');
});

test('inclusive market: net + tax reconstructs the original gross amount', () => {
  const ctx = marketContext({ rate: 0.15, inclusive: true });

  const breakdown = model.presentTax(115, ctx);

  approx(breakdown.net + breakdown.tax, 115, 'the parts must reconstruct the gross input');
  approx(breakdown.gross, breakdown.net + breakdown.tax, 'gross must equal net + tax');
});

// ---------------------------------------------------------------------------
// The net + tax == gross invariant holds regardless of inclusive/exclusive
// ---------------------------------------------------------------------------

for (const inclusive of [true, false]) {
  test(`net + tax always equals gross (inclusive=${inclusive})`, () => {
    const ctx = marketContext({ rate: 0.15, inclusive });

    const breakdown = model.presentTax(345.67, ctx);

    approx(breakdown.net + breakdown.tax, breakdown.gross, 'net + tax must equal gross');
    assert.equal(breakdown.inclusive, inclusive, 'inclusive flag is echoed faithfully');
  });
}

// ---------------------------------------------------------------------------
// Zero / absent rate is handled gracefully
// ---------------------------------------------------------------------------

test('a zero rate produces no tax: net == gross == amount', () => {
  const ctx = marketContext({ rate: 0, inclusive: false });

  const breakdown = model.presentTax(500, ctx);

  approx(breakdown.tax, 0, 'a zero rate must produce zero tax');
  approx(breakdown.net, 500, 'net is the untaxed amount');
  approx(breakdown.gross, 500, 'gross equals net when there is no tax');
  assert.equal(breakdown.rate, 0, 'the applied rate is reported as 0');
});

test('a zero rate on an inclusive market still produces no tax', () => {
  const ctx = marketContext({ rate: 0, inclusive: true });

  const breakdown = model.presentTax(500, ctx);

  approx(breakdown.tax, 0, 'no tax with a zero rate even when inclusive');
  approx(breakdown.net, 500, 'net equals the gross when there is no tax');
  approx(breakdown.gross, 500, 'gross equals the input amount');
});

test('an absent rate (undefined) is treated as no tax', () => {
  const ctx = marketContext({ rate: undefined, inclusive: false });

  const breakdown = model.presentTax(500, ctx);

  approx(breakdown.tax, 0, 'an absent rate must not throw and must yield zero tax');
  approx(breakdown.net, 500, 'net is the full amount');
  approx(breakdown.gross, 500, 'gross equals net when the rate is absent');
  assert.equal(breakdown.rate, 0, 'an absent rate is normalized to 0');
});

test('a null rate is treated as no tax', () => {
  const ctx = marketContext({ rate: null, inclusive: true });

  const breakdown = model.presentTax(500, ctx);

  approx(breakdown.tax, 0, 'a null rate must not throw and must yield zero tax');
  approx(breakdown.net, 500, 'net is the full amount');
  approx(breakdown.gross, 500, 'gross equals net when the rate is null');
  assert.equal(breakdown.rate, 0, 'a null rate is normalized to 0');
});

// ---------------------------------------------------------------------------
// The label is carried through from the market context
// ---------------------------------------------------------------------------

test('the tax label from the market context is carried into the breakdown', () => {
  const ctx = marketContext({ rate: 0.16, inclusive: false, label: 'GST' });

  const breakdown = model.presentTax(100, ctx);

  assert.equal(breakdown.label, 'GST', 'the breakdown label mirrors the market tax label');
});

// ---------------------------------------------------------------------------
// Integration: the breakdown consumes a real resolveMarket MarketContext
// ---------------------------------------------------------------------------

test('presentTax consumes a MarketContext produced by resolveMarket (inclusive market)', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('ZA', 'South Africa', 'ZAR', 'en-ZA', 0.15, 1, 'VAT');

  const ctx = model.resolveMarket(db, { selectedMarketCode: 'ZA' });
  const breakdown = model.presentTax(115, ctx);

  assert.equal(breakdown.inclusive, true, 'the ZA market is tax-inclusive');
  assert.equal(breakdown.label, 'VAT', 'the label flows from the resolved market context');
  assert.equal(breakdown.rate, 0.15, 'the rate flows from the resolved market context');
  approx(breakdown.gross, 115, 'the input is treated as gross for an inclusive market');
  approx(breakdown.net, 100, 'net is back-computed from the gross');
  approx(breakdown.tax, 15, 'tax is back-computed from the gross');
});

test('presentTax consumes a MarketContext produced by resolveMarket (exclusive market)', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('TZ', 'Tanzania', 'TZS', 'sw-TZ', 0.18, 0, 'VAT');

  const ctx = model.resolveMarket(db, { selectedMarketCode: 'TZ' });
  const breakdown = model.presentTax(200, ctx);

  assert.equal(breakdown.inclusive, false, 'the TZ market is tax-exclusive');
  assert.equal(breakdown.rate, 0.18, 'the rate flows from the resolved market context');
  approx(breakdown.net, 200, 'net equals the pre-tax input for an exclusive market');
  approx(breakdown.tax, 36, 'tax is added on top: 200 * 0.18');
  approx(breakdown.gross, 236, 'gross is 200 + 36');
});
