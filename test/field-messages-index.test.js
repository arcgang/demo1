'use strict';

// Acceptance tests: the structured field/status message contract is exposed
// from the single public import surface (src/index.js), alongside the existing
// reason-code / AppError / toUserFacingError contract.
//
// A downstream API/UI layer must be able to import the whole messaging contract
// from one place. These tests are written BEFORE the re-exports exist and must
// FAIL until the task is implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const api = require('../src/index.js');
const fm = require('../src/field-messages.js');
const { REASON_CODE } = require('../src/reason-codes.js');

test('src/index.js re-exports the MESSAGE_SEVERITY vocabulary', () => {
  assert.deepEqual(api.MESSAGE_SEVERITY, fm.MESSAGE_SEVERITY);
  assert.deepEqual([...api.MESSAGE_SEVERITY_VALUES], [...fm.MESSAGE_SEVERITY_VALUES]);
  assert.equal(api.isValidMessageSeverity, fm.isValidMessageSeverity);
});

test('src/index.js re-exports the MESSAGE_TARGET vocabulary', () => {
  assert.deepEqual(api.MESSAGE_TARGET, fm.MESSAGE_TARGET);
  assert.deepEqual([...api.MESSAGE_TARGET_VALUES], [...fm.MESSAGE_TARGET_VALUES]);
  assert.equal(api.isValidMessageTarget, fm.isValidMessageTarget);
});

test('src/index.js re-exports the ARIA_LIVE vocabulary and mapping', () => {
  assert.deepEqual(api.ARIA_LIVE, fm.ARIA_LIVE);
  assert.deepEqual([...api.ARIA_LIVE_VALUES], [...fm.ARIA_LIVE_VALUES]);
  assert.equal(api.ariaLiveForSeverity, fm.ariaLiveForSeverity);
});

test('src/index.js re-exports the message builders and helpers', () => {
  assert.equal(api.fieldMessage, fm.fieldMessage);
  assert.equal(api.liveRegionMessage, fm.liveRegionMessage);
  assert.equal(api.fieldMessageFromError, fm.fieldMessageFromError);
  assert.equal(api.isValidMessage, fm.isValidMessage);
  assert.equal(api.buildFieldMessageResponse, fm.buildFieldMessageResponse);
});

test('the re-exported builders produce the documented contract from the index surface', () => {
  const msg = api.fieldMessage('deviceId', 'The selected device is no longer available in our catalog.', {
    reasonCode: REASON_CODE.UNKNOWN_DEVICE,
  });
  assert.equal(msg.target, api.MESSAGE_TARGET.FIELD);
  assert.equal(msg.field, 'deviceId');
  assert.equal(msg.reasonCode, REASON_CODE.UNKNOWN_DEVICE);
  assert.ok(api.MESSAGE_SEVERITY_VALUES.includes(msg.severity));
  assert.ok(api.ARIA_LIVE_VALUES.includes(msg.ariaLive));

  const res = api.buildFieldMessageResponse([msg], { correlationId: 'corr_9' });
  assert.equal(res.correlationId, 'corr_9');
  assert.equal(res.hasErrors, true);
  assert.deepEqual(res.messages, [msg]);
});
