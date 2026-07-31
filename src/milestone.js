'use strict';

// The activation-milestone vocabulary shared by the schema (CHECK
// constraints), the activation orchestration service, and the status-timeline
// service. This is the single source of truth for the canonical activation
// milestones, the order they are reached in, and the per-milestone status
// values; it mirrors the src/requirement.js / src/order-status.js pattern.

// The three canonical activation milestones. A customer's activation journey
// reaches them in order: payment completes, then verification completes, then
// activation itself completes.
const ACTIVATION_MILESTONE = Object.freeze({
  PAYMENT_COMPLETE: 'PAYMENT_COMPLETE',
  VERIFICATION_COMPLETE: 'VERIFICATION_COMPLETE',
  ACTIVATION_COMPLETE: 'ACTIVATION_COMPLETE',
});

const ACTIVATION_MILESTONE_VALUES = Object.freeze(Object.values(ACTIVATION_MILESTONE));

// The milestones in the order they are reached: payment -> verification ->
// activation. Consumed wherever milestone progression/ordering matters (e.g.
// deriving the next-expected milestone in the timeline service).
const ACTIVATION_MILESTONE_SEQUENCE = Object.freeze([
  ACTIVATION_MILESTONE.PAYMENT_COMPLETE,
  ACTIVATION_MILESTONE.VERIFICATION_COMPLETE,
  ACTIVATION_MILESTONE.ACTIVATION_COMPLETE,
]);

function isValidMilestone(value) {
  return ACTIVATION_MILESTONE_VALUES.includes(value);
}

// The allowed status for any single milestone: PENDING until it is reached,
// BLOCKED when a prerequisite milestone is not yet satisfied, and COMPLETE once
// the milestone has been reached.
const MILESTONE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  BLOCKED: 'BLOCKED',
  COMPLETE: 'COMPLETE',
});

const MILESTONE_STATUS_VALUES = Object.freeze(Object.values(MILESTONE_STATUS));

function isValidStatus(value) {
  return MILESTONE_STATUS_VALUES.includes(value);
}

module.exports = {
  ACTIVATION_MILESTONE,
  ACTIVATION_MILESTONE_VALUES,
  ACTIVATION_MILESTONE_SEQUENCE,
  MILESTONE_STATUS,
  MILESTONE_STATUS_VALUES,
  isValidMilestone,
  isValidStatus,
};
