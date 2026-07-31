'use strict';

// Acceptance tests (unit): the shared SIM/eSIM fulfilment-type vocabulary.
//
// `src/fulfilmentType.js` mirrors the `src/requirement.js` / `src/status.js`
// pattern and is the single source of truth for the fulfilment-type strings
// used by the `sim_offers` schema CHECK constraint and the application layer.
// It is expected to export:
//
//   FULFILMENT_TYPE         frozen enum: SIM, ESIM
//   FULFILMENT_TYPE_VALUES  frozen array of the enum values
//   isValidFulfilmentType(value) -> boolean
//
// Following the requirement/status precedent, every enum/helper is also
// re-exported from src/index.js.
//
// These tests are written BEFORE the module exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const fulfilment = require('../src/fulfilmentType.js');
const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// FULFILMENT_TYPE enum
// ---------------------------------------------------------------------------

test('exports a FULFILMENT_TYPE object', () => {
  assert.equal(typeof fulfilment.FULFILMENT_TYPE, 'object');
  assert.notEqual(fulfilment.FULFILMENT_TYPE, null);
});

test('FULFILMENT_TYPE has exactly the two defined members mapping to their own names', () => {
  assert.deepEqual(fulfilment.FULFILMENT_TYPE, {
    SIM: 'SIM',
    ESIM: 'ESIM',
  });
});

test('FULFILMENT_TYPE is frozen', () => {
  assert.equal(Object.isFrozen(fulfilment.FULFILMENT_TYPE), true);
});

test('FULFILMENT_TYPE cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    fulfilment.FULFILMENT_TYPE.SIM = 'CHANGED';
  });
  assert.equal(fulfilment.FULFILMENT_TYPE.SIM, 'SIM');
});

test('FULFILMENT_TYPE cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    fulfilment.FULFILMENT_TYPE.PHYSICAL = 'PHYSICAL';
  });
  assert.equal(fulfilment.FULFILMENT_TYPE.PHYSICAL, undefined);
});

// ---------------------------------------------------------------------------
// FULFILMENT_TYPE_VALUES
// ---------------------------------------------------------------------------

test('exports FULFILMENT_TYPE_VALUES as an array of the enum values', () => {
  assert.ok(Array.isArray(fulfilment.FULFILMENT_TYPE_VALUES));
  assert.deepEqual(
    [...fulfilment.FULFILMENT_TYPE_VALUES].sort(),
    ['ESIM', 'SIM'],
  );
});

test('FULFILMENT_TYPE_VALUES matches Object.values(FULFILMENT_TYPE)', () => {
  assert.deepEqual(
    [...fulfilment.FULFILMENT_TYPE_VALUES],
    Object.values(fulfilment.FULFILMENT_TYPE),
  );
});

test('FULFILMENT_TYPE_VALUES is frozen', () => {
  assert.equal(Object.isFrozen(fulfilment.FULFILMENT_TYPE_VALUES), true);
});

// ---------------------------------------------------------------------------
// isValidFulfilmentType
// ---------------------------------------------------------------------------

test('exports isValidFulfilmentType as a function', () => {
  assert.equal(typeof fulfilment.isValidFulfilmentType, 'function');
});

test('isValidFulfilmentType accepts every FULFILMENT_TYPE value', () => {
  for (const value of Object.values(fulfilment.FULFILMENT_TYPE)) {
    assert.equal(
      fulfilment.isValidFulfilmentType(value),
      true,
      `expected ${value} to be valid`,
    );
  }
});

test('isValidFulfilmentType rejects unknown / malformed values', () => {
  assert.equal(fulfilment.isValidFulfilmentType('PHYSICAL'), false);
  assert.equal(fulfilment.isValidFulfilmentType('sim'), false);
  assert.equal(fulfilment.isValidFulfilmentType('esim'), false);
  assert.equal(fulfilment.isValidFulfilmentType(''), false);
  assert.equal(fulfilment.isValidFulfilmentType(undefined), false);
  assert.equal(fulfilment.isValidFulfilmentType(null), false);
  assert.equal(fulfilment.isValidFulfilmentType(0), false);
});

// ---------------------------------------------------------------------------
// Re-export from the model API (src/index.js)
// ---------------------------------------------------------------------------

test('FULFILMENT_TYPE is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.FULFILMENT_TYPE, fulfilment.FULFILMENT_TYPE);
});

test('FULFILMENT_TYPE_VALUES is re-exported from src/index.js (same reference)', () => {
  assert.equal(model.FULFILMENT_TYPE_VALUES, fulfilment.FULFILMENT_TYPE_VALUES);
});

test('isValidFulfilmentType is re-exported from src/index.js', () => {
  assert.equal(model.isValidFulfilmentType, fulfilment.isValidFulfilmentType);
});
