'use strict';

// Acceptance tests (integration): cart pricing recalculation end-to-end against
// a realistic, seeded catalog.
//
// This drives the full attach/detach flow through the public model API — create
// the database, seed the sample catalog, discover the device's REQUIRED and
// OPTIONAL attachments, then attach/detach optional add-ons and assert the
// recomputed itemized breakdown and total stay transparent and consistent.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function seededDb() {
  const db = model.createDatabase(':memory:');
  model.seed(db);
  return db;
}

function sumPrices(lines) {
  return lines.reduce((total, line) => total + line.price, 0);
}

// Locate a seeded device that has both a REQUIRED and an OPTIONAL attachment so
// the required-always-included and optional-selectable behaviours can both be
// exercised. The seed guarantees such a device exists.
function pickDeviceWithMixedAttachments(db) {
  for (const device of model.getDevices(db)) {
    const attachments = model.getAttachmentsForDevice(db, device.id);
    const hasRequired = attachments.some((a) => a.requirement === model.REQUIREMENT.REQUIRED);
    const hasOptional = attachments.some((a) => a.requirement === model.REQUIREMENT.OPTIONAL);
    if (hasRequired && hasOptional) {
      const planId = attachments.find((a) => a.planId != null)?.planId ?? null;
      return { device, attachments, planId };
    }
  }
  throw new Error('seed did not provide a device with both required and optional attachments');
}

test('pricing a seeded cart includes every required attachment before any optional selection', () => {
  const db = seededDb();
  const { device, attachments, planId } = pickDeviceWithMixedAttachments(db);

  const requiredAttachments = attachments.filter(
    (a) => a.requirement === model.REQUIREMENT.REQUIRED,
  );

  const cart = model.recalculateCart(db, {
    deviceId: device.id,
    planId,
    selectedOptionalAttachmentIds: [],
  });

  assert.equal(
    cart.requiredAttachments.length,
    requiredAttachments.length,
    'every seeded REQUIRED attachment must be present with no optional selection',
  );

  const expectedRequiredIds = new Set(requiredAttachments.map((a) => a.id));
  const actualRequiredIds = new Set(cart.requiredAttachments.map((a) => a.attachmentId));
  assert.deepEqual(actualRequiredIds, expectedRequiredIds, 'required attachment ids must match');

  const base = model.getDevices(db).find((d) => d.id === device.id).price +
    (planId != null ? model.getPlans(db).find((p) => p.id === planId).price : 0);

  assert.equal(
    cart.total,
    base + sumPrices(requiredAttachments),
    'baseline total is base + all required attachments',
  );
});

test('attaching then detaching an optional add-on returns to the baseline total', () => {
  const db = seededDb();
  const { device, attachments, planId } = pickDeviceWithMixedAttachments(db);

  const optional = attachments.find((a) => a.requirement === model.REQUIREMENT.OPTIONAL);
  assert.ok(optional, 'expected at least one optional attachment on the chosen device');

  const baseline = model.recalculateCart(db, {
    deviceId: device.id,
    planId,
    selectedOptionalAttachmentIds: [],
  });

  // Attach (select) the optional add-on.
  const withAddon = model.recalculateCart(db, {
    deviceId: device.id,
    planId,
    selectedOptionalAttachmentIds: [optional.id],
  });

  assert.equal(
    withAddon.total,
    baseline.total + optional.price,
    'attaching the optional add-on raises the total by exactly its price',
  );
  assert.ok(
    withAddon.optionalAttachments.some((a) => a.attachmentId === optional.id),
    'the attached optional add-on appears in the breakdown',
  );

  // Detach (deselect) it again.
  const afterDetach = model.recalculateCart(db, {
    deviceId: device.id,
    planId,
    selectedOptionalAttachmentIds: [],
  });

  assert.equal(
    afterDetach.total,
    baseline.total,
    'detaching the optional add-on returns to the baseline total',
  );
  assert.ok(
    afterDetach.optionalAttachments.every((a) => a.attachmentId !== optional.id),
    'the detached optional add-on no longer appears in the breakdown',
  );
});

test('the recomputed total is always the sum of its itemized parts across selection changes', () => {
  const db = seededDb();
  const { device, attachments, planId } = pickDeviceWithMixedAttachments(db);

  const optionalIds = attachments
    .filter((a) => a.requirement === model.REQUIREMENT.OPTIONAL)
    .map((a) => a.id);

  // Exercise several selection states: none, first only, all optionals.
  const selections = [[], optionalIds.slice(0, 1), optionalIds];

  for (const selectedOptionalAttachmentIds of selections) {
    const cart = model.recalculateCart(db, {
      deviceId: device.id,
      planId,
      selectedOptionalAttachmentIds,
    });

    const itemized =
      cart.base.subtotal +
      sumPrices(cart.requiredAttachments) +
      sumPrices(cart.optionalAttachments);

    assert.equal(
      cart.total,
      itemized,
      'total must equal base + required + selected optional for every selection state',
    );

    // Selected optional count reflects the request (deduped, ignoring anything
    // that is not actually an optional attachment for this device).
    const validSelected = new Set(
      selectedOptionalAttachmentIds.filter((id) => optionalIds.includes(id)),
    );
    assert.equal(
      cart.optionalAttachments.length,
      validSelected.size,
      'the breakdown lists exactly the selected optional add-ons',
    );
  }
});

test('a selection referencing an optional add-on from another device is ignored', () => {
  const db = seededDb();

  const devices = model.getDevices(db);
  assert.ok(devices.length >= 2, 'this scenario needs at least two seeded devices');

  const primary = pickDeviceWithMixedAttachments(db);

  // Find an optional attachment belonging to a DIFFERENT device.
  let foreignOptional = null;
  for (const device of devices) {
    if (device.id === primary.device.id) continue;
    const optional = model
      .getAttachmentsForDevice(db, device.id)
      .find((a) => a.requirement === model.REQUIREMENT.OPTIONAL);
    if (optional) {
      foreignOptional = optional;
      break;
    }
  }
  assert.ok(foreignOptional, 'expected an optional attachment on another seeded device');

  const baseline = model.recalculateCart(db, {
    deviceId: primary.device.id,
    planId: primary.planId,
    selectedOptionalAttachmentIds: [],
  });

  const withForeign = model.recalculateCart(db, {
    deviceId: primary.device.id,
    planId: primary.planId,
    selectedOptionalAttachmentIds: [foreignOptional.id],
  });

  assert.equal(
    withForeign.total,
    baseline.total,
    "another device's optional add-on must not affect this cart's total",
  );
  assert.ok(
    withForeign.optionalAttachments.every((a) => a.attachmentId !== foreignOptional.id),
    "another device's optional add-on must not leak into this cart's breakdown",
  );
});
