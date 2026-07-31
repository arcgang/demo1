'use strict';

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

module.exports = { resolveMarket };
