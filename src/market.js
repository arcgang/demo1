'use strict';

// The market / language / currency domain vocabulary shared by the schema,
// services, and frontend. This is the canonical source of truth, mirroring the
// frozen-enum pattern of src/requirement.js and src/consent-purpose.js.
//
// LANGUAGES and CURRENCIES are the enumerated locale/ISO-4217 codes the demo
// supports; MARKETS is the frozen roster of the 8 Vodacom demo markets from the
// HLD, each keyed by its market code and carrying the market code, its default
// language/locale, its ISO currency code, and its tax model identifier.

const LANGUAGES = Object.freeze({
  EN_ZA: 'en-ZA',
  SW_TZ: 'sw-TZ',
  PT_MZ: 'pt-MZ',
  FR_CD: 'fr-CD',
  EN_LS: 'en-LS',
  SW_KE: 'sw-KE',
  AR_EG: 'ar-EG',
  EN_GH: 'en-GH',
});

const CURRENCIES = Object.freeze({
  ZAR: 'ZAR',
  TZS: 'TZS',
  MZN: 'MZN',
  CDF: 'CDF',
  LSL: 'LSL',
  KES: 'KES',
  EGP: 'EGP',
  GHS: 'GHS',
});

// The 8 Vodacom demo markets. Each entry is frozen and its marketCode equals
// its key so a market is addressable by its code. Tax model identifiers name
// the localized tax regime the pricing/tax code resolves per market.
const MARKETS = Object.freeze({
  ZA: Object.freeze({
    marketCode: 'ZA',
    defaultLanguage: LANGUAGES.EN_ZA,
    currency: CURRENCIES.ZAR,
    taxModel: 'VAT',
  }),
  TZ: Object.freeze({
    marketCode: 'TZ',
    defaultLanguage: LANGUAGES.SW_TZ,
    currency: CURRENCIES.TZS,
    taxModel: 'VAT',
  }),
  MZ: Object.freeze({
    marketCode: 'MZ',
    defaultLanguage: LANGUAGES.PT_MZ,
    currency: CURRENCIES.MZN,
    taxModel: 'IVA',
  }),
  CD: Object.freeze({
    marketCode: 'CD',
    defaultLanguage: LANGUAGES.FR_CD,
    currency: CURRENCIES.CDF,
    taxModel: 'TVA',
  }),
  LS: Object.freeze({
    marketCode: 'LS',
    defaultLanguage: LANGUAGES.EN_LS,
    currency: CURRENCIES.LSL,
    taxModel: 'VAT',
  }),
  KE: Object.freeze({
    marketCode: 'KE',
    defaultLanguage: LANGUAGES.SW_KE,
    currency: CURRENCIES.KES,
    taxModel: 'VAT',
  }),
  EG: Object.freeze({
    marketCode: 'EG',
    defaultLanguage: LANGUAGES.AR_EG,
    currency: CURRENCIES.EGP,
    taxModel: 'VAT',
  }),
  GH: Object.freeze({
    marketCode: 'GH',
    defaultLanguage: LANGUAGES.EN_GH,
    currency: CURRENCIES.GHS,
    taxModel: 'VAT',
  }),
});

const LANGUAGE_VALUES = Object.freeze(Object.values(LANGUAGES));
const CURRENCY_VALUES = Object.freeze(Object.values(CURRENCIES));

function isValidMarket(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MARKETS, value);
}

function isValidLanguage(value) {
  return LANGUAGE_VALUES.includes(value);
}

function isValidCurrency(value) {
  return CURRENCY_VALUES.includes(value);
}

// Shape a raw `markets` row into the MarketContext object the application layer
// consumes. The tax fields are grouped under `tax`, and the 0/1 `tax_inclusive`
// flag is normalized into a real boolean.
function shapeMarketRow(row) {
  return {
    code: row.code,
    name: row.name,
    currency: row.currency,
    defaultLanguage: row.default_language,
    tax: {
      rate: row.tax_rate,
      inclusive: row.tax_inclusive === 1,
      label: row.tax_label,
    },
  };
}

// The market context resolution service.
//
// Resolve a MarketContext from the `markets` table. An explicitly selected
// market always wins over a detected one; the selected code is authoritative,
// so a selected-but-unknown code is an error rather than a silent fall back to
// the detected market. When no market is selected, the detected market is used.
//
// Throws a clear error when neither a selected nor a detected code is provided,
// or when the resolved code does not exist in the `markets` table. This defines
// the MarketContext interface downstream catalog/tax code consumes.
function resolveMarket(db, { selectedMarketCode, detectedMarketCode } = {}) {
  const code = selectedMarketCode ?? detectedMarketCode;
  if (code === undefined || code === null || code === '') {
    throw new Error(
      'a market code is required: provide a selectedMarketCode or a detectedMarketCode',
    );
  }

  const row = db
    .prepare(
      `SELECT code, name, currency, default_language, tax_rate, tax_inclusive, tax_label
       FROM markets WHERE code = ?`,
    )
    .get(code);
  if (!row) {
    throw new Error(`unknown market code "${code}"`);
  }

  return shapeMarketRow(row);
}

module.exports = {
  MARKETS,
  LANGUAGES,
  CURRENCIES,
  isValidMarket,
  isValidLanguage,
  isValidCurrency,
  resolveMarket,
};
