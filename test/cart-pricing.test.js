'use strict';

// Acceptance tests (unit): the cart pricing RECALCULATION service.
//
// When add-ons are attached/detached to a cart the backend recomputes the cart
// totals and returns an itemized breakdown so the total is fully transparent:
//
//   - the base (device + plan) subtotal,
//   - the REQUIRED attachments (always included, regardless of selection),
//   - the SELECTED optional attachments, and
//   - the grand total.
//
// The service is expected to be exposed from the data-model API as
//
//   model.recalculateCart(db, { deviceId, planId, selectedOptionalAttachmentIds })
//
// and to return an object shaped like:
//
//   {
//     deviceId,
//     planId,                       // echoed (null when no plan in the cart)
//     base: {
//       device: { id, name, price },
//       plan:   { id, name, price } | null,
//       subtotal,                   // device.price + (plan ? plan.price : 0)
//     },
//     requiredAttachments: [ { attachmentId, kind, id, name, price, requirement }, ... ],
//     optionalAttachments: [ { attachmentId, kind, id, name, price, requirement }, ... ],
//     total,                        // subtotal + sum(required) + sum(selected optional)
//   }
//
// Optional add-ons are selected by their ATTACHMENT id (the id returned by
// model.attach). These tests are written BEFORE the service exists and must
// fail until it is implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

function freshDb() {
  return model.createDatabase(':memory:');
}

function sumPrices(lines) {
  return lines.reduce((total, line) => total + line.price, 0);
}

// Build a representative cart fixture: a device + plan, one REQUIRED accessory
// (always in the cart) and two OPTIONAL add-ons (selectable).
function fixture() {
  const db = freshDb();

  const device = model.createDevice(db, { name: 'Phone X', price: 800 });
  const plan = model.createPlan(db, { name: 'Unlimited 5G', price: 50 });

  const requiredCharger = model.createAccessory(db, { name: 'Fast Charger', price: 30 });
  const optionalStreaming = model.createBundle(db, { name: 'Streaming Pack', price: 15 });
  const optionalEarbuds = model.createAccessory(db, { name: 'Wireless Earbuds', price: 100 });

  const requiredAttachment = model.attach(db, {
    deviceId: device.id,
    planId: plan.id,
    accessoryId: requiredCharger.id,
    requirement: model.REQUIREMENT.REQUIRED,
  });
  const streamingAttachment = model.attach(db, {
    deviceId: device.id,
    planId: plan.id,
    bundleId: optionalStreaming.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });
  const earbudsAttachment = model.attach(db, {
    deviceId: device.id,
    planId: plan.id,
    accessoryId: optionalEarbuds.id,
    requirement: model.REQUIREMENT.OPTIONAL,
  });

  return {
    db,
    device,
    plan,
    requiredCharger,
    optionalStreaming,
    optionalEarbuds,
    requiredAttachment,
    streamingAttachment,
    earbudsAttachment,
  };
}

// ---------------------------------------------------------------------------
// Shape / contract
// ---------------------------------------------------------------------------

test('recalculateCart exposes a callable service on the model API', () => {
  assert.equal(
    typeof model.recalculateCart,
    'function',
    'expected model.recalculateCart to be a function',
  );
});

test('the base breakdown is the device + plan subtotal', () => {
  const f = fixture();

  const cart = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [],
  });

  assert.equal(cart.deviceId, f.device.id, 'cart should echo the device it was priced for');
  assert.ok(cart.base && typeof cart.base === 'object', 'cart must expose a base breakdown');

  assert.equal(cart.base.device.id, f.device.id, 'base should carry the device');
  assert.equal(cart.base.device.price, 800, 'base should carry the current device price');
  assert.ok(cart.base.plan, 'a plan in the cart should appear in the base breakdown');
  assert.equal(cart.base.plan.id, f.plan.id, 'base should carry the plan');
  assert.equal(cart.base.plan.price, 50, 'base should carry the current plan price');
  assert.equal(cart.base.subtotal, 850, 'base subtotal must be device.price + plan.price');
});

test('a cart without a plan has a null plan and a device-only subtotal', () => {
  const f = fixture();

  const cart = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    selectedOptionalAttachmentIds: [],
  });

  assert.equal(cart.base.plan, null, 'a cart without a plan must report a null plan');
  assert.equal(cart.base.subtotal, 800, 'a plan-less cart subtotal is just the device price');
});

// ---------------------------------------------------------------------------
// Required attachments are ALWAYS included
// ---------------------------------------------------------------------------

test('required attachments are always included in the cart, even when nothing optional is selected', () => {
  const f = fixture();

  const cart = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [],
  });

  assert.ok(Array.isArray(cart.requiredAttachments), 'cart must expose requiredAttachments');
  assert.equal(cart.requiredAttachments.length, 1, 'expected the one required attachment');
  assert.equal(
    cart.requiredAttachments[0].attachmentId,
    f.requiredAttachment.id,
    'the required charger attachment should be present',
  );
  assert.ok(
    cart.requiredAttachments.every((a) => a.requirement === model.REQUIREMENT.REQUIRED),
    'every entry under requiredAttachments must be flagged REQUIRED',
  );

  // Nothing optional selected, so the total is base + required only.
  assert.deepEqual(cart.optionalAttachments, [], 'no optional add-ons should be selected');
  assert.equal(cart.total, 880, 'total must include the required attachment: 850 + 30');
});

test('required attachments cannot be dropped from the total via the selection list', () => {
  const f = fixture();

  // Passing a REQUIRED attachment id in the optional selection must not double
  // count it, and must not be needed to keep it in the cart.
  const cart = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [f.requiredAttachment.id],
  });

  assert.equal(cart.requiredAttachments.length, 1, 'required attachment still counted exactly once');
  assert.equal(cart.total, 880, 'a required attachment must not be double-counted');
});

// ---------------------------------------------------------------------------
// Adding / removing an optional add-on updates the total
// ---------------------------------------------------------------------------

test('adding an optional add-on returns an updated (higher) total', () => {
  const f = fixture();

  const before = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [],
  });

  const after = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [f.streamingAttachment.id],
  });

  assert.equal(after.optionalAttachments.length, 1, 'the selected optional add-on should appear');
  assert.equal(
    after.optionalAttachments[0].attachmentId,
    f.streamingAttachment.id,
    'the selected streaming add-on should be the one listed',
  );
  assert.equal(
    after.total - before.total,
    15,
    'adding the streaming add-on must raise the total by exactly its price',
  );
  assert.equal(after.total, 895, 'total after adding streaming: 880 + 15');
});

test('removing a previously selected optional add-on returns an updated (lower) total', () => {
  const f = fixture();

  const withOptional = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [f.streamingAttachment.id, f.earbudsAttachment.id],
  });
  assert.equal(withOptional.total, 995, 'total with both optionals: 880 + 15 + 100');

  // Detach the earbuds (deselect it) and recompute.
  const afterRemoval = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [f.streamingAttachment.id],
  });

  assert.equal(
    withOptional.total - afterRemoval.total,
    100,
    'removing the earbuds must lower the total by exactly its price',
  );
  assert.equal(afterRemoval.total, 895, 'total after removing earbuds: 880 + 15');
  assert.ok(
    afterRemoval.optionalAttachments.every((a) => a.attachmentId !== f.earbudsAttachment.id),
    'the removed optional add-on must no longer appear in the breakdown',
  );
});

test('unselected optional add-ons are excluded from the total and the breakdown', () => {
  const f = fixture();

  const cart = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [f.streamingAttachment.id],
  });

  assert.ok(
    cart.optionalAttachments.every((a) => a.attachmentId !== f.earbudsAttachment.id),
    'an optional add-on that was not selected must not be included',
  );
  assert.equal(cart.total, 895, 'the unselected earbuds must not contribute to the total');
});

// ---------------------------------------------------------------------------
// Total transparency: the total is exactly the sum of its itemized parts
// ---------------------------------------------------------------------------

test('the total equals the sum of the itemized breakdown (total transparency)', () => {
  const f = fixture();

  const cart = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [f.streamingAttachment.id, f.earbudsAttachment.id],
  });

  const expected =
    cart.base.subtotal + sumPrices(cart.requiredAttachments) + sumPrices(cart.optionalAttachments);

  assert.equal(
    cart.total,
    expected,
    'total must equal base subtotal + required attachments + selected optional attachments',
  );
});

test('every attachment line item is itemized with attachmentId, kind, id, name, price and requirement', () => {
  const f = fixture();

  const cart = model.recalculateCart(f.db, {
    deviceId: f.device.id,
    planId: f.plan.id,
    selectedOptionalAttachmentIds: [f.streamingAttachment.id],
  });

  const lines = [...cart.requiredAttachments, ...cart.optionalAttachments];
  assert.ok(lines.length >= 2, 'expected at least the required + one selected optional line');

  for (const line of lines) {
    assert.equal(typeof line.attachmentId, 'number', 'each line references its attachment id');
    assert.ok(
      ['bundle', 'accessory'].includes(line.kind),
      'each line declares its kind (bundle/accessory)',
    );
    assert.equal(typeof line.name, 'string', 'each line exposes a name');
    assert.ok(line.name.length > 0, 'line name must not be empty');
    assert.equal(typeof line.price, 'number', 'each line exposes a numeric price');
    assert.ok(
      line.requirement === model.REQUIREMENT.REQUIRED ||
        line.requirement === model.REQUIREMENT.OPTIONAL,
      'each line is flagged REQUIRED or OPTIONAL',
    );
  }
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test('recalculateCart requires a device id', () => {
  const db = freshDb();
  assert.throws(
    () => model.recalculateCart(db, { selectedOptionalAttachmentIds: [] }),
    /device/i,
    'pricing a cart without a deviceId must be rejected',
  );
});
