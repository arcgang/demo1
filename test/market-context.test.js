'use strict';

// Acceptance tests (unit): the market context resolution service.
//
// `resolveMarket(db, { selectedMarketCode, detectedMarketCode })` resolves a
// MarketContext object from the `markets` table (introduced by migration
// version 3). It prefers an explicitly selected market over a detected one,
// validates the resolved code exists, and throws a clear error when the code is
// unknown or when neither a selected nor a detected code is provided.
//
// The service is expected to be exposed from the data-model API as
//
//   model.resolveMarket(db, { selectedMarketCode, detectedMarketCode })
//
// (re-exported from src/index.js following the existing lazy-require pattern
// used by recommend/recalculateCart) and to return a MarketContext shaped like:
//
//   {
//     code,                         // resolved market code (e.g. 'ZA')
//     name,                         // human-readable market name
//     currency,                     // ISO currency code (e.g. 'ZAR')
//     defaultLanguage,              // default locale/language (e.g. 'en-ZA')
//     tax: {
//       rate,                       // numeric tax rate (e.g. 0.15)
//       inclusive,                  // boolean: are displayed prices tax-inclusive?
//       label,                      // tax label (e.g. 'VAT')
//     },
//   }
//
// These tests are written BEFORE the service exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

// Insert a market row directly through the database handle so the service is
// exercised against real persisted data.
function insertMarket(
  db,
  { code, name, currency, defaultLanguage, taxRate, taxInclusive, taxLabel },
) {
  db.prepare(
    `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, name, currency, defaultLanguage, taxRate, taxInclusive, taxLabel);
}

// A representative fixture: two markets so preference/fallback can be exercised.
function fixture() {
  const db = freshDb();
  insertMarket(db, {
    code: 'ZA',
    name: 'South Africa',
    currency: 'ZAR',
    defaultLanguage: 'en-ZA',
    taxRate: 0.15,
    taxInclusive: 1,
    taxLabel: 'VAT',
  });
  insertMarket(db, {
    code: 'TZ',
    name: 'Tanzania',
    currency: 'TZS',
    defaultLanguage: 'sw-TZ',
    taxRate: 0.18,
    taxInclusive: 0,
    taxLabel: 'VAT',
  });
  return db;
}

test('resolveMarket is exported from the model API', () => {
  assert.equal(typeof model.resolveMarket, 'function', 'model.resolveMarket should be a function');
});

test('resolves a selected market into a full MarketContext object', () => {
  const db = fixture();

  const ctx = model.resolveMarket(db, { selectedMarketCode: 'ZA' });

  assert.deepEqual(ctx, {
    code: 'ZA',
    name: 'South Africa',
    currency: 'ZAR',
    defaultLanguage: 'en-ZA',
    tax: {
      rate: 0.15,
      inclusive: true,
      label: 'VAT',
    },
  });
});

test('prefers the selected market over the detected market', () => {
  const db = fixture();

  const ctx = model.resolveMarket(db, {
    selectedMarketCode: 'ZA',
    detectedMarketCode: 'TZ',
  });

  assert.equal(ctx.code, 'ZA', 'an explicitly selected market wins over a detected one');
  assert.equal(ctx.currency, 'ZAR');
});

test('falls back to the detected market when no market is selected', () => {
  const db = fixture();

  const ctx = model.resolveMarket(db, { detectedMarketCode: 'TZ' });

  assert.equal(ctx.code, 'TZ');
  assert.equal(ctx.name, 'Tanzania');
  assert.equal(ctx.currency, 'TZS');
  assert.equal(ctx.defaultLanguage, 'sw-TZ');
  assert.deepEqual(ctx.tax, { rate: 0.18, inclusive: false, label: 'VAT' });
});

test('maps tax_inclusive = 0 to a boolean false', () => {
  const db = fixture();
  const ctx = model.resolveMarket(db, { selectedMarketCode: 'TZ' });
  assert.equal(ctx.tax.inclusive, false, 'tax.inclusive should be a boolean false for a 0 flag');
});

test('maps tax_inclusive = 1 to a boolean true', () => {
  const db = fixture();
  const ctx = model.resolveMarket(db, { selectedMarketCode: 'ZA' });
  assert.equal(ctx.tax.inclusive, true, 'tax.inclusive should be a boolean true for a 1 flag');
});

test('throws a clear error when neither a selected nor a detected code is provided', () => {
  const db = fixture();

  assert.throws(
    () => model.resolveMarket(db, {}),
    /market/i,
    'a missing market code should raise a clear error mentioning the market',
  );
});

test('throws a clear error when called with no options object at all', () => {
  const db = fixture();

  assert.throws(
    () => model.resolveMarket(db),
    /market/i,
    'calling with no arguments should raise a clear error',
  );
});

test('throws a clear error when the selected market code is unknown', () => {
  const db = fixture();

  assert.throws(
    () => model.resolveMarket(db, { selectedMarketCode: 'XX' }),
    /XX|unknown|market/i,
    'an unknown selected market code should raise a clear error',
  );
});

test('throws a clear error when the detected market code is unknown', () => {
  const db = fixture();

  assert.throws(
    () => model.resolveMarket(db, { detectedMarketCode: 'ZZ' }),
    /ZZ|unknown|market/i,
    'an unknown detected market code should raise a clear error',
  );
});

test('does not fall back to a detected market when the selected code is unknown', () => {
  const db = fixture();

  // A selected-but-unknown code must not silently resolve to the detected one;
  // the explicit selection is authoritative and its being unknown is an error.
  assert.throws(
    () => model.resolveMarket(db, { selectedMarketCode: 'XX', detectedMarketCode: 'ZA' }),
    /XX|unknown|market/i,
    'an unknown selected code should error rather than fall back to the detected market',
  );
});
