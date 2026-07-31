'use strict';

// Acceptance tests: the error/reason-code contract is documented for consumers.
//
// This task expands README.md and the public entry point (src/index.js) so a
// downstream UI or API layer can discover the blocking-state messaging contract
// from a single place:
//
//   - README documents EVERY reason code (with its user-facing explanation and
//     next-step), EVERY category, and how RETRYABLE is distinguished from
//     NEEDS_SUPPORT / NEEDS_DOCUMENTATION.
//   - README documents the cart/order/payment state-preservation vocabulary
//     (PRESERVED / DISCARDED / UNKNOWN).
//   - README documents the normalized user-facing response shape and includes a
//     worked example of the normalized error object.
//   - The new error modules (reason-codes, app-error, user-facing-error) are
//     re-exported from src/index.js so downstream layers have one import
//     surface.
//
// These tests are written BEFORE the documentation/exports exist and must fail
// until the task is implemented.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

const api = require('../src/index.js');
const {
  REASON_CODE,
  REASON_CODE_VALUES,
  CATEGORY,
  CATEGORY_VALUES,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
  getReasonMeta,
} = require('../src/reason-codes.js');
const { AppError } = require('../src/app-error.js');
const { toUserFacingError } = require('../src/user-facing-error.js');

// Read the README once. Content assertions are case-insensitive on a normalized
// copy so wording is not over-constrained, while exact tokens (enum values,
// field names) are matched against the raw text.
const README = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
const README_LC = README.toLowerCase();

// ---------------------------------------------------------------------------
// README: reason codes
// ---------------------------------------------------------------------------

test('README is more than the placeholder stub', () => {
  // The repository ships a one-line "# demo1" placeholder; the documentation
  // task must grow it substantially.
  assert.ok(README.trim().length > 400, 'README should contain substantial documentation');
});

test('README documents every reason code by name', () => {
  for (const code of REASON_CODE_VALUES) {
    assert.ok(
      README.includes(code),
      `README must document the reason code ${code}`,
    );
  }
});

test('README documents each reason code with its user-facing message and next-step', () => {
  for (const code of REASON_CODE_VALUES) {
    const meta = getReasonMeta(code);
    assert.ok(
      README.includes(meta.message),
      `README must include the user-facing explanation for ${code}: "${meta.message}"`,
    );
    assert.ok(
      README.includes(meta.nextStep),
      `README must include the next-step for ${code}: "${meta.nextStep}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// README: categories and the retryable distinction
// ---------------------------------------------------------------------------

test('README documents every category by name', () => {
  for (const category of CATEGORY_VALUES) {
    assert.ok(
      README.includes(category),
      `README must document the category ${category}`,
    );
  }
});

test('README explains how RETRYABLE is distinguished from NEEDS_SUPPORT / NEEDS_DOCUMENTATION', () => {
  // All three category names must be present...
  assert.ok(README.includes('RETRYABLE'));
  assert.ok(README.includes('NEEDS_SUPPORT'));
  assert.ok(README.includes('NEEDS_DOCUMENTATION'));
  // ...and the README must connect the categories to the retryable flag so a
  // consumer learns that only RETRYABLE failures are safe to retry.
  assert.ok(
    README_LC.includes('retryable'),
    'README must describe the retryable flag',
  );
});

test('README describes retryable as derived from the category', () => {
  // A consumer must be able to learn that `retryable` is true only for the
  // RETRYABLE category (and false for NEEDS_SUPPORT / NEEDS_DOCUMENTATION).
  const mentionsTrue = /retryable[^.\n]*\btrue\b/i.test(README) ||
    /\btrue\b[^.\n]*retryable/i.test(README);
  assert.ok(
    mentionsTrue,
    'README must state that RETRYABLE maps to retryable === true',
  );
});

// ---------------------------------------------------------------------------
// README: state-preservation vocabulary
// ---------------------------------------------------------------------------

test('README documents the state-preservation vocabulary', () => {
  for (const value of STATE_PRESERVATION_VALUES) {
    assert.ok(
      README.includes(value),
      `README must document the state-preservation value ${value}`,
    );
  }
});

test('README documents the cart / order / payment state facets', () => {
  for (const facet of ['cart', 'order', 'payment']) {
    assert.ok(
      README_LC.includes(facet),
      `README must document the ${facet} state facet`,
    );
  }
});

// ---------------------------------------------------------------------------
// README: normalized user-facing response shape
// ---------------------------------------------------------------------------

test('README documents every field of the normalized user-facing response shape', () => {
  for (const field of ['reasonCode', 'message', 'nextStep', 'category', 'retryable', 'statePreservation']) {
    assert.ok(
      README.includes(field),
      `README must document the "${field}" field of the normalized error shape`,
    );
  }
});

test('README includes a worked example of the normalized error object', () => {
  // The worked example must show a real, coherent normalized object: a known
  // reason code alongside its category, all inside a fenced code block.
  assert.ok(README.includes('```'), 'README must contain a fenced code example');

  // Pick a representative reason code and confirm the example ties its code to
  // its category so the example is genuinely worked (not just field names).
  const example = toUserFacingError(new AppError(REASON_CODE.UNKNOWN_DEVICE));
  assert.ok(
    README.includes(example.reasonCode),
    'worked example should reference a concrete reason code',
  );
  assert.ok(
    README.includes(example.category),
    'worked example should reference the concrete category for that code',
  );

  // At least one fenced block must contain both a reasonCode field and its
  // value together, demonstrating the actual object rather than a bare list.
  const fencedBlocks = README.match(/```[\s\S]*?```/g) || [];
  const hasWorkedObject = fencedBlocks.some(
    (block) =>
      block.includes('reasonCode') &&
      block.includes(REASON_CODE.UNKNOWN_DEVICE) &&
      block.includes('retryable'),
  );
  assert.ok(
    hasWorkedObject,
    'a fenced code block must show a normalized error object with reasonCode + retryable',
  );
});

// ---------------------------------------------------------------------------
// src/index.js: single import surface for the error modules
// ---------------------------------------------------------------------------

test('src/index.js re-exports the reason-code catalog', () => {
  assert.equal(typeof api.REASON_CODE, 'object');
  assert.deepEqual(api.REASON_CODE, REASON_CODE);
  assert.deepEqual([...api.REASON_CODE_VALUES], [...REASON_CODE_VALUES]);

  assert.equal(typeof api.CATEGORY, 'object');
  assert.deepEqual(api.CATEGORY, CATEGORY);
  assert.deepEqual([...api.CATEGORY_VALUES], [...CATEGORY_VALUES]);

  assert.equal(typeof api.STATE_PRESERVATION, 'object');
  assert.deepEqual(api.STATE_PRESERVATION, STATE_PRESERVATION);
  assert.deepEqual([...api.STATE_PRESERVATION_VALUES], [...STATE_PRESERVATION_VALUES]);

  assert.equal(typeof api.getReasonMeta, 'function');
  assert.equal(typeof api.isValidReasonCode, 'function');
});

test('src/index.js re-exports the AppError type and fromReasonCode factory', () => {
  assert.equal(typeof api.AppError, 'function');
  assert.equal(typeof api.fromReasonCode, 'function');
  // Re-exported class must be the very same class, so instanceof checks work
  // regardless of which import surface a consumer used.
  assert.equal(api.AppError, AppError);
  const err = api.fromReasonCode(REASON_CODE.UNKNOWN_DEVICE);
  assert.ok(err instanceof api.AppError);
  assert.ok(err instanceof AppError);
});

test('src/index.js re-exports the toUserFacingError normalizer', () => {
  assert.equal(typeof api.toUserFacingError, 'function');
  assert.equal(api.toUserFacingError, toUserFacingError);
});

test('the re-exported normalizer produces the documented shape from the single import surface', () => {
  const out = api.toUserFacingError(new api.AppError(REASON_CODE.UNKNOWN_DEVICE));
  for (const field of ['reasonCode', 'message', 'nextStep', 'category', 'retryable', 'statePreservation']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(out, field),
      `normalized output from the index surface must carry ${field}`,
    );
  }
  assert.equal(out.reasonCode, REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(out.retryable, true); // UNKNOWN_DEVICE is RETRYABLE
});
