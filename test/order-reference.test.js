'use strict';

// Acceptance tests (unit): the order reference generator utility.
//
// `src/order-reference.js` exports a single PURE helper (no DB access, no
// global clock/random reads — every input is passed as an argument, so it is
// deterministic and unit-testable in isolation):
//
//   generateOrderReference({ sequence, timestamp })
//     Produce a unique, human-readable order reference string of the form
//     `ORD-<...>` built from alphanumeric segments. The result is fully
//     determined by its arguments: identical inputs yield an identical
//     reference, and distinct inputs yield distinct references.
//
// It follows the explicit-validation, db-free style of the other helpers
// (e.g. src/currency.js) and is re-exported from src/index.js.
//
// These tests are written BEFORE the utility exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const orderReference = require('../src/order-reference.js');
const model = require('../src/index.js');

// A reference matches: the literal prefix `ORD`, then one or more segments each
// separated by `-` and composed only of uppercase letters and digits.
const REFERENCE_PATTERN = /^ORD-[0-9A-Z]+(?:-[0-9A-Z]+)*$/;

// ---------------------------------------------------------------------------
// Exports / shape
// ---------------------------------------------------------------------------

test('order-reference module exports generateOrderReference as a function', () => {
  assert.equal(typeof orderReference.generateOrderReference, 'function');
});

test('generateOrderReference returns a non-empty string', () => {
  const ref = orderReference.generateOrderReference({ sequence: 1, timestamp: 1700000000000 });
  assert.equal(typeof ref, 'string');
  assert.ok(ref.length > 0);
});

// ---------------------------------------------------------------------------
// Format: prefixed, human-readable, alphanumeric
// ---------------------------------------------------------------------------

test('generateOrderReference starts with the ORD- prefix', () => {
  const ref = orderReference.generateOrderReference({ sequence: 42, timestamp: 1700000000000 });
  assert.ok(ref.startsWith('ORD-'), `expected an ORD- prefix, received "${ref}"`);
});

test('generateOrderReference matches the alphanumeric reference format', () => {
  const ref = orderReference.generateOrderReference({ sequence: 42, timestamp: 1700000000000 });
  assert.match(ref, REFERENCE_PATTERN);
});

test('generateOrderReference contains no lowercase characters', () => {
  const ref = orderReference.generateOrderReference({ sequence: 7, timestamp: 1699999999999 });
  assert.equal(ref, ref.toUpperCase(), 'reference should be upper-cased / human-readable');
});

test('generateOrderReference contains no whitespace', () => {
  const ref = orderReference.generateOrderReference({ sequence: 7, timestamp: 1699999999999 });
  assert.doesNotMatch(ref, /\s/);
});

// ---------------------------------------------------------------------------
// Determinism (pure)
// ---------------------------------------------------------------------------

test('generateOrderReference is pure: identical inputs yield identical references', () => {
  const args = { sequence: 123, timestamp: 1700000000000 };
  assert.equal(
    orderReference.generateOrderReference(args),
    orderReference.generateOrderReference({ ...args }),
  );
});

// ---------------------------------------------------------------------------
// Uniqueness: distinct inputs yield distinct references
// ---------------------------------------------------------------------------

test('distinct sequences yield distinct references (same timestamp)', () => {
  const ts = 1700000000000;
  const a = orderReference.generateOrderReference({ sequence: 1, timestamp: ts });
  const b = orderReference.generateOrderReference({ sequence: 2, timestamp: ts });
  assert.notEqual(a, b);
});

test('distinct timestamps yield distinct references (same sequence)', () => {
  const seq = 5;
  const a = orderReference.generateOrderReference({ sequence: seq, timestamp: 1700000000000 });
  const b = orderReference.generateOrderReference({ sequence: seq, timestamp: 1700000000001 });
  assert.notEqual(a, b);
});

test('a run of distinct sequences produces all-unique references', () => {
  const ts = 1700000000000;
  const refs = [];
  for (let sequence = 0; sequence < 500; sequence += 1) {
    refs.push(orderReference.generateOrderReference({ sequence, timestamp: ts }));
  }
  assert.equal(new Set(refs).size, refs.length, 'every reference in the run must be unique');
});

test('every reference in a run keeps the required format', () => {
  const ts = 1700000000000;
  for (let sequence = 0; sequence < 100; sequence += 1) {
    const ref = orderReference.generateOrderReference({ sequence, timestamp: ts + sequence });
    assert.match(ref, REFERENCE_PATTERN);
  }
});

// ---------------------------------------------------------------------------
// Explicit validation (db-free, argument-driven style)
// ---------------------------------------------------------------------------

test('generateOrderReference throws when no arguments are supplied', () => {
  assert.throws(() => orderReference.generateOrderReference());
});

test('generateOrderReference throws when sequence is missing', () => {
  assert.throws(() => orderReference.generateOrderReference({ timestamp: 1700000000000 }));
});

test('generateOrderReference throws when timestamp is missing', () => {
  assert.throws(() => orderReference.generateOrderReference({ sequence: 1 }));
});

test('generateOrderReference throws when sequence is not a non-negative integer', () => {
  assert.throws(() => orderReference.generateOrderReference({ sequence: -1, timestamp: 1700000000000 }));
  assert.throws(() => orderReference.generateOrderReference({ sequence: 1.5, timestamp: 1700000000000 }));
  assert.throws(() => orderReference.generateOrderReference({ sequence: '1', timestamp: 1700000000000 }));
});

test('generateOrderReference throws when timestamp is not a number', () => {
  assert.throws(() => orderReference.generateOrderReference({ sequence: 1, timestamp: 'nope' }));
  assert.throws(() => orderReference.generateOrderReference({ sequence: 1, timestamp: NaN }));
});

// ---------------------------------------------------------------------------
// Re-export from the model API
// ---------------------------------------------------------------------------

test('generateOrderReference is re-exported from src/index.js', () => {
  assert.equal(typeof model.generateOrderReference, 'function');
  const args = { sequence: 9, timestamp: 1700000000000 };
  assert.equal(
    model.generateOrderReference(args),
    orderReference.generateOrderReference(args),
  );
});
