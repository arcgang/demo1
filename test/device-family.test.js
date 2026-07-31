'use strict';

// Acceptance tests (model API): device-family attribute plus accessory
// compatibility mapping. Devices carry a `family`; accessories are recorded as
// compatible with a device family (and/or a specific device). Helpers let the
// application record compatibility and query the accessories compatible with a
// given device or family, returning a compatibility cue per family.
//
// Written BEFORE implementation: these must fail until the helpers exist.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

test('devices can be created with a family attribute that is returned on read', () => {
  const db = freshDb();

  const phone = model.createDevice(db, {
    name: 'Aurora Phone 12',
    price: 899,
    family: 'AURORA',
  });
  assert.equal(phone.family, 'AURORA', 'createDevice should return the family it stored');

  const [stored] = model.getDevices(db);
  assert.equal(stored.family, 'AURORA', 'getDevices should expose the family attribute');
});

test('recordAccessoryCompatibility maps an accessory to a device family', () => {
  const db = freshDb();

  const accessory = model.createAccessory(db, { name: 'Aurora Fast Charger', price: 29 });
  const link = model.recordAccessoryCompatibility(db, {
    accessoryId: accessory.id,
    family: 'AURORA',
  });

  assert.ok(link, 'recordAccessoryCompatibility should return the recorded mapping');
  assert.equal(link.accessoryId, accessory.id);
  assert.equal(link.family, 'AURORA');
});

test('compatible case: query returns accessories mapped to the device family', () => {
  const db = freshDb();

  const phone = model.createDevice(db, { name: 'Aurora Phone 12', price: 899, family: 'AURORA' });
  const charger = model.createAccessory(db, { name: 'Aurora Fast Charger', price: 29 });

  model.recordAccessoryCompatibility(db, { accessoryId: charger.id, family: 'AURORA' });

  const compatible = model.getCompatibleAccessories(db, phone.id);
  assert.equal(compatible.length, 1, 'the AURORA charger should be compatible with the AURORA phone');
  assert.equal(compatible[0].id, charger.id);
  assert.equal(compatible[0].name, 'Aurora Fast Charger');
  assert.equal(compatible[0].price, 29, 'compatible accessory carries its catalog price');
  assert.equal(compatible[0].family, 'AURORA', 'result carries the compatibility cue (family)');
});

test('incompatible case: an accessory bound to another family is not returned', () => {
  const db = freshDb();

  const phone = model.createDevice(db, { name: 'Aurora Phone 12', price: 899, family: 'AURORA' });
  const otherCharger = model.createAccessory(db, { name: 'Nova Charger', price: 25 });

  // Charger is compatible with the NOVA family, not AURORA.
  model.recordAccessoryCompatibility(db, { accessoryId: otherCharger.id, family: 'NOVA' });

  const compatible = model.getCompatibleAccessories(db, phone.id);
  assert.deepEqual(compatible, [], 'a NOVA accessory must not be compatible with an AURORA device');
});

test('accessories compatible with a family can be queried by family directly', () => {
  const db = freshDb();

  const auroraPhone = model.createDevice(db, { name: 'Aurora Phone 12', price: 899, family: 'AURORA' });
  const auroraTab = model.createDevice(db, { name: 'Aurora Tab S', price: 649, family: 'AURORA' });
  const novaPhone = model.createDevice(db, { name: 'Nova One', price: 500, family: 'NOVA' });

  const charger = model.createAccessory(db, { name: 'Aurora Fast Charger', price: 29 });
  model.recordAccessoryCompatibility(db, { accessoryId: charger.id, family: 'AURORA' });

  // Compatible with every AURORA device regardless of which one we ask about.
  assert.equal(model.getCompatibleAccessoriesForFamily(db, 'AURORA').length, 1);
  assert.equal(model.getCompatibleAccessories(db, auroraPhone.id).length, 1);
  assert.equal(model.getCompatibleAccessories(db, auroraTab.id).length, 1);

  // Not compatible with a device from a different family.
  assert.deepEqual(model.getCompatibleAccessories(db, novaPhone.id), []);
  assert.deepEqual(model.getCompatibleAccessoriesForFamily(db, 'NOVA'), []);
});
