'use strict';

// Acceptance tests (unit): the typed AppError class.
//
// `src/app-error.js` defines a backend error type that extends the built-in
// Error and carries the blocking-state contract sourced from the reason-code
// catalog in `src/reason-codes.js`. It exports:
//
//   AppError                a class extending Error with fields:
//                             reasonCode        validated against the catalog
//                             category          default from the catalog, overridable
//                             retryable         DERIVED from the effective category
//                                               (RETRYABLE -> true, otherwise false)
//                             statePreservation small object { cart, order, payment }
//                                               using the STATE_PRESERVATION vocabulary
//                             userMessage       default from the catalog, overridable
//                             nextStep          default from the catalog, overridable
//                             cause             wraps the originating error
//
//   fromReasonCode(code, opts) a terse factory returning an AppError so call
//                              sites need not spell out `new AppError(...)`.
//
// Construction from a reason code populates message / next-step / category /
// retryable from the catalog. An unknown reason code is rejected. The
// statePreservation object defaults sensibly (nothing lost -> PRESERVED).
// Overrides (userMessage, nextStep, category, statePreservation) and a wrapped
// cause are all retained.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const appError = require('../src/app-error.js');
const { AppError, fromReasonCode } = appError;

const {
  REASON_CODE,
  CATEGORY,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
  getReasonMeta,
} = require('../src/reason-codes.js');

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

test('exports an AppError class and a fromReasonCode factory', () => {
  assert.equal(typeof AppError, 'function');
  assert.equal(typeof fromReasonCode, 'function');
});

// ---------------------------------------------------------------------------
// Construction from a reason code
// ---------------------------------------------------------------------------

test('AppError extends the built-in Error', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);
  assert.ok(err instanceof AppError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'AppError');
});

test('construction from a reason code populates reasonCode', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(err.reasonCode, REASON_CODE.UNKNOWN_DEVICE);
});

test('construction populates message / userMessage / nextStep / category from the catalog', () => {
  const meta = getReasonMeta(REASON_CODE.UNKNOWN_DEVICE);
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);

  assert.equal(err.userMessage, meta.message);
  assert.equal(err.message, meta.message);
  assert.equal(err.nextStep, meta.nextStep);
  assert.equal(err.category, meta.category);
});

test('retryable is derived true for a RETRYABLE-category reason code', () => {
  // UNKNOWN_DEVICE is RETRYABLE in the catalog.
  assert.equal(getReasonMeta(REASON_CODE.UNKNOWN_DEVICE).category, CATEGORY.RETRYABLE);
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(err.retryable, true);
});

test('retryable is derived false for a NEEDS_SUPPORT-category reason code', () => {
  // MISSING_CUSTOMER_CONTEXT is NEEDS_SUPPORT in the catalog.
  assert.equal(getReasonMeta(REASON_CODE.MISSING_CUSTOMER_CONTEXT).category, CATEGORY.NEEDS_SUPPORT);
  const err = new AppError(REASON_CODE.MISSING_CUSTOMER_CONTEXT);
  assert.equal(err.retryable, false);
});

test('retryable is derived false for a NEEDS_DOCUMENTATION-category reason code', () => {
  // MISSING_OR_INVALID_REQUIREMENT is NEEDS_DOCUMENTATION in the catalog.
  assert.equal(
    getReasonMeta(REASON_CODE.MISSING_OR_INVALID_REQUIREMENT).category,
    CATEGORY.NEEDS_DOCUMENTATION,
  );
  const err = new AppError(REASON_CODE.MISSING_OR_INVALID_REQUIREMENT);
  assert.equal(err.retryable, false);
});

// ---------------------------------------------------------------------------
// Unknown reason code is rejected
// ---------------------------------------------------------------------------

test('an unknown reason code is rejected by the constructor', () => {
  assert.throws(() => new AppError('NOT_A_REAL_CODE'));
});

test('a missing / malformed reason code is rejected by the constructor', () => {
  assert.throws(() => new AppError());
  assert.throws(() => new AppError(null));
  assert.throws(() => new AppError(123));
});

test('an unknown reason code is rejected by the factory', () => {
  assert.throws(() => fromReasonCode('NOT_A_REAL_CODE'));
});

// ---------------------------------------------------------------------------
// statePreservation defaults
// ---------------------------------------------------------------------------

test('statePreservation defaults to a { cart, order, payment } object of valid vocabulary values', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(typeof err.statePreservation, 'object');
  assert.notEqual(err.statePreservation, null);

  for (const facet of ['cart', 'order', 'payment']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(err.statePreservation, facet),
      `expected statePreservation.${facet} to be present`,
    );
    assert.ok(
      STATE_PRESERVATION_VALUES.includes(err.statePreservation[facet]),
      `expected statePreservation.${facet} to be a STATE_PRESERVATION value`,
    );
  }
});

test('statePreservation defaults sensibly to PRESERVED for every facet', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(err.statePreservation.cart, STATE_PRESERVATION.PRESERVED);
  assert.equal(err.statePreservation.order, STATE_PRESERVATION.PRESERVED);
  assert.equal(err.statePreservation.payment, STATE_PRESERVATION.PRESERVED);
});

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

test('userMessage and nextStep can be overridden while defaults still come from the catalog', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE, {
    userMessage: 'Custom customer-facing message.',
    nextStep: 'Custom next step.',
  });
  assert.equal(err.userMessage, 'Custom customer-facing message.');
  assert.equal(err.message, 'Custom customer-facing message.');
  assert.equal(err.nextStep, 'Custom next step.');
});

test('category can be overridden and retryable re-derives from the override', () => {
  // UNKNOWN_DEVICE defaults to RETRYABLE (retryable true); override to
  // NEEDS_SUPPORT and retryable must follow to false.
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE, {
    category: CATEGORY.NEEDS_SUPPORT,
  });
  assert.equal(err.category, CATEGORY.NEEDS_SUPPORT);
  assert.equal(err.retryable, false);
});

test('statePreservation can be overridden per facet', () => {
  const err = new AppError(REASON_CODE.UNEXPECTED, {
    statePreservation: {
      cart: STATE_PRESERVATION.PRESERVED,
      order: STATE_PRESERVATION.DISCARDED,
      payment: STATE_PRESERVATION.UNKNOWN,
    },
  });
  assert.equal(err.statePreservation.cart, STATE_PRESERVATION.PRESERVED);
  assert.equal(err.statePreservation.order, STATE_PRESERVATION.DISCARDED);
  assert.equal(err.statePreservation.payment, STATE_PRESERVATION.UNKNOWN);
});

// ---------------------------------------------------------------------------
// cause
// ---------------------------------------------------------------------------

test('a wrapped cause is retained', () => {
  const original = new Error('boom from downstream');
  const err = new AppError(REASON_CODE.UNEXPECTED, { cause: original });
  assert.equal(err.cause, original);
});

test('cause is absent when not supplied', () => {
  const err = new AppError(REASON_CODE.UNEXPECTED);
  assert.equal(err.cause, undefined);
});

// ---------------------------------------------------------------------------
// Factory parity
// ---------------------------------------------------------------------------

test('fromReasonCode returns an AppError equivalent to the constructor', () => {
  const err = fromReasonCode(REASON_CODE.UNKNOWN_DEVICE);
  const meta = getReasonMeta(REASON_CODE.UNKNOWN_DEVICE);

  assert.ok(err instanceof AppError);
  assert.equal(err.reasonCode, REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(err.userMessage, meta.message);
  assert.equal(err.nextStep, meta.nextStep);
  assert.equal(err.category, meta.category);
  assert.equal(err.retryable, true);
});

test('fromReasonCode forwards overrides and cause', () => {
  const original = new Error('downstream failure');
  const err = fromReasonCode(REASON_CODE.UNKNOWN_DEVICE, {
    userMessage: 'Overridden.',
    category: CATEGORY.NEEDS_SUPPORT,
    cause: original,
  });
  assert.equal(err.userMessage, 'Overridden.');
  assert.equal(err.category, CATEGORY.NEEDS_SUPPORT);
  assert.equal(err.retryable, false);
  assert.equal(err.cause, original);
});
