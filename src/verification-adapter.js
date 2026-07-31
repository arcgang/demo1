'use strict';

// KYC/RICA mock verification adapter — the demo realization of the KYC/RICA
// Verification Service boundary named in the HLD (see LLD §8.1,
// `KycRicaAdapter`). It performs NO real network calls: pass/fail is fully
// determined by the input so demo scenarios are repeatable (HLD §12.2
// deterministic demo scenarios).
//
// Following the repo convention, `verify` takes `db` as its first argument
// (even though this mock reads nothing from it) so the adapter matches the
// signature the OnboardingVerificationModule invokes it with, and it throws a
// plain `Error` on invalid input rather than leaking a raw failure.

// The verification types this adapter accepts, mirroring the KYC/RICA boundary.
const VERIFICATION_TYPES = Object.freeze(['KYC', 'RICA']);

// The designated demo-failure identity document number. Any identity carrying
// this document number deterministically FAILS verification, so a demo can show
// the failure path on demand. Every other well-formed identity PASSES.
const DESIGNATED_FAILURE_ID = '0000000000000';

// A small, stable non-cryptographic hash (FNV-1a, 32-bit) used to derive a
// deterministic provider reference from the input. Same input string always
// yields the same digits; it never touches a clock or random source.
function stableHash(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Multiply by the FNV prime (16777619) using >>> 0 to stay in 32 bits.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Build the provider reference the upstream KYC/RICA service would return,
// deterministically from the verification type and identity document number.
function providerReferenceFor(type, idDocumentNumber) {
  const digest = stableHash(`${type}:${idDocumentNumber}`)
    .toString(36)
    .toUpperCase()
    .padStart(7, '0');
  return `${type}-REF-${digest}`;
}

// Run a deterministic, mockable KYC/RICA verification against the supplied
// identity and address. Returns a normalized result:
//
//   { status: 'PASSED' | 'FAILED', providerReference: string, reasons: string[] }
//
// `reasons` is empty on PASSED and carries at least one message on FAILED.
function verify(db, { type, identity, address } = {}) {
  if (type === undefined || type === null || type === '') {
    throw new Error('type is required (must be KYC or RICA)');
  }
  if (!VERIFICATION_TYPES.includes(type)) {
    throw new Error(
      `type must be one of ${VERIFICATION_TYPES.join(', ')}; received "${type}"`,
    );
  }
  if (identity === undefined || identity === null || typeof identity !== 'object') {
    throw new Error('identity is required');
  }
  const idDocumentNumber = identity.idDocumentNumber;
  if (typeof idDocumentNumber !== 'string' || idDocumentNumber.trim() === '') {
    throw new Error('identity.idDocumentNumber is required');
  }
  if (address === undefined || address === null || typeof address !== 'object') {
    throw new Error('address is required');
  }

  const providerReference = providerReferenceFor(type, idDocumentNumber);

  if (idDocumentNumber === DESIGNATED_FAILURE_ID) {
    return {
      status: 'FAILED',
      providerReference,
      reasons: ['Identity document could not be verified against the population register.'],
    };
  }

  return { status: 'PASSED', providerReference, reasons: [] };
}

module.exports = {
  VERIFICATION_TYPES,
  DESIGNATED_FAILURE_ID,
  verify,
};
