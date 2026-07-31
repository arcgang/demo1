'use strict';

// Acceptance tests: the KYC/RICA mock verification adapter.
//
// `src/verification-adapter.js` implements a deterministic, mockable KYC/RICA
// verification adapter matching the HLD external boundary. It performs NO real
// network calls; pass/fail is fully determined by the input so demo scenarios
// are repeatable (HLD §12.2). It follows the repo convention: plain CommonJS,
// `db` is the first argument, and plain `Error`s are thrown on invalid input.
//
// It exports:
//
//   verify(db, { type, identity, address })
//     -> {
//          status:            'PASSED' | 'FAILED',
//          providerReference: <non-empty string, deterministic from input>,
//          reasons:           <string[]>  (empty on PASSED, non-empty on FAILED)
//        }
//
//   `type` is the verification type ('KYC' or 'RICA'). `identity` carries the
//   customer identity fields (including `idDocumentNumber`). `address` carries
//   the residential address fields.
//
//   Determinism: a designated demo-failure identity (an `idDocumentNumber`
//   equal to DESIGNATED_FAILURE_ID) always yields FAILED with a reason; every
//   other well-formed identity yields PASSED. Identical inputs always yield an
//   identical result (same status and same providerReference).
//
// The adapter is also re-exported from src/index.js (matching the other
// helpers).
//
// These tests are written BEFORE the adapter exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const adapter = require('../src/verification-adapter.js');
const model = require('../src/index.js');

// A well-formed identity + address that should PASS verification. Mirrors the
// onboarding customer payload in LLD §5.10.
const VALID_IDENTITY = Object.freeze({
  firstName: 'Amina',
  lastName: 'Dlamini',
  idDocumentType: 'NATIONAL_ID',
  idDocumentNumber: '9001015800088',
});

const VALID_ADDRESS = Object.freeze({
  addressLine1: '10 Palm Street',
  city: 'Johannesburg',
});

// The designated demo-failure identity document number. Any identity carrying
// this document number deterministically FAILS verification so demos can show
// the failure path on demand.
const DESIGNATED_FAILURE_ID = '0000000000000';

function freshDb() {
  return model.createDatabase(':memory:');
}

function passingInput(overrides = {}) {
  return {
    type: 'RICA',
    identity: { ...VALID_IDENTITY },
    address: { ...VALID_ADDRESS },
    ...overrides,
  };
}

function failingInput() {
  return {
    type: 'RICA',
    identity: { ...VALID_IDENTITY, idDocumentNumber: DESIGNATED_FAILURE_ID },
    address: { ...VALID_ADDRESS },
  };
}

// ---------------------------------------------------------------------------
// Exports / shape
// ---------------------------------------------------------------------------

test('verification-adapter exports verify as a function', () => {
  assert.equal(typeof adapter.verify, 'function');
});

test('verify is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.verify, adapter.verify);
});

test('verify returns a normalized result object with status, providerReference and reasons', () => {
  const db = freshDb();
  const result = adapter.verify(db, passingInput());

  assert.ok(result && typeof result === 'object', 'expected a result object');
  assert.ok(['PASSED', 'FAILED'].includes(result.status), 'status must be PASSED or FAILED');
  assert.equal(typeof result.providerReference, 'string');
  assert.ok(result.providerReference.length > 0, 'providerReference must be non-empty');
  assert.ok(Array.isArray(result.reasons), 'reasons must be an array');
});

// ---------------------------------------------------------------------------
// PASSED case
// ---------------------------------------------------------------------------

test('verify returns PASSED for a well-formed identity and address', () => {
  const db = freshDb();
  const result = adapter.verify(db, passingInput());

  assert.equal(result.status, 'PASSED');
});

test('a PASSED result carries an empty reasons array', () => {
  const db = freshDb();
  const result = adapter.verify(db, passingInput());

  assert.equal(result.status, 'PASSED');
  assert.deepEqual(result.reasons, []);
});

test('a PASSED result carries a non-empty providerReference string', () => {
  const db = freshDb();
  const result = adapter.verify(db, passingInput());

  assert.equal(typeof result.providerReference, 'string');
  assert.ok(result.providerReference.length > 0);
});

test('both KYC and RICA verification types are accepted and PASS a well-formed identity', () => {
  const db = freshDb();

  const kyc = adapter.verify(db, passingInput({ type: 'KYC' }));
  const rica = adapter.verify(db, passingInput({ type: 'RICA' }));

  assert.equal(kyc.status, 'PASSED');
  assert.equal(rica.status, 'PASSED');
});

// ---------------------------------------------------------------------------
// FAILED case
// ---------------------------------------------------------------------------

test('verify returns FAILED for the designated demo-failure identity', () => {
  const db = freshDb();
  const result = adapter.verify(db, failingInput());

  assert.equal(result.status, 'FAILED');
});

test('a FAILED result carries at least one reason string', () => {
  const db = freshDb();
  const result = adapter.verify(db, failingInput());

  assert.equal(result.status, 'FAILED');
  assert.ok(Array.isArray(result.reasons));
  assert.ok(result.reasons.length >= 1, 'expected at least one failure reason');
  for (const reason of result.reasons) {
    assert.equal(typeof reason, 'string', 'each reason should be a string');
    assert.notEqual(reason.trim(), '', 'each reason should be non-empty');
  }
});

test('a FAILED result still carries a non-empty providerReference string', () => {
  const db = freshDb();
  const result = adapter.verify(db, failingInput());

  assert.equal(typeof result.providerReference, 'string');
  assert.ok(result.providerReference.length > 0);
});

// ---------------------------------------------------------------------------
// Determinism: repeatable demo scenarios (HLD §12.2)
// ---------------------------------------------------------------------------

test('identical inputs yield an identical status (repeatable pass)', () => {
  const db = freshDb();

  const first = adapter.verify(db, passingInput());
  const second = adapter.verify(db, passingInput());

  assert.equal(first.status, 'PASSED');
  assert.equal(second.status, first.status);
});

test('identical inputs yield an identical status (repeatable fail)', () => {
  const db = freshDb();

  const first = adapter.verify(db, failingInput());
  const second = adapter.verify(db, failingInput());

  assert.equal(first.status, 'FAILED');
  assert.equal(second.status, first.status);
});

test('identical inputs yield an identical providerReference', () => {
  const db = freshDb();

  const first = adapter.verify(db, passingInput());
  const second = adapter.verify(db, passingInput());

  assert.equal(second.providerReference, first.providerReference);
});

test('the outcome depends only on the input, not on prior calls', () => {
  const db = freshDb();

  // Interleave a failing call between two passing calls; the passing outcome
  // must be unchanged.
  const passA = adapter.verify(db, passingInput());
  adapter.verify(db, failingInput());
  const passB = adapter.verify(db, passingInput());

  assert.equal(passA.status, 'PASSED');
  assert.equal(passB.status, 'PASSED');
  assert.equal(passB.providerReference, passA.providerReference);
});

// ---------------------------------------------------------------------------
// Input validation: plain Error thrown on invalid input
// ---------------------------------------------------------------------------

test('verify throws when the request object is missing', () => {
  const db = freshDb();
  assert.throws(() => adapter.verify(db), Error);
});

test('verify throws when the verification type is missing', () => {
  const db = freshDb();
  assert.throws(
    () => adapter.verify(db, { identity: { ...VALID_IDENTITY }, address: { ...VALID_ADDRESS } }),
    Error,
  );
});

test('verify throws on an unknown verification type', () => {
  const db = freshDb();
  assert.throws(
    () => adapter.verify(db, passingInput({ type: 'PASSPORT_SCAN' })),
    Error,
  );
});

test('verify throws when identity is missing', () => {
  const db = freshDb();
  assert.throws(
    () => adapter.verify(db, { type: 'RICA', address: { ...VALID_ADDRESS } }),
    Error,
  );
});

test('verify throws when the identity document number is missing', () => {
  const db = freshDb();
  const identity = { ...VALID_IDENTITY };
  delete identity.idDocumentNumber;
  assert.throws(
    () => adapter.verify(db, { type: 'RICA', identity, address: { ...VALID_ADDRESS } }),
    Error,
  );
});

test('verify throws when address is missing', () => {
  const db = freshDb();
  assert.throws(
    () => adapter.verify(db, { type: 'RICA', identity: { ...VALID_IDENTITY } }),
    Error,
  );
});

test('verify throws a plain Error (not a raw SQL/constraint failure) on invalid input', () => {
  const db = freshDb();
  try {
    adapter.verify(db, {});
    assert.fail('expected verify to throw on invalid input');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.equal(typeof err.message, 'string');
    assert.notEqual(err.message.trim(), '');
  }
});
