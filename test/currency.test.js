'use strict';

// Acceptance tests (unit): the market currency formatting utility.
//
// `src/currency.js` exports two PURE helpers (no DB access, unit-testable in
// isolation):
//
//   formatPrice(amount, currency)
//     Render a numeric `amount` as a currency string using
//     Intl.NumberFormat with { style: 'currency', currency }.
//
//   formatMarketPrice(amount, marketContext)
//     Convenience wrapper that reads the ISO currency code from a MarketContext
//     (as produced by model.resolveMarket) and formats `amount` in it.
//
// Both are re-exported from src/index.js.
//
// These tests are written BEFORE the utility exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const currency = require('../src/currency.js');
const model = require('../src/index.js');

// The reference formatter mirrors the required implementation: whatever the
// host ICU/locale produces for `style: 'currency'` is the correct answer. This
// keeps the tests deterministic across environments while still asserting the
// helper uses Intl currency formatting.
function reference(amount, code) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount);
}

// A MarketContext-shaped fixture (same shape model.resolveMarket returns).
function marketContext(code, ccy) {
  return {
    code,
    name: `${code} market`,
    currency: ccy,
    defaultLanguage: 'en',
    tax: { rate: 0.15, inclusive: true, label: 'VAT' },
  };
}

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

test('currency module exports formatPrice as a function', () => {
  assert.equal(typeof currency.formatPrice, 'function');
});

test('formatPrice returns a string', () => {
  assert.equal(typeof currency.formatPrice(1234.5, 'ZAR'), 'string');
});

test('formatPrice formats ZAR using Intl currency formatting', () => {
  assert.equal(currency.formatPrice(1234.56, 'ZAR'), reference(1234.56, 'ZAR'));
});

test('formatPrice formats TZS using Intl currency formatting', () => {
  assert.equal(currency.formatPrice(50000, 'TZS'), reference(50000, 'TZS'));
});

test('formatPrice produces distinct output for different currencies', () => {
  const zar = currency.formatPrice(1000, 'ZAR');
  const tzs = currency.formatPrice(1000, 'TZS');
  assert.notEqual(zar, tzs, 'the currency argument must actually drive the formatting');
});

test('formatPrice includes the amount digits', () => {
  const out = currency.formatPrice(1234, 'ZAR');
  // The grouped digits of the amount should appear in some form.
  assert.match(out, /1.?234/, 'formatted output should contain the amount');
});

test('formatPrice handles zero', () => {
  assert.equal(currency.formatPrice(0, 'ZAR'), reference(0, 'ZAR'));
});

test('formatPrice is pure: same inputs yield the same output', () => {
  assert.equal(currency.formatPrice(99.99, 'TZS'), currency.formatPrice(99.99, 'TZS'));
});

// ---------------------------------------------------------------------------
// formatMarketPrice
// ---------------------------------------------------------------------------

test('currency module exports formatMarketPrice as a function', () => {
  assert.equal(typeof currency.formatMarketPrice, 'function');
});

test('formatMarketPrice reads the currency from the MarketContext (ZAR)', () => {
  const ctx = marketContext('ZA', 'ZAR');
  assert.equal(currency.formatMarketPrice(1234.56, ctx), reference(1234.56, 'ZAR'));
});

test('formatMarketPrice reads the currency from the MarketContext (TZS)', () => {
  const ctx = marketContext('TZ', 'TZS');
  assert.equal(currency.formatMarketPrice(50000, ctx), reference(50000, 'TZS'));
});

test('formatMarketPrice is equivalent to formatPrice on the context currency', () => {
  const ctx = marketContext('TZ', 'TZS');
  assert.equal(currency.formatMarketPrice(777, ctx), currency.formatPrice(777, ctx.currency));
});

// ---------------------------------------------------------------------------
// Re-export from the model API
// ---------------------------------------------------------------------------

test('formatPrice is re-exported from src/index.js', () => {
  assert.equal(typeof model.formatPrice, 'function');
  assert.equal(model.formatPrice(1234.56, 'ZAR'), currency.formatPrice(1234.56, 'ZAR'));
});

test('formatMarketPrice is re-exported from src/index.js', () => {
  assert.equal(typeof model.formatMarketPrice, 'function');
  const ctx = marketContext('ZA', 'ZAR');
  assert.equal(model.formatMarketPrice(1234.56, ctx), currency.formatMarketPrice(1234.56, ctx));
});
