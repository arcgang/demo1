'use strict';

const { REQUIREMENT } = require('./requirement.js');

// Rank REQUIRED add-ons ahead of OPTIONAL ones. Anything unrecognised sorts
// last so a stray value never jumps ahead of a genuine REQUIRED item.
const REQUIREMENT_RANK = {
  [REQUIREMENT.REQUIRED]: 0,
  [REQUIREMENT.OPTIONAL]: 1,
};

function requirementRank(requirement) {
  return REQUIREMENT_RANK[requirement] ?? Number.MAX_SAFE_INTEGER;
}

// The recommendation engine service.
//
// Given a device id and the context of an existing (prepaid) customer, return
// the plans, bundles and accessories relevant to that device — each carrying
// its attachment type (REQUIRED / OPTIONAL) and current catalog price — ranked
// so REQUIRED items come first.
//
// The `db` and the attachment query helpers are provided lazily by `index.js`
// to avoid a circular require (index.js re-exports `recommend`).
function recommend(db, { deviceId, customer } = {}) {
  if (deviceId === undefined || deviceId === null) {
    throw new Error('deviceId is required to build recommendations');
  }
  if (customer === undefined || customer === null) {
    throw new Error('a customer context is required to build recommendations');
  }

  const model = require('./index.js');

  // The attachable bundles/accessories for this device, already shaped with a
  // requirement flag and their current price resolved from the catalog.
  const attachments = model.getAttachmentsForDevice(db, deviceId);

  const recommendations = [];

  // Plans relevant to the device are those referenced by a device/plan-scoped
  // attachment. Dedupe them and treat a plan as REQUIRED if any attachment that
  // references it is REQUIRED; otherwise OPTIONAL.
  const planRequirement = new Map();
  for (const attachment of attachments) {
    if (attachment.planId == null) continue;
    const current = planRequirement.get(attachment.planId);
    if (current === REQUIREMENT.REQUIRED) continue;
    planRequirement.set(attachment.planId, attachment.requirement);
  }

  const selectPlan = db.prepare('SELECT id, name, price FROM plans WHERE id = ?');
  for (const [planId, requirement] of planRequirement) {
    const plan = selectPlan.get(planId);
    if (!plan) continue;
    recommendations.push({
      kind: 'plan',
      id: plan.id,
      name: plan.name,
      price: plan.price,
      requirement,
    });
  }

  // Each attachable bundle/accessory becomes a recommendation carrying the
  // add-on's identity, current price and requirement flag.
  for (const attachment of attachments) {
    recommendations.push({
      kind: attachment.kind,
      id: attachment.kind === 'bundle' ? attachment.bundleId : attachment.accessoryId,
      name: attachment.name,
      price: attachment.price,
      requirement: attachment.requirement,
    });
  }

  // Rank REQUIRED ahead of OPTIONAL. Array.prototype.sort is stable, so the
  // relative order established above (plans, then add-ons in attachment order)
  // is preserved within each requirement level.
  recommendations.sort((a, b) => requirementRank(a.requirement) - requirementRank(b.requirement));

  return { deviceId, recommendations };
}

module.exports = { recommend };
