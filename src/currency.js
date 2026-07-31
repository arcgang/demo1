'use strict';

// Market currency formatting utilities.
//
// These helpers are PURE — they perform no DB access and depend only on the
// host's Intl (ICU) implementation, so they are unit-testable in isolation.

// Render a numeric `amount` in the given ISO 4217 `currency` code using
// Intl.NumberFormat with { style: 'currency' }. The locale is left to the host
// default so the correct symbol/grouping is chosen for the currency.
function formatPrice(amount, currency) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new Error('amount must be a number');
  }
  if (typeof currency !== 'string' || currency.trim() === '') {
    throw new Error('currency must be a non-empty ISO currency code');
  }
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

// Convenience wrapper that reads the ISO currency code from a MarketContext
// (as produced by resolveMarket) and formats `amount` in that currency.
function formatMarketPrice(amount, marketContext) {
  if (!marketContext || typeof marketContext.currency !== 'string') {
    throw new Error('marketContext must have a currency code');
  }
  return formatPrice(amount, marketContext.currency);
}

module.exports = { formatPrice, formatMarketPrice };
