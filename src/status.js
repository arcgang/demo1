'use strict';

// The order/activation status vocabulary shared by the schema (CHECK
// constraints) and the application/service layer. This is the single source of
// truth for these status strings and mirrors the pattern of `requirement.js`.
//
// Two distinct vocabularies are exposed:
//
//   MILESTONE      the journey domains the status timeline aggregates —
//                  PAYMENT, VERIFICATION, FULFILMENT, ACTIVATION.
//   STATUS_STATE   the meaningful states a milestone can be in. Deliberately
//                  richer than a generic "pending": every non-terminal state is
//                  distinct so the timeline can express real progress.

// The four milestone domains aggregated by the status timeline.
const MILESTONE = Object.freeze({
  PAYMENT: 'PAYMENT',
  VERIFICATION: 'VERIFICATION',
  FULFILMENT: 'FULFILMENT',
  ACTIVATION: 'ACTIVATION',
});

const MILESTONE_VALUES = Object.freeze(Object.values(MILESTONE));

function isValidMilestone(value) {
  return MILESTONE_VALUES.includes(value);
}

// The meaningful states a milestone can carry. PENDING is the neutral starting
// state; IN_PROGRESS, COMPLETE, BLOCKED, and FAILED each carry real meaning
// beyond a generic pending.
const STATUS_STATE = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
});

const STATUS_STATE_VALUES = Object.freeze(Object.values(STATUS_STATE));

function isValidStatusState(value) {
  return STATUS_STATE_VALUES.includes(value);
}

module.exports = {
  MILESTONE,
  MILESTONE_VALUES,
  isValidMilestone,
  STATUS_STATE,
  STATUS_STATE_VALUES,
  isValidStatusState,
};
