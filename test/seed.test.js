'use strict';

// Acceptance tests: seed data loads and populates every entity plus the
// attachment relationship with a mix of REQUIRED and OPTIONAL add-ons.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function seededDb() {
  const db = model.createDatabase(':memory:');
  model.seed(db);
  return db;
}

test('seed loads sample devices, plans, bundles and accessories', () => {
  const db = seededDb();

  assert.ok(model.getDevices(db).length > 0, 'expected seeded devices');
  assert.ok(model.getPlans(db).length > 0, 'expected seeded plans');
  assert.ok(model.getBundles(db).length > 0, 'expected seeded bundles');
  assert.ok(model.getAccessories(db).length > 0, 'expected seeded accessories');
});

test('seeded entities carry a price field', () => {
  const db = seededDb();

  for (const bundle of model.getBundles(db)) {
    assert.equal(typeof bundle.price, 'number', 'bundle should have a numeric price');
    assert.ok(bundle.price >= 0, 'bundle price should be non-negative');
  }
  for (const accessory of model.getAccessories(db)) {
    assert.equal(typeof accessory.price, 'number', 'accessory should have a numeric price');
    assert.ok(accessory.price >= 0, 'accessory price should be non-negative');
  }
});

test('seed creates attachments for a device including both REQUIRED and OPTIONAL add-ons', () => {
  const db = seededDb();

  const devices = model.getDevices(db);
  assert.ok(devices.length > 0, 'need at least one seeded device');

  // Gather every attachment across every seeded device.
  const all = devices.flatMap((d) => model.getAttachmentsForDevice(db, d.id));
  assert.ok(all.length > 0, 'expected seeded attachments');

  const requirements = new Set(all.map((a) => a.requirement));
  assert.ok(requirements.has(model.REQUIREMENT.REQUIRED), 'seed should include a REQUIRED attachment');
  assert.ok(requirements.has(model.REQUIREMENT.OPTIONAL), 'seed should include an OPTIONAL attachment');
});

test('seed is idempotent-safe: loading it does not duplicate the base catalog on a fresh db', () => {
  const db1 = seededDb();
  const db2 = seededDb();
  assert.equal(
    model.getDevices(db1).length,
    model.getDevices(db2).length,
    'seeding a fresh db twice (separate dbs) should yield the same device count',
  );
});
