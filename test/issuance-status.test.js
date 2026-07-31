'use strict';

// Acceptance tests (unit): the payment / verification / issuance status
// vocabularies.
//
// `src/issuance-status.js` mirrors the `src/requirement.js` pattern (a frozen
// object mapping each member to its own string name) and is the single source
// of truth for the controlled string vocabularies reused by schema CHECK
// constraints and application logic:
//
//   PaymentStatus       frozen enum: PENDING, AUTHORIZED, SUCCEEDED, FAILED
//                       (PSP card/mobile-money authorization lifecycle)
//   VerificationStatus  frozen enum: PENDING, PASSED, FAILED
//                       (KYC/RICA identity verification outcome)
//   IssuanceStatus      frozen enum: BLOCKED, ISSUED
//                       (eSIM issuance gate: blocked until payment + verification
//                        succeed, then issued)
//
// Each vocabulary is an ordinary object whose keys equal their string values,
// and every object is frozen so the vocabulary cannot be mutated or extended at
// runtime. These string values are intended for direct reuse in SQL CHECK
// constraints, so they must be the exact literals below.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const vocab = require('../src/issuance-status.js');

// ---------------------------------------------------------------------------
// PaymentStatus enum
// ---------------------------------------------------------------------------

test('exports a PaymentStatus object', () => {
  assert.equal(typeof vocab.PaymentStatus, 'object');
  assert.notEqual(vocab.PaymentStatus, null);
});

test('PaymentStatus has exactly the expected members mapping to their own names', () => {
  assert.deepEqual(vocab.PaymentStatus, {
    PENDING: 'PENDING',
    AUTHORIZED: 'AUTHORIZED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
  });
});

test('PaymentStatus exposes each member as its own uppercase string value', () => {
  for (const [key, value] of Object.entries(vocab.PaymentStatus)) {
    assert.equal(value, key, `PaymentStatus.${key} should equal "${key}"`);
    assert.equal(typeof value, 'string');
  }
});

test('PaymentStatus is frozen', () => {
  assert.equal(Object.isFrozen(vocab.PaymentStatus), true);
});

test('PaymentStatus cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    vocab.PaymentStatus.PENDING = 'CHANGED';
  });
  assert.equal(vocab.PaymentStatus.PENDING, 'PENDING');
});

test('PaymentStatus cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    vocab.PaymentStatus.REFUNDED = 'REFUNDED';
  });
  assert.equal(vocab.PaymentStatus.REFUNDED, undefined);
});

// ---------------------------------------------------------------------------
// VerificationStatus enum (KYC / RICA)
// ---------------------------------------------------------------------------

test('exports a VerificationStatus object', () => {
  assert.equal(typeof vocab.VerificationStatus, 'object');
  assert.notEqual(vocab.VerificationStatus, null);
});

test('VerificationStatus has exactly the expected members mapping to their own names', () => {
  assert.deepEqual(vocab.VerificationStatus, {
    PENDING: 'PENDING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
  });
});

test('VerificationStatus exposes each member as its own uppercase string value', () => {
  for (const [key, value] of Object.entries(vocab.VerificationStatus)) {
    assert.equal(value, key, `VerificationStatus.${key} should equal "${key}"`);
    assert.equal(typeof value, 'string');
  }
});

test('VerificationStatus is frozen', () => {
  assert.equal(Object.isFrozen(vocab.VerificationStatus), true);
});

test('VerificationStatus cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    vocab.VerificationStatus.PASSED = 'CHANGED';
  });
  assert.equal(vocab.VerificationStatus.PASSED, 'PASSED');
});

test('VerificationStatus cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    vocab.VerificationStatus.REVIEW = 'REVIEW';
  });
  assert.equal(vocab.VerificationStatus.REVIEW, undefined);
});

// ---------------------------------------------------------------------------
// IssuanceStatus enum (eSIM issuance gate)
// ---------------------------------------------------------------------------

test('exports an IssuanceStatus object', () => {
  assert.equal(typeof vocab.IssuanceStatus, 'object');
  assert.notEqual(vocab.IssuanceStatus, null);
});

test('IssuanceStatus has exactly the expected members mapping to their own names', () => {
  assert.deepEqual(vocab.IssuanceStatus, {
    BLOCKED: 'BLOCKED',
    ISSUED: 'ISSUED',
  });
});

test('IssuanceStatus exposes each member as its own uppercase string value', () => {
  for (const [key, value] of Object.entries(vocab.IssuanceStatus)) {
    assert.equal(value, key, `IssuanceStatus.${key} should equal "${key}"`);
    assert.equal(typeof value, 'string');
  }
});

test('IssuanceStatus is frozen', () => {
  assert.equal(Object.isFrozen(vocab.IssuanceStatus), true);
});

test('IssuanceStatus cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    vocab.IssuanceStatus.BLOCKED = 'CHANGED';
  });
  assert.equal(vocab.IssuanceStatus.BLOCKED, 'BLOCKED');
});

test('IssuanceStatus cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    vocab.IssuanceStatus.PENDING = 'PENDING';
  });
  assert.equal(vocab.IssuanceStatus.PENDING, undefined);
});

// ---------------------------------------------------------------------------
// The three vocabularies are distinct, independent objects
// ---------------------------------------------------------------------------

test('the three vocabularies are distinct object references', () => {
  assert.notEqual(vocab.PaymentStatus, vocab.VerificationStatus);
  assert.notEqual(vocab.PaymentStatus, vocab.IssuanceStatus);
  assert.notEqual(vocab.VerificationStatus, vocab.IssuanceStatus);
});

test('IssuanceStatus is limited to the two-state gate and carries no lifecycle members', () => {
  // Issuance is a simple gate: blocked until prerequisites succeed, then issued.
  assert.deepEqual(Object.keys(vocab.IssuanceStatus).sort(), ['BLOCKED', 'ISSUED']);
  assert.equal(vocab.IssuanceStatus.SUCCEEDED, undefined);
  assert.equal(vocab.IssuanceStatus.AUTHORIZED, undefined);
});

test('VerificationStatus does not borrow payment-only member names', () => {
  // KYC/RICA outcomes are PENDING / PASSED / FAILED, not the PSP lifecycle.
  assert.equal(vocab.VerificationStatus.AUTHORIZED, undefined);
  assert.equal(vocab.VerificationStatus.SUCCEEDED, undefined);
});
