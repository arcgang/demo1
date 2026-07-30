'use strict';

const { REQUIREMENT } = require('./requirement.js');

// Load a small but representative sample catalog: a couple of devices and
// plans, a set of bundles and accessories, and a mix of REQUIRED and OPTIONAL
// attachments so the required-vs-optional relationship is exercised end to end.
//
// The model API is required lazily to avoid a circular dependency with
// `index.js` (which re-exports `seed`).
function seed(db) {
  const model = require('./index.js');

  // Devices
  const phone = model.createDevice(db, { name: 'Aurora Phone 12', price: 899 });
  const tablet = model.createDevice(db, { name: 'Aurora Tab S', price: 649 });

  // Plans
  const unlimited = model.createPlan(db, { name: 'Unlimited 5G', price: 70 });
  const basic = model.createPlan(db, { name: 'Basic Talk & Text', price: 30 });

  // Bundles
  const insurance = model.createBundle(db, { name: 'Device Protection', price: 12 });
  const streaming = model.createBundle(db, { name: 'Streaming Pack', price: 15 });

  // Accessories
  const charger = model.createAccessory(db, { name: 'Fast Charger', price: 29 });
  const caseAcc = model.createAccessory(db, { name: 'Protective Case', price: 24 });
  const earbuds = model.createAccessory(db, { name: 'Wireless Earbuds', price: 99 });

  // Attachments — a mix of REQUIRED and OPTIONAL across devices and plans.
  // Phone on the unlimited plan requires protection, everything else optional.
  model.attach(db, {
    deviceId: phone.id,
    planId: unlimited.id,
    bundleId: insurance.id,
    requirement: REQUIREMENT.REQUIRED,
  });
  model.attach(db, {
    deviceId: phone.id,
    planId: unlimited.id,
    bundleId: streaming.id,
    requirement: REQUIREMENT.OPTIONAL,
  });
  model.attach(db, {
    deviceId: phone.id,
    accessoryId: charger.id,
    requirement: REQUIREMENT.REQUIRED,
  });
  model.attach(db, {
    deviceId: phone.id,
    accessoryId: earbuds.id,
    requirement: REQUIREMENT.OPTIONAL,
  });

  // Tablet on the basic plan: an optional case only.
  model.attach(db, {
    deviceId: tablet.id,
    planId: basic.id,
    accessoryId: caseAcc.id,
    requirement: REQUIREMENT.OPTIONAL,
  });
}

module.exports = { seed };
