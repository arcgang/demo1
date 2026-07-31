'use strict';

const { REQUIREMENT } = require('./requirement.js');
const { AppError } = require('./app-error.js');
const { REASON_CODE, STATE_PRESERVATION } = require('./reason-codes.js');

// Cart recalculation touches no persisted state, so a failure never throws away
// the in-progress cart: it is always reported PRESERVED.
const CART_PRESERVED = { cart: STATE_PRESERVATION.PRESERVED };

// Turn a shaped attachment row into a cart line item. A line carries both the
// attachment id (what the caller selects add-ons by) and the underlying add-on
// identity, so the itemized breakdown is fully self-describing.
function toLineItem(attachment) {
  return {
    attachmentId: attachment.id,
    kind: attachment.kind,
    id: attachment.kind === 'bundle' ? attachment.bundleId : attachment.accessoryId,
    name: attachment.name,
    price: attachment.price,
    requirement: attachment.requirement,
  };
}

function sumPrices(lines) {
  return lines.reduce((total, line) => total + line.price, 0);
}

// The cart pricing recalculation service.
//
// Recompute a cart's totals whenever add-ons are attached or detached. Given a
// device (optionally paired with a plan) and the set of currently selected
// OPTIONAL attachments, return an itemized breakdown so the total is fully
// transparent:
//
//   - `base`: the device + plan subtotal,
//   - `requiredAttachments`: every REQUIRED attachment for the device, always
//     included regardless of what is selected,
//   - `optionalAttachments`: the OPTIONAL attachments the caller selected, and
//   - `total`: base subtotal + required + selected optional.
//
// Optional add-ons are selected by their ATTACHMENT id. Ids that are not
// OPTIONAL attachments of this device (unknown, required, or belonging to
// another device) are ignored, and duplicate selections are counted once.
//
// The model API and its attachment query helpers are required lazily to avoid a
// circular dependency with `index.js` (which re-exports `recalculateCart`).
function recalculateCart(db, { deviceId, planId, selectedOptionalAttachmentIds = [] } = {}) {
  if (deviceId === undefined || deviceId === null) {
    throw new AppError(REASON_CODE.MISSING_OR_INVALID_DEVICE_ID, {
      userMessage: 'deviceId is required to price a cart',
      statePreservation: CART_PRESERVED,
    });
  }

  const model = require('./index.js');

  const device = db.prepare('SELECT id, name, price FROM devices WHERE id = ?').get(deviceId);
  if (!device) {
    throw new AppError(REASON_CODE.UNKNOWN_DEVICE, {
      userMessage: `no device found for id ${deviceId}`,
      statePreservation: CART_PRESERVED,
    });
  }

  let plan = null;
  if (planId !== undefined && planId !== null) {
    plan = db.prepare('SELECT id, name, price FROM plans WHERE id = ?').get(planId) ?? null;
  }

  const subtotal = device.price + (plan ? plan.price : 0);
  const base = { device, plan, subtotal };

  // Every attachment for this device, already shaped with its requirement flag
  // and current catalog price. Required attachments are always included; the
  // caller's plan choice never drops a required add-on from the cart.
  const attachments = model.getAttachmentsForDevice(db, deviceId);

  const requiredAttachments = attachments
    .filter((a) => a.requirement === REQUIREMENT.REQUIRED)
    .map(toLineItem);

  // Only genuine OPTIONAL attachments of this device may be selected. Dedupe the
  // request so a repeated selection is never counted twice.
  const selectableOptionalIds = new Set(
    attachments.filter((a) => a.requirement === REQUIREMENT.OPTIONAL).map((a) => a.id),
  );
  const selectedIds = new Set(
    (selectedOptionalAttachmentIds ?? []).filter((id) => selectableOptionalIds.has(id)),
  );

  const optionalAttachments = attachments
    .filter((a) => selectedIds.has(a.id))
    .map(toLineItem);

  const total = subtotal + sumPrices(requiredAttachments) + sumPrices(optionalAttachments);

  return {
    deviceId,
    planId: plan ? plan.id : null,
    base,
    requiredAttachments,
    optionalAttachments,
    total,
  };
}

module.exports = { recalculateCart };
