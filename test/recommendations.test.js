'use strict';

// Acceptance tests: the recommendation engine SERVICE.
//
// Given a device id and customer context (an existing prepaid customer), the
// service returns the relevant plans, bundles and accessories for that device,
// each flagged with its attachment type (REQUIRED / OPTIONAL) and its current
// price, ranked so the REQUIRED items come first.
//
// The service is expected to be exposed from the data-model API as
// `model.recommend(db, { deviceId, customer })` and to return an object shaped
// like:
//
//   {
//     deviceId,
//     recommendations: [
//       { kind: 'plan' | 'bundle' | 'accessory', id, name, price, requirement },
//       ...
//     ],
//   }
//
// These tests are written BEFORE the service exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

// An existing prepaid customer context, reused across the scenarios.
const PREPAID_CUSTOMER = Object.freeze({ id: 1, type: 'prepaid', existing: true });

function freshDb() {
  return model.createDatabase(':memory:');
}

function recommendationsFor(result) {
  assert.ok(result && typeof result === 'object', 'recommend must return a result object');
  assert.ok(Array.isArray(result.recommendations), 'result.recommendations must be an array');
  return result.recommendations;
}

// ---------------------------------------------------------------------------
// Shape / contract
// ---------------------------------------------------------------------------

test('recommend exposes a callable service on the model API', () => {
  assert.equal(typeof model.recommend, 'function', 'expected model.recommend to be a function');
});

test('each recommendation carries kind, name, a numeric price and a REQUIRED/OPTIONAL flag', () => {
  const db = freshDb();

  const device = model.createDevice(db, { name: 'Phone X', price: 799 });
  const bundle = model.createBundle(db, { name: 'Insurance Bundle', price: 12 });
  const accessory = model.createAccessory(db, { name: 'Fast Charger', price: 29 });

  model.attach(db, {
    deviceId: device.id,
    bundleId: bundle.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });
  model.attach(db, {
    deviceId: device.id,
    accessoryId: accessory.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });

  const result = model.recommend(db, { deviceId: device.id, customer: PREPAID_CUSTOMER });
  assert.equal(result.deviceId, device.id, 'result should echo the device it was built for');

  const recs = recommendationsFor(result);
  assert.equal(recs.length, 2, 'expected a recommendation per relevant add-on');

  for (const rec of recs) {
    assert.ok(
      ['plan', 'bundle', 'accessory'].includes(rec.kind),
      'each recommendation must declare its kind (plan/bundle/accessory)',
    );
    assert.equal(typeof rec.name, 'string', 'each recommendation exposes a name');
    assert.ok(rec.name.length > 0, 'recommendation name must not be empty');
    assert.equal(typeof rec.price, 'number', 'each recommendation exposes a numeric price');
    assert.ok(
      rec.requirement === model.REQUIREMENT.REQUIRED ||
        rec.requirement === model.REQUIREMENT.OPTIONAL,
      'each recommendation must be flagged REQUIRED or OPTIONAL',
    );
  }
});

test('recommendations reflect the current catalog pricing of each add-on', () => {
  const db = freshDb();

  const device = model.createDevice(db, { name: 'Phone P', price: 699 });
  const accessory = model.createAccessory(db, { name: 'Wireless Earbuds', price: 99 });
  model.attach(db, {
    deviceId: device.id,
    accessoryId: accessory.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });

  const recs = recommendationsFor(
    model.recommend(db, { deviceId: device.id, customer: PREPAID_CUSTOMER }),
  );

  const earbuds = recs.find((r) => r.kind === 'accessory' && r.id === accessory.id);
  assert.ok(earbuds, 'expected the attached accessory among the recommendations');
  assert.equal(earbuds.price, 99, 'recommendation should carry the accessory current price');
});

// ---------------------------------------------------------------------------
// Result-set scenarios: empty, required-only, mixed
// ---------------------------------------------------------------------------

test('empty result: a device with no relevant add-ons yields no recommendations', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Bare Phone', price: 199 });

  const result = model.recommend(db, { deviceId: device.id, customer: PREPAID_CUSTOMER });
  assert.deepEqual(
    recommendationsFor(result),
    [],
    'a device with nothing attached should recommend nothing',
  );
});

test('required-only result: every recommendation is flagged REQUIRED', () => {
  const db = freshDb();

  const device = model.createDevice(db, { name: 'Phone R', price: 899 });
  const bundle = model.createBundle(db, { name: 'Device Protection', price: 12 });
  const accessory = model.createAccessory(db, { name: 'SIM Kit', price: 5 });

  model.attach(db, {
    deviceId: device.id,
    bundleId: bundle.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });
  model.attach(db, {
    deviceId: device.id,
    accessoryId: accessory.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });

  const recs = recommendationsFor(
    model.recommend(db, { deviceId: device.id, customer: PREPAID_CUSTOMER }),
  );

  assert.equal(recs.length, 2, 'expected both required add-ons');
  assert.ok(
    recs.every((r) => r.requirement === model.REQUIREMENT.REQUIRED),
    'every recommendation should be REQUIRED in a required-only scenario',
  );
});

test('mixed result: recommendations are ranked with REQUIRED ahead of OPTIONAL', () => {
  const db = freshDb();

  const device = model.createDevice(db, { name: 'Phone M', price: 999 });

  // Deliberately attach the OPTIONAL add-on first so a correct ranking cannot
  // simply mirror insertion order.
  const optionalBundle = model.createBundle(db, { name: 'Streaming Pack', price: 15 });
  const requiredAccessory = model.createAccessory(db, { name: 'Fast Charger', price: 29 });
  const optionalAccessory = model.createAccessory(db, { name: 'Protective Case', price: 24 });

  model.attach(db, {
    deviceId: device.id,
    bundleId: optionalBundle.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });
  model.attach(db, {
    deviceId: device.id,
    accessoryId: requiredAccessory.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });
  model.attach(db, {
    deviceId: device.id,
    accessoryId: optionalAccessory.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });

  const recs = recommendationsFor(
    model.recommend(db, { deviceId: device.id, customer: PREPAID_CUSTOMER }),
  );

  assert.equal(recs.length, 3, 'expected all three relevant add-ons');

  const requiredCount = recs.filter((r) => r.requirement === model.REQUIREMENT.REQUIRED).length;
  const optionalCount = recs.filter((r) => r.requirement === model.REQUIREMENT.OPTIONAL).length;
  assert.equal(requiredCount, 1, 'exactly one REQUIRED recommendation');
  assert.equal(optionalCount, 2, 'exactly two OPTIONAL recommendations');

  // Ranking: no OPTIONAL item may appear before a REQUIRED one.
  const firstOptional = recs.findIndex((r) => r.requirement === model.REQUIREMENT.OPTIONAL);
  const lastRequired = recs.map((r) => r.requirement).lastIndexOf(model.REQUIREMENT.REQUIRED);
  assert.ok(
    lastRequired < firstOptional,
    'all REQUIRED recommendations must be ranked ahead of OPTIONAL ones',
  );
});

// ---------------------------------------------------------------------------
// Relevance: plans, and scoping to the requested device
// ---------------------------------------------------------------------------

test('relevant plans for the device are included among the recommendations', () => {
  const db = freshDb();

  const device = model.createDevice(db, { name: 'Phone Plan', price: 899 });
  const plan = model.createPlan(db, { name: 'Unlimited 5G', price: 70 });
  const bundle = model.createBundle(db, { name: 'Device Protection', price: 12 });

  // A device/plan-scoped attachment makes the plan relevant to this device.
  model.attach(db, {
    deviceId: device.id,
    planId: plan.id,
    bundleId: bundle.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });

  const recs = recommendationsFor(
    model.recommend(db, { deviceId: device.id, customer: PREPAID_CUSTOMER }),
  );

  const planRec = recs.find((r) => r.kind === 'plan' && r.id === plan.id);
  assert.ok(planRec, 'the plan attached to the device should be recommended');
  assert.equal(planRec.name, plan.name, 'plan recommendation should carry the plan name');
  assert.equal(planRec.price, plan.price, 'plan recommendation should carry the current plan price');
  assert.ok(
    planRec.requirement === model.REQUIREMENT.REQUIRED ||
      planRec.requirement === model.REQUIREMENT.OPTIONAL,
    'plan recommendation must be flagged REQUIRED or OPTIONAL',
  );
});

test('recommendations are scoped to the requested device only', () => {
  const db = freshDb();

  const deviceA = model.createDevice(db, { name: 'Device A', price: 500 });
  const deviceB = model.createDevice(db, { name: 'Device B', price: 500 });
  const accA = model.createAccessory(db, { name: 'A-only Charger', price: 29 });
  const accB = model.createAccessory(db, { name: 'B-only Case', price: 19 });

  model.attach(db, {
    deviceId: deviceA.id,
    accessoryId: accA.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });
  model.attach(db, {
    deviceId: deviceB.id,
    accessoryId: accB.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });

  const recs = recommendationsFor(
    model.recommend(db, { deviceId: deviceA.id, customer: PREPAID_CUSTOMER }),
  );

  assert.ok(
    recs.every((r) => !(r.kind === 'accessory' && r.id === accB.id)),
    "device B's add-ons must not leak into device A's recommendations",
  );
  assert.ok(
    recs.some((r) => r.kind === 'accessory' && r.id === accA.id),
    "device A's own add-on should be recommended",
  );
});

// ---------------------------------------------------------------------------
// Input validation: a device id and customer context are both required
// ---------------------------------------------------------------------------

test('recommend requires a device id', () => {
  const db = freshDb();
  assert.throws(
    () => model.recommend(db, { customer: PREPAID_CUSTOMER }),
    /device/i,
    'calling recommend without a deviceId must be rejected',
  );
});

test('recommend requires a customer context', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone C', price: 399 });
  assert.throws(
    () => model.recommend(db, { deviceId: device.id }),
    /customer/i,
    'calling recommend without a customer context must be rejected',
  );
});
