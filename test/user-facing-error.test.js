'use strict';

// Acceptance tests (unit): the error normalization helper.
//
// `src/user-facing-error.js` defines `toUserFacingError(err)`, which normalizes
// ANY thrown value into a stable, serializable object that the future
// API/frontend layer will consume:
//
//   {
//     reasonCode,          // a REASON_CODE value
//     message,             // customer-facing message (NOT a raw Error message)
//     nextStep,            // next-step hint
//     category,            // a CATEGORY value
//     retryable,           // boolean, derived from category
//     statePreservation,   // { cart, order, payment } of STATE_PRESERVATION values
//   }
//
// Mapping rules:
//   - An AppError maps through directly: its reasonCode, userMessage,
//     nextStep, category, retryable and statePreservation are carried over
//     (userMessage becomes the output `message`).
//   - Any unexpected / bare value (a plain Error, a subclass, or a non-Error
//     thrown value) is downgraded to the UNEXPECTED reason code, marked
//     non-retryable (retryable === false), with statePreservation UNKNOWN for
//     every facet. A raw Error's own message is kept only for internal logging
//     and must NOT surface as the customer-facing `message`.
//   - The output is always a plain, JSON-serializable object carrying every
//     required field.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const userFacing = require('../src/user-facing-error.js');
const { toUserFacingError } = userFacing;

const { AppError, fromReasonCode } = require('../src/app-error.js');

const {
  REASON_CODE,
  CATEGORY,
  CATEGORY_VALUES,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
  REASON_CODE_VALUES,
  getReasonMeta,
} = require('../src/reason-codes.js');

const REQUIRED_FIELDS = [
  'reasonCode',
  'message',
  'nextStep',
  'category',
  'retryable',
  'statePreservation',
];

// A plain object carrying every required field, with values drawn from the
// expected vocabularies. Shared by the shape assertions below.
function assertValidShape(out) {
  assert.equal(typeof out, 'object');
  assert.notEqual(out, null);
  // Not an Error instance: the contract is a data object, not a thrown value.
  assert.ok(!(out instanceof Error), 'output must not be an Error instance');
  // A plain object literal (prototype is Object.prototype or null).
  const proto = Object.getPrototypeOf(out);
  assert.ok(
    proto === Object.prototype || proto === null,
    'output must be a plain object',
  );

  for (const field of REQUIRED_FIELDS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(out, field),
      `expected output to carry required field ${field}`,
    );
  }

  assert.ok(REASON_CODE_VALUES.includes(out.reasonCode), 'reasonCode must be a REASON_CODE value');
  assert.equal(typeof out.message, 'string');
  assert.notEqual(out.message.trim(), '', 'message must be a non-empty string');
  assert.equal(typeof out.nextStep, 'string');
  assert.notEqual(out.nextStep.trim(), '', 'nextStep must be a non-empty string');
  assert.ok(CATEGORY_VALUES.includes(out.category), 'category must be a CATEGORY value');
  assert.equal(typeof out.retryable, 'boolean');

  assert.equal(typeof out.statePreservation, 'object');
  assert.notEqual(out.statePreservation, null);
  for (const facet of ['cart', 'order', 'payment']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(out.statePreservation, facet),
      `statePreservation.${facet} must be present`,
    );
    assert.ok(
      STATE_PRESERVATION_VALUES.includes(out.statePreservation[facet]),
      `statePreservation.${facet} must be a STATE_PRESERVATION value`,
    );
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

test('exports a toUserFacingError function', () => {
  assert.equal(typeof toUserFacingError, 'function');
});

// ---------------------------------------------------------------------------
// AppError round-trip
// ---------------------------------------------------------------------------

test('an AppError maps through directly to the user-facing shape', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);
  const meta = getReasonMeta(REASON_CODE.UNKNOWN_DEVICE);
  const out = toUserFacingError(err);

  assertValidShape(out);
  assert.equal(out.reasonCode, REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(out.message, err.userMessage);
  assert.equal(out.message, meta.message);
  assert.equal(out.nextStep, err.nextStep);
  assert.equal(out.category, err.category);
  assert.equal(out.retryable, err.retryable);
  assert.equal(out.retryable, true); // UNKNOWN_DEVICE is RETRYABLE
  assert.deepEqual(out.statePreservation, err.statePreservation);
});

test('an AppError carries its overridden fields through the helper', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE, {
    userMessage: 'Custom customer-facing message.',
    nextStep: 'Custom next step.',
    category: CATEGORY.NEEDS_SUPPORT,
    statePreservation: {
      cart: STATE_PRESERVATION.PRESERVED,
      order: STATE_PRESERVATION.DISCARDED,
      payment: STATE_PRESERVATION.UNKNOWN,
    },
  });
  const out = toUserFacingError(err);

  assertValidShape(out);
  assert.equal(out.reasonCode, REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(out.message, 'Custom customer-facing message.');
  assert.equal(out.nextStep, 'Custom next step.');
  assert.equal(out.category, CATEGORY.NEEDS_SUPPORT);
  // retryable follows the overridden category.
  assert.equal(out.retryable, false);
  assert.equal(out.statePreservation.cart, STATE_PRESERVATION.PRESERVED);
  assert.equal(out.statePreservation.order, STATE_PRESERVATION.DISCARDED);
  assert.equal(out.statePreservation.payment, STATE_PRESERVATION.UNKNOWN);
});

test('an AppError built via fromReasonCode also maps through', () => {
  const err = fromReasonCode(REASON_CODE.MISSING_CUSTOMER_CONTEXT);
  const meta = getReasonMeta(REASON_CODE.MISSING_CUSTOMER_CONTEXT);
  const out = toUserFacingError(err);

  assertValidShape(out);
  assert.equal(out.reasonCode, REASON_CODE.MISSING_CUSTOMER_CONTEXT);
  assert.equal(out.message, meta.message);
  assert.equal(out.category, meta.category);
  assert.equal(out.retryable, false); // NEEDS_SUPPORT
});

// ---------------------------------------------------------------------------
// Bare Error downgraded to UNEXPECTED
// ---------------------------------------------------------------------------

test('a bare Error is downgraded to UNEXPECTED and marked non-retryable', () => {
  const raw = new Error('boom from downstream internals');
  const out = toUserFacingError(raw);
  const unexpected = getReasonMeta(REASON_CODE.UNEXPECTED);

  assertValidShape(out);
  assert.equal(out.reasonCode, REASON_CODE.UNEXPECTED);
  assert.equal(out.retryable, false);
  assert.equal(out.category, unexpected.category);
  assert.equal(out.message, unexpected.message);
  assert.equal(out.nextStep, unexpected.nextStep);
});

test('a bare Error does NOT leak its raw message as the customer-facing message', () => {
  const raw = new Error('sensitive stack detail: db password = hunter2');
  const out = toUserFacingError(raw);

  assert.notEqual(
    out.message,
    raw.message,
    'raw Error message must not surface as the user-facing message',
  );
  assert.ok(
    !out.message.includes('hunter2'),
    'raw internal detail must not leak into the user-facing message',
  );
});

test('a bare Error is downgraded with statePreservation UNKNOWN for every facet', () => {
  const out = toUserFacingError(new Error('boom'));
  assert.equal(out.statePreservation.cart, STATE_PRESERVATION.UNKNOWN);
  assert.equal(out.statePreservation.order, STATE_PRESERVATION.UNKNOWN);
  assert.equal(out.statePreservation.payment, STATE_PRESERVATION.UNKNOWN);
});

test('an Error subclass is also downgraded to UNEXPECTED', () => {
  const out = toUserFacingError(new TypeError('cannot read property of undefined'));
  assertValidShape(out);
  assert.equal(out.reasonCode, REASON_CODE.UNEXPECTED);
  assert.equal(out.retryable, false);
});

test('non-Error thrown values are downgraded to UNEXPECTED', () => {
  for (const thrown of ['a string', 123, null, undefined, { some: 'object' }, ['x']]) {
    const out = toUserFacingError(thrown);
    assertValidShape(out);
    assert.equal(
      out.reasonCode,
      REASON_CODE.UNEXPECTED,
      `expected ${JSON.stringify(thrown)} to downgrade to UNEXPECTED`,
    );
    assert.equal(out.retryable, false);
    assert.equal(out.statePreservation.cart, STATE_PRESERVATION.UNKNOWN);
    assert.equal(out.statePreservation.order, STATE_PRESERVATION.UNKNOWN);
    assert.equal(out.statePreservation.payment, STATE_PRESERVATION.UNKNOWN);
  }
});

// ---------------------------------------------------------------------------
// JSON serializability
// ---------------------------------------------------------------------------

test('the output of an AppError is JSON-serializable and round-trips unchanged', () => {
  const out = toUserFacingError(new AppError(REASON_CODE.UNEXPECTED));
  const roundTripped = JSON.parse(JSON.stringify(out));
  assert.deepEqual(roundTripped, out);
});

test('the output of a bare Error is JSON-serializable and round-trips unchanged', () => {
  const out = toUserFacingError(new Error('boom'));
  const roundTripped = JSON.parse(JSON.stringify(out));
  assert.deepEqual(roundTripped, out);
  // Every required field survives serialization.
  for (const field of REQUIRED_FIELDS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(roundTripped, field),
      `serialized output must retain ${field}`,
    );
  }
});

test('serializing the output does not throw for any input variant', () => {
  const inputs = [
    new AppError(REASON_CODE.UNKNOWN_DEVICE),
    new Error('boom'),
    'a string',
    null,
    { some: 'object' },
  ];
  for (const input of inputs) {
    const out = toUserFacingError(input);
    assert.doesNotThrow(() => JSON.stringify(out));
  }
});
