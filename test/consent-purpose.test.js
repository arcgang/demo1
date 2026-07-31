'use strict';

// Acceptance tests (unit): the consent-purpose vocabulary and the
// operational-vs-optional classification.
//
// `src/consent-purpose.js` is the single source of truth that keeps
// marketing / personalization consent conceptually separate from the
// operationally-required processing consent. It mirrors the frozen-enum
// pattern of `src/requirement.js` and `src/status.js` and exports:
//
//   CONSENT_PURPOSE            frozen enum of consent purposes, each mapping to
//                              its own name:
//                                OPERATIONAL_ORDER_PROCESSING
//                                MARKETING
//                                PERSONALIZATION
//   CONSENT_PURPOSE_VALUES     frozen array of the enum values
//   isValidConsentPurpose(v)   -> boolean
//
//   OPTIONAL_CONSENT_PURPOSES  a Set of the purposes that are optional
//                              (MARKETING, PERSONALIZATION)
//   isOptionalConsentPurpose(p) -> boolean; true for optional purposes,
//                              false for operationally-required processing
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../src/consent-purpose.js');

// The exact consent-purpose contract expected by the design.
const EXPECTED_PURPOSES = Object.freeze([
  'OPERATIONAL_ORDER_PROCESSING',
  'MARKETING',
  'PERSONALIZATION',
]);

// The purposes the design marks as OPTIONAL (separate optional consent).
const EXPECTED_OPTIONAL = Object.freeze(['MARKETING', 'PERSONALIZATION']);

// The purposes the design marks as operationally required.
const EXPECTED_REQUIRED = Object.freeze(['OPERATIONAL_ORDER_PROCESSING']);

// ---------------------------------------------------------------------------
// CONSENT_PURPOSE enum
// ---------------------------------------------------------------------------

test('exports a CONSENT_PURPOSE object', () => {
  assert.equal(typeof mod.CONSENT_PURPOSE, 'object');
  assert.notEqual(mod.CONSENT_PURPOSE, null);
});

test('CONSENT_PURPOSE has exactly the defined members, each mapping to its own name', () => {
  const expected = {};
  for (const p of EXPECTED_PURPOSES) expected[p] = p;
  assert.deepEqual(mod.CONSENT_PURPOSE, expected);
});

test('CONSENT_PURPOSE exposes each expected purpose', () => {
  for (const p of EXPECTED_PURPOSES) {
    assert.equal(
      mod.CONSENT_PURPOSE[p],
      p,
      `expected CONSENT_PURPOSE.${p} to exist and equal "${p}"`,
    );
  }
});

test('CONSENT_PURPOSE is frozen', () => {
  assert.equal(Object.isFrozen(mod.CONSENT_PURPOSE), true);
});

test('CONSENT_PURPOSE cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    mod.CONSENT_PURPOSE.MARKETING = 'CHANGED';
  });
  assert.equal(mod.CONSENT_PURPOSE.MARKETING, 'MARKETING');
});

test('CONSENT_PURPOSE cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    mod.CONSENT_PURPOSE.MADE_UP = 'MADE_UP';
  });
  assert.equal(mod.CONSENT_PURPOSE.MADE_UP, undefined);
});

// ---------------------------------------------------------------------------
// CONSENT_PURPOSE_VALUES
// ---------------------------------------------------------------------------

test('exports CONSENT_PURPOSE_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(mod.CONSENT_PURPOSE_VALUES));
  assert.deepEqual(
    [...mod.CONSENT_PURPOSE_VALUES].sort(),
    [...EXPECTED_PURPOSES].sort(),
  );
});

test('CONSENT_PURPOSE_VALUES matches Object.values(CONSENT_PURPOSE)', () => {
  assert.deepEqual(
    [...mod.CONSENT_PURPOSE_VALUES],
    Object.values(mod.CONSENT_PURPOSE),
  );
});

test('CONSENT_PURPOSE_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(mod.CONSENT_PURPOSE_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidConsentPurpose
// ---------------------------------------------------------------------------

test('exports isValidConsentPurpose as a function', () => {
  assert.equal(typeof mod.isValidConsentPurpose, 'function');
});

test('isValidConsentPurpose accepts every CONSENT_PURPOSE value', () => {
  for (const p of mod.CONSENT_PURPOSE_VALUES) {
    assert.equal(mod.isValidConsentPurpose(p), true, `expected ${p} to be valid`);
  }
});

test('isValidConsentPurpose rejects unknown / malformed values', () => {
  assert.equal(mod.isValidConsentPurpose('NOT_A_PURPOSE'), false);
  assert.equal(mod.isValidConsentPurpose('marketing'), false);
  assert.equal(mod.isValidConsentPurpose('personalisation'), false);
  assert.equal(mod.isValidConsentPurpose(''), false);
  assert.equal(mod.isValidConsentPurpose(undefined), false);
  assert.equal(mod.isValidConsentPurpose(null), false);
  assert.equal(mod.isValidConsentPurpose(0), false);
});

// ---------------------------------------------------------------------------
// OPTIONAL_CONSENT_PURPOSES classification
// ---------------------------------------------------------------------------

test('exports OPTIONAL_CONSENT_PURPOSES as a Set', () => {
  assert.ok(mod.OPTIONAL_CONSENT_PURPOSES instanceof Set);
});

test('OPTIONAL_CONSENT_PURPOSES contains exactly MARKETING and PERSONALIZATION', () => {
  assert.deepEqual(
    [...mod.OPTIONAL_CONSENT_PURPOSES].sort(),
    [...EXPECTED_OPTIONAL].sort(),
  );
});

test('OPTIONAL_CONSENT_PURPOSES does not contain operational processing', () => {
  for (const p of EXPECTED_REQUIRED) {
    assert.equal(
      mod.OPTIONAL_CONSENT_PURPOSES.has(p),
      false,
      `${p} must NOT be classified as optional`,
    );
  }
});

test('every optional purpose is a valid consent purpose', () => {
  for (const p of mod.OPTIONAL_CONSENT_PURPOSES) {
    assert.equal(mod.isValidConsentPurpose(p), true, `${p} must be a valid purpose`);
  }
});

// ---------------------------------------------------------------------------
// isOptionalConsentPurpose classification guard
// ---------------------------------------------------------------------------

test('exports isOptionalConsentPurpose as a function', () => {
  assert.equal(typeof mod.isOptionalConsentPurpose, 'function');
});

test('isOptionalConsentPurpose returns true for MARKETING and PERSONALIZATION', () => {
  for (const p of EXPECTED_OPTIONAL) {
    assert.equal(
      mod.isOptionalConsentPurpose(p),
      true,
      `${p} must be classified as optional`,
    );
  }
});

test('isOptionalConsentPurpose returns false for operational order processing', () => {
  for (const p of EXPECTED_REQUIRED) {
    assert.equal(
      mod.isOptionalConsentPurpose(p),
      false,
      `${p} is operationally required, not optional`,
    );
  }
});

test('isOptionalConsentPurpose keeps operational processing separate from optional consent', () => {
  // Operational processing is required; marketing/personalization are optional.
  assert.equal(
    mod.isOptionalConsentPurpose(mod.CONSENT_PURPOSE.OPERATIONAL_ORDER_PROCESSING),
    false,
  );
  assert.equal(mod.isOptionalConsentPurpose(mod.CONSENT_PURPOSE.MARKETING), true);
  assert.equal(mod.isOptionalConsentPurpose(mod.CONSENT_PURPOSE.PERSONALIZATION), true);
});

test('isOptionalConsentPurpose returns false for unknown / malformed values', () => {
  assert.equal(mod.isOptionalConsentPurpose('NOT_A_PURPOSE'), false);
  assert.equal(mod.isOptionalConsentPurpose('marketing'), false);
  assert.equal(mod.isOptionalConsentPurpose(''), false);
  assert.equal(mod.isOptionalConsentPurpose(undefined), false);
  assert.equal(mod.isOptionalConsentPurpose(null), false);
  assert.equal(mod.isOptionalConsentPurpose(0), false);
});
