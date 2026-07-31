'use strict';

// Acceptance tests: the SIM/eSIM offer model helpers.
//
// `src/index.js` exposes create/list model helpers for SIM/eSIM offers,
// following the same makeCreator/makeLister + shapeRow conventions as the rest
// of the catalog model. Each offer captures its type (SIM/ESIM), price,
// availability, and the onboarding-implication flags `requires_verification`
// (KYC/RICA) and `activation_required`:
//
//   createSimOffer(db, { name, type, price, availability,
//                        requiresVerification, activationRequired })
//     Persist a SIM/eSIM offer row and return the shaped offer.
//
//   getSimOffers(db)
//     List the persisted SIM/eSIM offers (ordered by id), each shaped with its
//     type, price, availability, and onboarding flags.
//
// Both helpers are re-exported from src/index.js module.exports.
//
// These tests are written BEFORE the helpers exist and must fail until they
// are implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

// A SIM offer requires KYC/RICA verification but no separate activation step.
const SIM_OFFER = {
  name: 'Prepaid SIM Starter',
  type: 'SIM',
  price: 25,
  availability: 'IN_STOCK',
  requiresVerification: true,
  activationRequired: false,
};

// An eSIM offer needs both verification and an activation step before use,
// exercising differing onboarding requirements from the physical SIM.
const ESIM_OFFER = {
  name: 'eSIM Digital Plan',
  type: 'ESIM',
  price: 0,
  availability: 'IN_STOCK',
  requiresVerification: true,
  activationRequired: true,
};

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

  const offer = model.createSimOffer(db, SIM_OFFER);

  assert.equal(typeof offer.id, 'number', 'offer carries a numeric id');
  assert.ok(offer.id > 0, 'offer id is a real row id');
  assert.equal(offer.name, SIM_OFFER.name);
  assert.equal(offer.type, 'SIM');
  assert.equal(offer.price, 25);
  assert.equal(offer.availability, 'IN_STOCK');
  assert.equal(Boolean(offer.requiresVerification), true);
  assert.equal(Boolean(offer.activationRequired), false);
});

test('createSimOffer defaults price to 0 when it is not supplied', () => {
  const db = freshDb();

  const offer = model.createSimOffer(db, {
    name: 'eSIM Free Trial',
    type: 'ESIM',
    availability: 'IN_STOCK',
    requiresVerification: true,
    activationRequired: true,
  });

  assert.equal(offer.price, 0);
});

// ---------------------------------------------------------------------------
// Listing (SIM and eSIM with differing onboarding requirements)
// ---------------------------------------------------------------------------

test('getSimOffers returns an empty list on a fresh database', () => {
  const db = freshDb();
  assert.deepEqual(model.getSimOffers(db), [], 'no offers exist on a fresh db');
});

test('SIM and eSIM offers persist and list with their onboarding flags', () => {
  const db = freshDb();

  model.createSimOffer(db, SIM_OFFER);
  model.createSimOffer(db, ESIM_OFFER);

  const offers = model.getSimOffers(db);
  assert.equal(offers.length, 2, 'both offers should be listed');

  const byType = {};
  for (const offer of offers) byType[offer.type] = offer;

  // The physical SIM: KYC/RICA required, no separate activation step.
  assert.ok(byType.SIM, 'the SIM offer should be listed');
  assert.equal(byType.SIM.name, SIM_OFFER.name);
  assert.equal(byType.SIM.price, 25);
  assert.equal(byType.SIM.availability, 'IN_STOCK');
  assert.equal(Boolean(byType.SIM.requiresVerification), true, 'SIM requires verification');
  assert.equal(Boolean(byType.SIM.activationRequired), false, 'SIM needs no activation step');

  // The eSIM: differing onboarding — both verification and activation needed.
  assert.ok(byType.ESIM, 'the eSIM offer should be listed');
  assert.equal(byType.ESIM.name, ESIM_OFFER.name);
  assert.equal(byType.ESIM.price, 0);
  assert.equal(Boolean(byType.ESIM.requiresVerification), true, 'eSIM requires verification');
  assert.equal(Boolean(byType.ESIM.activationRequired), true, 'eSIM requires activation');

  // The two offers genuinely differ in their onboarding requirements.
  assert.notEqual(
    Boolean(byType.SIM.activationRequired),
    Boolean(byType.ESIM.activationRequired),
    'SIM and eSIM should carry differing activation requirements',
  );
});

test('getSimOffers returns offers ordered by id', () => {
  const db = freshDb();

  const first = model.createSimOffer(db, SIM_OFFER);
  const second = model.createSimOffer(db, ESIM_OFFER);

  const ids = model.getSimOffers(db).map((o) => o.id);
  assert.deepEqual(ids, [first.id, second.id], 'offers should be listed in id order');
});

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

test('createSimOffer throws when no arguments are supplied', () => {
  const db = freshDb();
  assert.throws(() => model.createSimOffer(db));
});

test('createSimOffer throws when name is missing', () => {
  const db = freshDb();
  assert.throws(() =>
    model.createSimOffer(db, {
      type: 'SIM',
      price: 25,
      availability: 'IN_STOCK',
      requiresVerification: true,
      activationRequired: false,
    }),
  );
});

test('createSimOffer rejects a type outside the SIM/ESIM vocabulary', () => {
  const db = freshDb();
  assert.throws(() =>
    model.createSimOffer(db, {
      name: 'Bad Offer',
      type: 'NOT_A_SIM_TYPE',
      price: 10,
      availability: 'IN_STOCK',
      requiresVerification: false,
      activationRequired: false,
    }),
  );
});

test('createSimOffer throws when price is negative', () => {
  const db = freshDb();
  assert.throws(() =>
    model.createSimOffer(db, {
      name: 'Negative Offer',
      type: 'SIM',
      price: -1,
      availability: 'IN_STOCK',
      requiresVerification: false,
      activationRequired: false,
    }),
  );
});
