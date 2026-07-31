'use strict';

// Acceptance tests: the input-validation helper the HTTP layer uses for DTO
// validation on write endpoints (LLD §4.2 step 2, §11.1 "Input validation").
//
// The helper validates a decoded request body against a small field spec and
// reports, without throwing, which fields are missing or of the wrong type so a
// controller can turn a failed validation into a 400 with field-level messages.
//
// Contract (kept minimal and consistent with the repo's plain-object style):
//
//   validateBody(body, spec) -> { valid, errors, value }
//
//     spec:  { <field>: { type: 'string'|'number'|'boolean'|'object', required?: boolean } }
//     valid: boolean — true only when there are no errors
//     errors: array of { field, message } (empty when valid)
//     value:  the validated body (the input object) when valid, otherwise null
//
// These tests are written BEFORE implementation and must fail until the helper
// exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

test('the model exposes the validateBody helper', () => {
  assert.equal(typeof model.validateBody, 'function', 'expected validateBody to be exported');
});

test('a body satisfying the spec is valid and echoes the value', () => {
  const spec = {
    marketCode: { type: 'string', required: true },
    quantity: { type: 'number', required: true },
  };
  const body = { marketCode: 'ZA', quantity: 1 };

  const result = model.validateBody(body, spec);

  assert.equal(result.valid, true, 'a conforming body should be valid');
  assert.deepEqual(result.errors, [], 'a conforming body should have no errors');
  assert.deepEqual(result.value, body, 'the validated value should be the input body');
});

test('a missing required field is reported and the body is invalid', () => {
  const spec = {
    marketCode: { type: 'string', required: true },
    quantity: { type: 'number', required: true },
  };

  const result = model.validateBody({ marketCode: 'ZA' }, spec);

  assert.equal(result.valid, false, 'a body missing a required field should be invalid');
  assert.equal(result.value, null, 'an invalid body should not surface a value');
  assert.ok(
    result.errors.some((e) => e.field === 'quantity'),
    'the missing required field should be named in errors',
  );
  for (const e of result.errors) {
    assert.equal(typeof e.field, 'string', 'each error should carry a field name');
    assert.equal(typeof e.message, 'string', 'each error should carry a message');
  }
});

test('a field of the wrong type is reported as an error', () => {
  const spec = { quantity: { type: 'number', required: true } };

  const result = model.validateBody({ quantity: 'not-a-number' }, spec);

  assert.equal(result.valid, false, 'a wrong-typed field should make the body invalid');
  assert.ok(
    result.errors.some((e) => e.field === 'quantity'),
    'the wrong-typed field should be named in errors',
  );
});

test('an optional field may be omitted without error', () => {
  const spec = {
    marketCode: { type: 'string', required: true },
    locale: { type: 'string', required: false },
  };

  const result = model.validateBody({ marketCode: 'ZA' }, spec);

  assert.equal(result.valid, true, 'omitting an optional field should still be valid');
  assert.deepEqual(result.errors, [], 'omitting an optional field should produce no errors');
});

test('a present optional field of the wrong type is still reported', () => {
  const spec = {
    marketCode: { type: 'string', required: true },
    liteMode: { type: 'boolean', required: false },
  };

  const result = model.validateBody({ marketCode: 'ZA', liteMode: 'yes' }, spec);

  assert.equal(result.valid, false, 'a wrong-typed optional field should be invalid');
  assert.ok(
    result.errors.some((e) => e.field === 'liteMode'),
    'the wrong-typed optional field should be named in errors',
  );
});

test('a non-object body fails validation rather than throwing', () => {
  const spec = { marketCode: { type: 'string', required: true } };

  for (const bad of [null, undefined, 'string', 42, []]) {
    const result = model.validateBody(bad, spec);
    assert.equal(result.valid, false, `a non-object body (${JSON.stringify(bad)}) should be invalid`);
    assert.ok(Array.isArray(result.errors), 'errors should be an array even for a non-object body');
    assert.ok(result.errors.length > 0, 'a non-object body should report at least one error');
  }
});

test('multiple violations are all reported together', () => {
  const spec = {
    marketCode: { type: 'string', required: true },
    quantity: { type: 'number', required: true },
  };

  // marketCode missing AND quantity wrong-typed.
  const result = model.validateBody({ quantity: 'x' }, spec);

  assert.equal(result.valid, false);
  const fields = new Set(result.errors.map((e) => e.field));
  assert.ok(fields.has('marketCode'), 'the missing required field should be reported');
  assert.ok(fields.has('quantity'), 'the wrong-typed field should be reported');
});
