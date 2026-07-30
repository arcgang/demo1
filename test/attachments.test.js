'use strict';

// Acceptance tests: the core value of the schema — querying the attachable
// bundles/accessories for a device with a required/optional flag, and the
// required-vs-optional constraint validation.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

test('can query attachable add-ons for a device, each carrying a requirement flag and price', () => {
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

  const attachments = model.getAttachmentsForDevice(db, device.id);
  assert.equal(attachments.length, 2, 'expected two attachments for the device');

  for (const a of attachments) {
    assert.ok(
      a.requirement === model.REQUIREMENT.REQUIRED || a.requirement === model.REQUIREMENT.OPTIONAL,
      'each attachment must carry a REQUIRED/OPTIONAL flag',
    );
    assert.equal(typeof a.price, 'number', 'each attachable add-on exposes a price');
  }

  const required = attachments.filter((a) => a.requirement === model.REQUIREMENT.REQUIRED);
  const optional = attachments.filter((a) => a.requirement === model.REQUIREMENT.OPTIONAL);
  assert.equal(required.length, 1, 'exactly one REQUIRED attachment');
  assert.equal(optional.length, 1, 'exactly one OPTIONAL attachment');
});

test('attachments can be scoped to a device/plan pairing', () => {
  const db = freshDb();

  const device = model.createDevice(db, { name: 'Phone Y', price: 999 });
  const plan = model.createPlan(db, { name: 'Unlimited', price: 60 });
  const bundle = model.createBundle(db, { name: 'Streaming Bundle', price: 15 });

  model.attach(db, {
    deviceId: device.id,
    planId: plan.id,
    bundleId: bundle.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });

  const all = model.getAttachmentsForDevice(db, device.id);
  assert.equal(all.length, 1);
  assert.equal(all[0].planId, plan.id, 'attachment should record the plan it is scoped to');

  const forPlan = model.getAttachmentsForDevicePlan(db, device.id, plan.id);
  assert.equal(forPlan.length, 1, 'expected the plan-scoped attachment');
  assert.equal(forPlan[0].requirement, model.REQUIREMENT.REQUIRED);
});

test('required-vs-optional constraint: rejects an invalid requirement value', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone Z', price: 599 });
  const accessory = model.createAccessory(db, { name: 'Case', price: 19 });

  assert.throws(
    () =>
      model.attach(db, {
        deviceId: device.id,
        accessoryId: accessory.id,
        requirement: 'MAYBE',
      }),
    /requirement/i,
    'attaching with an invalid requirement must be rejected',
  );
});

test('required-vs-optional constraint: requirement is mandatory', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone Q', price: 499 });
  const accessory = model.createAccessory(db, { name: 'Screen Protector', price: 9 });

  assert.throws(
    () =>
      model.attach(db, {
        deviceId: device.id,
        accessoryId: accessory.id,
      }),
    /requirement/i,
    'attaching without a requirement must be rejected',
  );
});

test('an attachment must reference at least one add-on (a bundle or an accessory)', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone R', price: 399 });

  assert.throws(
    () =>
      model.attach(db, {
        deviceId: device.id,
        requirement: model.REQUIREMENT.OPTIONAL,
      }),
    /(bundle|accessory|add-?on)/i,
    'an attachment with neither a bundle nor an accessory must be rejected',
  );
});

test('helper: filtering attachable add-ons by requirement', () => {
  const db = freshDb();
  const device = model.createDevice(db, { name: 'Phone S', price: 699 });
  const req = model.createAccessory(db, { name: 'SIM', price: 5 });
  const opt = model.createBundle(db, { name: 'Music', price: 8 });

  model.attach(db, { deviceId: device.id, accessoryId: req.id, requirement: model.REQUIREMENT.REQUIRED });
  model.attach(db, { deviceId: device.id, bundleId: opt.id, requirement: model.REQUIREMENT.OPTIONAL });

  const requiredOnly = model.getAttachmentsForDevice(db, device.id, {
    requirement: model.REQUIREMENT.REQUIRED,
  });
  assert.equal(requiredOnly.length, 1, 'expected only the REQUIRED add-on');
  assert.equal(requiredOnly[0].requirement, model.REQUIREMENT.REQUIRED);
});
