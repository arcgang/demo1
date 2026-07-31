'use strict';

// Acceptance tests: the SIM/eSIM offer model functions.
//
// `src/index.js` exposes two model-layer functions that persist and retrieve
// SIM/eSIM offers, mirroring the makeCreator/makeLister conventions used for
// the rest of the catalog (devices/plans/bundles/accessories):
//
//   createSimOffer(db, { type, name, price, requiresVerification, activationType })
//     Persist a SIM/eSIM offer row and return the shaped record. `type` and
//     `activationType` are validated against their enums; `name` is required;
//     `price` is validated like a catalog price (defaults to 0, must be a
//     non-negative number). The onboarding fields (requiresVerification,
//     activationType) are persisted alongside the offer.
//
//   getSimOffers(db)
//     Return the persisted SIM/eSIM offers (ordered by id) as shaped records.
//
// Both functions are re-exported from src/index.js module.exports.
//
// These tests are written BEFORE the functions exist and must fail until they
// are implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

// ---------------------------------------------------------------------------
// Exports / shape
// ---------------------------------------------------------------------------

test('createSimOffer and getSimOffers are re-exported as functions from src/index.js', () => {
  assert.equal(typeof model.createSimOffer, 'function');
  assert.equal(typeof model.getSimOffers, 'function');
});

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

test('createSimOffer persists an offer and returns its shaped record', () => {
  const db = freshDb();

  const offer = model.createSimOffer(db, {
    type: 'SIM',
    name: 'Prepaid Starter SIM',
    price: 50,
    requiresVerification: true,
    activationType: 'POST_VERIFICATION',
  });

  assert.equal(typeof offer.id, 'number', 'offer carries a numeric id');
  assert.ok(offer.id > 0, 'offer id is a real row id');
  assert.equal(offer.type, 'SIM');
  assert.equal(offer.name, 'Prepaid Starter SIM');
  assert.equal(offer.price, 50);
  assert.equal(offer.activationType, 'POST_VERIFICATION');
});

test('createSimOffer persists the onboarding fields (round-trips through getSimOffers)', () => {
  const db = freshDb();

  model.createSimOffer(db, {
    type: 'ESIM',
    name: 'eSIM Instant',
    price: 0,
    requiresVerification: true,
    activationType: 'POST_VERIFICATION',
  });

  const [offer] = model.getSimOffers(db);
  assert.equal(offer.type, 'ESIM');
  assert.equal(offer.name, 'eSIM Instant');
  assert.equal(offer.price, 0);
  assert.equal(offer.activationType, 'POST_VERIFICATION');
  // requiresVerification is a boolean/flag view of the stored 0/1 column.
  assert.ok(
    offer.requiresVerification === true || offer.requiresVerification === 1,
    'the persisted requiresVerification flag should round-trip as truthy',
  );
});

test('createSimOffer supports an eSIM offer with immediate activation and no verification', () => {
  const db = freshDb();

  const offer = model.createSimOffer(db, {
    type: 'ESIM',
    name: 'Tourist eSIM',
    price: 199,
    requiresVerification: false,
    activationType: 'IMMEDIATE',
  });

  assert.equal(offer.type, 'ESIM');
  assert.equal(offer.activationType, 'IMMEDIATE');
  assert.ok(
    offer.requiresVerification === false || offer.requiresVerification === 0,
    'requiresVerification should round-trip as falsy',
  );
});

test('createSimOffer defaults price to 0 when it is not supplied', () => {
  const db = freshDb();

  const offer = model.createSimOffer(db, {
    type: 'SIM',
    name: 'Free SIM',
    requiresVerification: true,
    activationType: 'POST_VERIFICATION',
  });

  assert.equal(offer.price, 0);
});

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

test('getSimOffers returns an empty list on a fresh database', () => {
  const db = freshDb();
  assert.deepEqual(model.getSimOffers(db), []);
});

test('getSimOffers returns the created offers in id order', () => {
  const db = freshDb();

  model.createSimOffer(db, {
    type: 'SIM',
    name: 'Physical SIM',
    price: 50,
    requiresVerification: true,
    activationType: 'POST_VERIFICATION',
  });
  model.createSimOffer(db, {
    type: 'ESIM',
    name: 'eSIM',
    price: 0,
    requiresVerification: false,
    activationType: 'IMMEDIATE',
  });

  const offers = model.getSimOffers(db);
  assert.equal(offers.length, 2);
  assert.deepEqual(
    offers.map((o) => o.name),
    ['Physical SIM', 'eSIM'],
  );
  assert.deepEqual(
    offers.map((o) => o.type),
    ['SIM', 'ESIM'],
  );
});

// ---------------------------------------------------------------------------
// Enum validation
// ---------------------------------------------------------------------------

test('createSimOffer rejects an unknown type', () => {
  const db = freshDb();
  assert.throws(
    () =>
      model.createSimOffer(db, {
        type: 'MICRO_SIM',
        name: 'Nope',
        price: 10,
        requiresVerification: true,
        activationType: 'POST_VERIFICATION',
      }),
    'an unknown SIM type must be rejected',
  );
});

test('createSimOffer rejects an unknown activationType', () => {
  const db = freshDb();
  assert.throws(
    () =>
      model.createSimOffer(db, {
        type: 'SIM',
        name: 'Bad activation',
        price: 10,
        requiresVerification: true,
        activationType: 'SOMEDAY',
      }),
    'an unknown activationType must be rejected',
  );
});

// ---------------------------------------------------------------------------
// Other validation (mirrors makeCreator: name required, price non-negative)
// ---------------------------------------------------------------------------

test('createSimOffer throws when name is missing or blank', () => {
  const db = freshDb();
  assert.throws(() =>
    model.createSimOffer(db, {
      type: 'SIM',
      price: 10,
      requiresVerification: true,
      activationType: 'POST_VERIFICATION',
    }),
  );
  assert.throws(() =>
    model.createSimOffer(db, {
      type: 'SIM',
      name: '   ',
      price: 10,
      requiresVerification: true,
      activationType: 'POST_VERIFICATION',
    }),
  );
});

test('createSimOffer throws when price is negative', () => {
  const db = freshDb();
  assert.throws(() =>
    model.createSimOffer(db, {
      type: 'SIM',
      name: 'Negative SIM',
      price: -1,
      requiresVerification: true,
      activationType: 'POST_VERIFICATION',
    }),
  );
});

test('createSimOffer throws when price is not a number', () => {
  const db = freshDb();
  assert.throws(() =>
    model.createSimOffer(db, {
      type: 'SIM',
      name: 'Stringy price',
      price: '50',
      requiresVerification: true,
      activationType: 'POST_VERIFICATION',
    }),
  );
});
