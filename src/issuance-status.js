'use strict';

// The payment / verification / issuance status vocabularies shared by the
// schema (CHECK constraints) and the application layer. Each vocabulary mirrors
// the src/requirement.js pattern: a frozen object mapping every member to its
// own string name, so the string literals below are the single source of truth
// reused directly in SQL CHECK constraints and app logic.

// A payment authorization progresses from PENDING, through AUTHORIZED (funds
// reserved), to a terminal SUCCEEDED or FAILED state. Covers both PSP card and
// mobile-money flows.
const PaymentStatus = Object.freeze({
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
});

// KYC/RICA identity verification is PENDING until a case is decided, then ends
// in a terminal PASSED or FAILED outcome.
const VerificationStatus = Object.freeze({
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
});

// eSIM issuance is a simple two-state gate: BLOCKED until both payment and
// verification succeed, then ISSUED.
const IssuanceStatus = Object.freeze({
  BLOCKED: 'BLOCKED',
  ISSUED: 'ISSUED',
});

module.exports = {
  PaymentStatus,
  VerificationStatus,
  IssuanceStatus,
};
