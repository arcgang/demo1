'use strict';

// The tax presentation service.
//
// `presentTax(amount, marketContext)` applies the market's tax rules to a base
// amount and returns the tax-breakdown shape the catalog browse service embeds
// per displayed offer.
//
// `marketContext` is shaped like the MarketContext returned by resolveMarket:
//
//   { code, name, currency, defaultLanguage, tax: { rate, inclusive, label } }
//
// The breakdown is shaped like:
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
//     tax is back-computed: net = amount / (1 + rate), tax = amount - net.
//   - When tax.inclusive is FALSE the tax is added on top:
//     net = amount, tax = amount * rate, gross = amount + tax.
//   - A zero or absent rate produces no tax: net == gross == amount.
function presentTax(amount, marketContext = {}) {
  const tax = marketContext.tax ?? {};

  // Normalize an absent/null rate to 0 so a missing rule yields no tax rather
  // than throwing or producing NaN.
  const rate = tax.rate === undefined || tax.rate === null ? 0 : tax.rate;
  const inclusive = tax.inclusive === true;
  const label = tax.label;

  let net;
  let taxAmount;
  let gross;

  if (rate === 0) {
    net = amount;
    taxAmount = 0;
    gross = amount;
  } else if (inclusive) {
    // The input amount already includes tax: back-compute the net.
    gross = amount;
    net = amount / (1 + rate);
    taxAmount = gross - net;
  } else {
    // The input amount is pre-tax: add tax on top.
    net = amount;
    taxAmount = amount * rate;
    gross = net + taxAmount;
  }

  return { net, tax: taxAmount, gross, rate, label, inclusive };
}

module.exports = { presentTax };
