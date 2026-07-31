'use strict';

// Acceptance tests (unit): the market / language / currency domain vocabulary.
//
// `src/market.js` is the canonical vocabulary consumed by schema, services, and
// frontend. It mirrors the frozen-enum pattern of `src/requirement.js` and
// `src/consent-purpose.js` and (in addition to the existing `resolveMarket`
// context service) exports:
//
//   MARKETS            frozen map of the 8 Vodacom demo markets (per the HLD),
//                      keyed by market code, each entry carrying:
//                        marketCode        the market code (equal to its key)
//                        defaultLanguage   the market's default language/locale
//                        currency          the ISO currency code
//                        taxModel          the tax model identifier
//   LANGUAGES          frozen enum of the language/locale codes
//   CURRENCIES         frozen enum of the ISO currency codes
//
//   isValidMarket(v)   -> boolean
//   isValidLanguage(v) -> boolean
//   isValidCurrency(v) -> boolean
//
// These tests are written BEFORE the vocabulary exists and must fail until it
// is implemented. They pin the structural contract firmly while only anchoring
// the well-grounded `ZA` market (South Africa / ZAR / en-ZA) referenced
// throughout the repository and HLD, so the exact roster of the remaining
// markets is free to follow the HLD.

const test = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../src/market.js');

// Per the HLD/Product Spec: "Multi-market localization across 8 markets".
const EXPECTED_MARKET_COUNT = 8;

// ---------------------------------------------------------------------------
// MARKETS map
// ---------------------------------------------------------------------------

test('exports a MARKETS object', () => {
  assert.equal(typeof mod.MARKETS, 'object');
  assert.notEqual(mod.MARKETS, null);
});

test('MARKETS is frozen', () => {
  assert.equal(Object.isFrozen(mod.MARKETS), true);
});

test('MARKETS cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    mod.MARKETS.QQ = { marketCode: 'QQ' };
  });
  assert.equal(mod.MARKETS.QQ, undefined);
});

test('MARKETS defines exactly the 8 markets from the HLD', () => {
  assert.equal(
    Object.keys(mod.MARKETS).length,
    EXPECTED_MARKET_COUNT,
    'expected exactly 8 markets per the HLD',
  );
});

test('each MARKETS entry is itself frozen', () => {
  for (const [code, market] of Object.entries(mod.MARKETS)) {
    assert.equal(
      Object.isFrozen(market),
      true,
      `market entry ${code} should be frozen`,
    );
  }
});

test('each MARKETS entry carries a marketCode equal to its key', () => {
  for (const [code, market] of Object.entries(mod.MARKETS)) {
    assert.equal(
      market.marketCode,
      code,
      `MARKETS.${code}.marketCode should equal its key`,
    );
  }
});

test('each MARKETS entry carries the four required fields as non-empty strings', () => {
  for (const [code, market] of Object.entries(mod.MARKETS)) {
    for (const field of ['marketCode', 'defaultLanguage', 'currency', 'taxModel']) {
      assert.equal(
        typeof market[field],
        'string',
        `MARKETS.${code}.${field} should be a string`,
      );
      assert.ok(
        market[field].length > 0,
        `MARKETS.${code}.${field} should be non-empty`,
      );
    }
  }
});

test('market codes are unique', () => {
  const codes = Object.values(mod.MARKETS).map((m) => m.marketCode);
  assert.equal(new Set(codes).size, codes.length, 'market codes must be unique');
});

test('each market currency is a valid currency in CURRENCIES', () => {
  const currencyValues = new Set(Object.values(mod.CURRENCIES));
  for (const [code, market] of Object.entries(mod.MARKETS)) {
    assert.ok(
      currencyValues.has(market.currency),
      `MARKETS.${code}.currency (${market.currency}) should be a member of CURRENCIES`,
    );
    assert.equal(
      mod.isValidCurrency(market.currency),
      true,
      `MARKETS.${code}.currency (${market.currency}) should pass isValidCurrency`,
    );
  }
});

test('each market default language is a valid language in LANGUAGES', () => {
  const languageValues = new Set(Object.values(mod.LANGUAGES));
  for (const [code, market] of Object.entries(mod.MARKETS)) {
    assert.ok(
      languageValues.has(market.defaultLanguage),
      `MARKETS.${code}.defaultLanguage (${market.defaultLanguage}) should be a member of LANGUAGES`,
    );
    assert.equal(
      mod.isValidLanguage(market.defaultLanguage),
      true,
      `MARKETS.${code}.defaultLanguage (${market.defaultLanguage}) should pass isValidLanguage`,
    );
  }
});

test('MARKETS includes South Africa (ZA) with ZAR / en-ZA', () => {
  const za = mod.MARKETS.ZA;
  assert.ok(za, 'expected a ZA market entry');
  assert.equal(za.marketCode, 'ZA');
  assert.equal(za.currency, 'ZAR');
  assert.equal(za.defaultLanguage, 'en-ZA');
  assert.equal(typeof za.taxModel, 'string');
  assert.ok(za.taxModel.length > 0, 'ZA should carry a tax model identifier');
});

// ---------------------------------------------------------------------------
// LANGUAGES enum
// ---------------------------------------------------------------------------

test('exports a LANGUAGES object', () => {
  assert.equal(typeof mod.LANGUAGES, 'object');
  assert.notEqual(mod.LANGUAGES, null);
});

test('LANGUAGES is frozen', () => {
  assert.equal(Object.isFrozen(mod.LANGUAGES), true);
});

test('LANGUAGES cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    mod.LANGUAGES.MADE_UP = 'made-up';
  });
  assert.equal(mod.LANGUAGES.MADE_UP, undefined);
});

test('LANGUAGES is non-empty and its values are non-empty strings', () => {
  const values = Object.values(mod.LANGUAGES);
  assert.ok(values.length > 0, 'LANGUAGES should define at least one language');
  for (const v of values) {
    assert.equal(typeof v, 'string');
    assert.ok(v.length > 0, 'each LANGUAGES value should be a non-empty string');
  }
});

test('LANGUAGES includes the South African default language en-ZA', () => {
  assert.ok(
    Object.values(mod.LANGUAGES).includes('en-ZA'),
    'LANGUAGES should include en-ZA',
  );
});

// ---------------------------------------------------------------------------
// CURRENCIES enum
// ---------------------------------------------------------------------------

test('exports a CURRENCIES object', () => {
  assert.equal(typeof mod.CURRENCIES, 'object');
  assert.notEqual(mod.CURRENCIES, null);
});

test('CURRENCIES is frozen', () => {
  assert.equal(Object.isFrozen(mod.CURRENCIES), true);
});

test('CURRENCIES cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    mod.CURRENCIES.MADE_UP = 'XXX';
  });
  assert.equal(mod.CURRENCIES.MADE_UP, undefined);
});

test('CURRENCIES is non-empty and its values are non-empty strings', () => {
  const values = Object.values(mod.CURRENCIES);
  assert.ok(values.length > 0, 'CURRENCIES should define at least one currency');
  for (const v of values) {
    assert.equal(typeof v, 'string');
    assert.ok(v.length > 0, 'each CURRENCIES value should be a non-empty string');
  }
});

test('CURRENCIES includes ZAR', () => {
  assert.ok(
    Object.values(mod.CURRENCIES).includes('ZAR'),
    'CURRENCIES should include ZAR',
  );
});

// ---------------------------------------------------------------------------
// isValidMarket
// ---------------------------------------------------------------------------

test('exports isValidMarket as a function', () => {
  assert.equal(typeof mod.isValidMarket, 'function');
});

test('isValidMarket accepts every defined market code', () => {
  for (const code of Object.keys(mod.MARKETS)) {
    assert.equal(mod.isValidMarket(code), true, `expected ${code} to be a valid market`);
  }
});

test('isValidMarket rejects unknown / malformed values', () => {
  assert.equal(mod.isValidMarket('XX'), false);
  assert.equal(mod.isValidMarket('za'), false); // wrong case
  assert.equal(mod.isValidMarket(''), false);
  assert.equal(mod.isValidMarket(undefined), false);
  assert.equal(mod.isValidMarket(null), false);
  assert.equal(mod.isValidMarket(0), false);
});

// ---------------------------------------------------------------------------
// isValidLanguage
// ---------------------------------------------------------------------------

test('exports isValidLanguage as a function', () => {
  assert.equal(typeof mod.isValidLanguage, 'function');
});

test('isValidLanguage accepts every defined language', () => {
  for (const lang of Object.values(mod.LANGUAGES)) {
    assert.equal(mod.isValidLanguage(lang), true, `expected ${lang} to be a valid language`);
  }
});

test('isValidLanguage rejects unknown / malformed values', () => {
  assert.equal(mod.isValidLanguage('zz-ZZ'), false);
  assert.equal(mod.isValidLanguage('EN-ZA'), false); // wrong case
  assert.equal(mod.isValidLanguage(''), false);
  assert.equal(mod.isValidLanguage(undefined), false);
  assert.equal(mod.isValidLanguage(null), false);
  assert.equal(mod.isValidLanguage(0), false);
});

// ---------------------------------------------------------------------------
// isValidCurrency
// ---------------------------------------------------------------------------

test('exports isValidCurrency as a function', () => {
  assert.equal(typeof mod.isValidCurrency, 'function');
});

test('isValidCurrency accepts every defined currency', () => {
  for (const cur of Object.values(mod.CURRENCIES)) {
    assert.equal(mod.isValidCurrency(cur), true, `expected ${cur} to be a valid currency`);
  }
});

test('isValidCurrency rejects unknown / malformed values', () => {
  assert.equal(mod.isValidCurrency('XXX'), false);
  assert.equal(mod.isValidCurrency('zar'), false); // wrong case
  assert.equal(mod.isValidCurrency(''), false);
  assert.equal(mod.isValidCurrency(undefined), false);
  assert.equal(mod.isValidCurrency(null), false);
  assert.equal(mod.isValidCurrency(0), false);
});
