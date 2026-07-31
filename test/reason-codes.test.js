'use strict';

// Acceptance tests (unit): the error reason-code and message catalog.
//
// `src/reason-codes.js` is the single source of truth for blocking-state
// messaging. It mirrors the frozen-enum pattern of `src/requirement.js` and
// `src/status.js` and exports:
//
//   REASON_CODE          frozen enum of the failures that already exist in the
//                        service layer today, each mapping to its own name:
//                          MISSING_OR_INVALID_DEVICE_ID  (recommend/attach: missing/invalid deviceId)
//                          UNKNOWN_DEVICE                (device id references no catalog device)
//                          MISSING_CUSTOMER_CONTEXT      (recommend: missing customer context)
//                          MISSING_OR_INVALID_REQUIREMENT(attach: missing/invalid requirement)
//                          NO_ADDON_REFERENCED           (attach: no bundle or accessory referenced)
//                          INVALID_REQUIREMENT_FILTER    (getAttachmentsForDevice*: bad filter)
//                          UNEXPECTED                    (generic fallback)
//   REASON_CODE_VALUES   frozen array of the enum values
//
//   CATEGORY             frozen vocabulary: RETRYABLE, NEEDS_SUPPORT, NEEDS_DOCUMENTATION
//   CATEGORY_VALUES      frozen array of the category values
//
//   STATE_PRESERVATION       frozen vocabulary: PRESERVED, DISCARDED, UNKNOWN
//   STATE_PRESERVATION_VALUES frozen array of the values
//
//   getReasonMeta(code)  -> { code, message, nextStep, category } for a known
//                           code; throws for an unknown code
//   isValidReasonCode(code) -> boolean
//
// Every catalog entry carries a user-friendly explanation (`message`), a
// next-step hint (`nextStep`) and a default `category` drawn from CATEGORY.
// The catalog and every vocabulary are immutable (frozen).
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../src/reason-codes.js');

// The exact reason-code contract expected by the service layer today.
const EXPECTED_REASON_CODES = Object.freeze([
  'MISSING_OR_INVALID_DEVICE_ID',
  'UNKNOWN_DEVICE',
  'MISSING_CUSTOMER_CONTEXT',
  'MISSING_OR_INVALID_REQUIREMENT',
  'NO_ADDON_REFERENCED',
  'INVALID_REQUIREMENT_FILTER',
  'UNEXPECTED',
]);

// ---------------------------------------------------------------------------
// REASON_CODE enum
// ---------------------------------------------------------------------------

test('exports a REASON_CODE object', () => {
  assert.equal(typeof catalog.REASON_CODE, 'object');
  assert.notEqual(catalog.REASON_CODE, null);
});

test('REASON_CODE has exactly the defined members, each mapping to its own name', () => {
  const expected = {};
  for (const code of EXPECTED_REASON_CODES) expected[code] = code;
  assert.deepEqual(catalog.REASON_CODE, expected);
});

test('REASON_CODE covers every failure that exists in the service layer today', () => {
  for (const code of EXPECTED_REASON_CODES) {
    assert.equal(
      catalog.REASON_CODE[code],
      code,
      `expected REASON_CODE.${code} to exist and equal "${code}"`,
    );
  }
});

test('REASON_CODE is frozen', () => {
  assert.equal(Object.isFrozen(catalog.REASON_CODE), true);
});

test('REASON_CODE cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    catalog.REASON_CODE.UNEXPECTED = 'CHANGED';
  });
  assert.equal(catalog.REASON_CODE.UNEXPECTED, 'UNEXPECTED');
});

test('REASON_CODE cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    catalog.REASON_CODE.MADE_UP = 'MADE_UP';
  });
  assert.equal(catalog.REASON_CODE.MADE_UP, undefined);
});

// ---------------------------------------------------------------------------
// REASON_CODE_VALUES
// ---------------------------------------------------------------------------

test('exports REASON_CODE_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(catalog.REASON_CODE_VALUES));
  assert.deepEqual(
    [...catalog.REASON_CODE_VALUES].sort(),
    [...EXPECTED_REASON_CODES].sort(),
  );
});

test('REASON_CODE_VALUES matches Object.values(REASON_CODE)', () => {
  assert.deepEqual(
    [...catalog.REASON_CODE_VALUES],
    Object.values(catalog.REASON_CODE),
  );
});

test('REASON_CODE_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(catalog.REASON_CODE_VALUES), true);
});

// ---------------------------------------------------------------------------
// CATEGORY vocabulary
// ---------------------------------------------------------------------------

test('exports a CATEGORY vocabulary distinguishing RETRYABLE / NEEDS_SUPPORT / NEEDS_DOCUMENTATION', () => {
  assert.equal(typeof catalog.CATEGORY, 'object');
  assert.notEqual(catalog.CATEGORY, null);
  assert.deepEqual(catalog.CATEGORY, {
    RETRYABLE: 'RETRYABLE',
    NEEDS_SUPPORT: 'NEEDS_SUPPORT',
    NEEDS_DOCUMENTATION: 'NEEDS_DOCUMENTATION',
  });
});

test('CATEGORY is frozen and cannot gain new members', () => {
  assert.equal(Object.isFrozen(catalog.CATEGORY), true);
  assert.throws(() => {
    'use strict';
    catalog.CATEGORY.TERMINAL = 'TERMINAL';
  });
  assert.equal(catalog.CATEGORY.TERMINAL, undefined);
});

test('exports CATEGORY_VALUES as a frozen array of the category values', () => {
  assert.ok(Array.isArray(catalog.CATEGORY_VALUES));
  assert.deepEqual(
    [...catalog.CATEGORY_VALUES],
    Object.values(catalog.CATEGORY),
  );
  assert.equal(Object.isFrozen(catalog.CATEGORY_VALUES), true);
});

// ---------------------------------------------------------------------------
// STATE_PRESERVATION vocabulary
// ---------------------------------------------------------------------------

test('exports a STATE_PRESERVATION vocabulary: PRESERVED / DISCARDED / UNKNOWN', () => {
  assert.equal(typeof catalog.STATE_PRESERVATION, 'object');
  assert.notEqual(catalog.STATE_PRESERVATION, null);
  assert.deepEqual(catalog.STATE_PRESERVATION, {
    PRESERVED: 'PRESERVED',
    DISCARDED: 'DISCARDED',
    UNKNOWN: 'UNKNOWN',
  });
});

test('STATE_PRESERVATION is frozen and cannot gain new members', () => {
  assert.equal(Object.isFrozen(catalog.STATE_PRESERVATION), true);
  assert.throws(() => {
    'use strict';
    catalog.STATE_PRESERVATION.PARTIAL = 'PARTIAL';
  });
  assert.equal(catalog.STATE_PRESERVATION.PARTIAL, undefined);
});

test('exports STATE_PRESERVATION_VALUES as a frozen array of the values', () => {
  assert.ok(Array.isArray(catalog.STATE_PRESERVATION_VALUES));
  assert.deepEqual(
    [...catalog.STATE_PRESERVATION_VALUES],
    Object.values(catalog.STATE_PRESERVATION),
  );
  assert.equal(Object.isFrozen(catalog.STATE_PRESERVATION_VALUES), true);
});

// ---------------------------------------------------------------------------
// Catalog completeness: every reason code has message, next-step, category
// ---------------------------------------------------------------------------

test('every reason code resolves to metadata with a message, next-step and valid category', () => {
  for (const code of catalog.REASON_CODE_VALUES) {
    const meta = catalog.getReasonMeta(code);
    assert.ok(meta && typeof meta === 'object', `getReasonMeta(${code}) must return an object`);

    assert.equal(meta.code, code, `meta.code should echo the requested code (${code})`);

    assert.equal(typeof meta.message, 'string', `${code} must have a string message`);
    assert.ok(meta.message.trim().length > 0, `${code} message must not be empty`);

    assert.equal(typeof meta.nextStep, 'string', `${code} must have a string next-step hint`);
    assert.ok(meta.nextStep.trim().length > 0, `${code} next-step must not be empty`);

    assert.ok(
      catalog.CATEGORY_VALUES.includes(meta.category),
      `${code} category (${meta.category}) must be a valid CATEGORY`,
    );
  }
});

test('the generic UNEXPECTED fallback is categorised NEEDS_SUPPORT', () => {
  const meta = catalog.getReasonMeta(catalog.REASON_CODE.UNEXPECTED);
  assert.equal(meta.category, catalog.CATEGORY.NEEDS_SUPPORT);
});

// ---------------------------------------------------------------------------
// getReasonMeta
// ---------------------------------------------------------------------------

test('exports getReasonMeta as a function', () => {
  assert.equal(typeof catalog.getReasonMeta, 'function');
});

test('getReasonMeta returns the same metadata for a known code across calls', () => {
  const code = catalog.REASON_CODE.MISSING_OR_INVALID_DEVICE_ID;
  const first = catalog.getReasonMeta(code);
  const second = catalog.getReasonMeta(code);
  assert.deepEqual(first, second);
});

test('getReasonMeta rejects unknown / malformed codes', () => {
  assert.throws(() => catalog.getReasonMeta('NOT_A_CODE'));
  assert.throws(() => catalog.getReasonMeta('missing_or_invalid_device_id'));
  assert.throws(() => catalog.getReasonMeta(''));
  assert.throws(() => catalog.getReasonMeta(undefined));
  assert.throws(() => catalog.getReasonMeta(null));
  assert.throws(() => catalog.getReasonMeta(0));
});

test('metadata returned by getReasonMeta is immutable (frozen)', () => {
  const meta = catalog.getReasonMeta(catalog.REASON_CODE.UNKNOWN_DEVICE);
  assert.equal(Object.isFrozen(meta), true);
  assert.throws(() => {
    'use strict';
    meta.message = 'tampered';
  });
});

// ---------------------------------------------------------------------------
// isValidReasonCode
// ---------------------------------------------------------------------------

test('exports isValidReasonCode as a function', () => {
  assert.equal(typeof catalog.isValidReasonCode, 'function');
});

test('isValidReasonCode accepts every REASON_CODE value', () => {
  for (const code of catalog.REASON_CODE_VALUES) {
    assert.equal(catalog.isValidReasonCode(code), true, `expected ${code} to be valid`);
  }
});

test('isValidReasonCode rejects unknown / malformed values', () => {
  assert.equal(catalog.isValidReasonCode('NOT_A_CODE'), false);
  assert.equal(catalog.isValidReasonCode('unexpected'), false);
  assert.equal(catalog.isValidReasonCode(''), false);
  assert.equal(catalog.isValidReasonCode(undefined), false);
  assert.equal(catalog.isValidReasonCode(null), false);
  assert.equal(catalog.isValidReasonCode(0), false);
  assert.equal(catalog.isValidReasonCode('RETRYABLE'), false);
});
