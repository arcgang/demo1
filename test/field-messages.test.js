'use strict';

// Acceptance tests (unit): the structured server-side field/status message
// contract for checkout & onboarding endpoints (HLD §10.2 "field-level
// messages", §11.1 "Error and status messages exposed semantically to
// assistive technologies").
//
// `src/field-messages.js` defines the response contract the API layer returns
// so that EVERY validation / status / error message carries:
//
//   - a machine-usable field identifier (which form field it belongs to), and
//   - message text the frontend can render,
//
// and a semantic binding hint so the frontend knows whether to bind the
// message to a specific field (inline error) or to a live region (a
// form/page-level announcement for assistive technologies).
//
// It follows the frozen-enum pattern of src/status.js / src/reason-codes.js and
// exposes:
//
//   MESSAGE_SEVERITY        frozen enum: ERROR, WARNING, INFO, SUCCESS
//   MESSAGE_SEVERITY_VALUES frozen array of the values
//   isValidMessageSeverity(v)
//
//   MESSAGE_TARGET          frozen enum: FIELD, LIVE_REGION
//   MESSAGE_TARGET_VALUES   frozen array of the values
//   isValidMessageTarget(v)
//
//   ARIA_LIVE               frozen enum of ARIA live-region politeness values
//                           { ASSERTIVE: 'assertive', POLITE: 'polite' }
//   ARIA_LIVE_VALUES        frozen array of the values
//   ariaLiveForSeverity(severity)  -> ERROR/WARNING => 'assertive',
//                                     INFO/SUCCESS  => 'polite' (throws on bad input)
//
//   fieldMessage(field, message, { severity, reasonCode })       -> message bound to a field
//   liveRegionMessage(message, { severity, reasonCode })          -> message bound to a live region
//   fieldMessageFromError(err, field, { severity })               -> field message from any thrown value
//   isValidMessage(msg)                                           -> structural predicate
//   buildFieldMessageResponse(messages, { correlationId })        -> endpoint response envelope
//
// These tests are written BEFORE the module exists and must FAIL until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const fm = require('../src/field-messages.js');
const {
  MESSAGE_SEVERITY,
  MESSAGE_SEVERITY_VALUES,
  isValidMessageSeverity,
  MESSAGE_TARGET,
  MESSAGE_TARGET_VALUES,
  isValidMessageTarget,
  ARIA_LIVE,
  ARIA_LIVE_VALUES,
  ariaLiveForSeverity,
  fieldMessage,
  liveRegionMessage,
  fieldMessageFromError,
  isValidMessage,
  buildFieldMessageResponse,
} = fm;

const { AppError } = require('../src/app-error.js');
const {
  REASON_CODE,
  REASON_CODE_VALUES,
  getReasonMeta,
} = require('../src/reason-codes.js');

// The exact vocabularies the contract expects.
const EXPECTED_SEVERITIES = Object.freeze(['ERROR', 'WARNING', 'INFO', 'SUCCESS']);
const EXPECTED_TARGETS = Object.freeze(['FIELD', 'LIVE_REGION']);

const MESSAGE_FIELDS = Object.freeze([
  'target',
  'field',
  'message',
  'severity',
  'ariaLive',
  'reasonCode',
]);

// Assert a value is a plain, JSON-serializable message object carrying every
// required field, with values drawn from the expected vocabularies.
function assertValidMessageShape(msg) {
  assert.equal(typeof msg, 'object');
  assert.notEqual(msg, null);
  assert.ok(!(msg instanceof Error), 'a message must be a data object, not an Error');
  const proto = Object.getPrototypeOf(msg);
  assert.ok(proto === Object.prototype || proto === null, 'a message must be a plain object');

  const keys = Object.keys(msg).sort();
  assert.deepEqual(keys, [...MESSAGE_FIELDS].sort(), 'message must carry exactly the contract fields');

  assert.ok(MESSAGE_TARGET_VALUES.includes(msg.target), 'target must be a MESSAGE_TARGET value');
  assert.equal(typeof msg.message, 'string');
  assert.notEqual(msg.message.trim(), '', 'message text must be non-empty');
  assert.ok(MESSAGE_SEVERITY_VALUES.includes(msg.severity), 'severity must be a MESSAGE_SEVERITY value');
  assert.ok(ARIA_LIVE_VALUES.includes(msg.ariaLive), 'ariaLive must be an ARIA_LIVE value');
  assert.ok(
    msg.reasonCode === null || REASON_CODE_VALUES.includes(msg.reasonCode),
    'reasonCode must be null or a REASON_CODE value',
  );

  if (msg.target === MESSAGE_TARGET.FIELD) {
    assert.equal(typeof msg.field, 'string');
    assert.notEqual(msg.field.trim(), '', 'a field message must carry a non-empty field identifier');
  } else {
    assert.equal(msg.field, null, 'a live-region message must not be bound to a field');
  }
}

// ---------------------------------------------------------------------------
// MESSAGE_SEVERITY vocabulary
// ---------------------------------------------------------------------------

test('exports a frozen MESSAGE_SEVERITY vocabulary', () => {
  assert.equal(typeof MESSAGE_SEVERITY, 'object');
  const expected = {};
  for (const s of EXPECTED_SEVERITIES) expected[s] = s;
  assert.deepEqual(MESSAGE_SEVERITY, expected);
  assert.equal(Object.isFrozen(MESSAGE_SEVERITY), true);
});

test('MESSAGE_SEVERITY cannot gain new members', () => {
  assert.throws(() => {
    'use strict';
    MESSAGE_SEVERITY.CRITICAL = 'CRITICAL';
  });
  assert.equal(MESSAGE_SEVERITY.CRITICAL, undefined);
});

test('exports MESSAGE_SEVERITY_VALUES as a frozen array of the values', () => {
  assert.ok(Array.isArray(MESSAGE_SEVERITY_VALUES));
  assert.deepEqual([...MESSAGE_SEVERITY_VALUES], Object.values(MESSAGE_SEVERITY));
  assert.equal(Object.isFrozen(MESSAGE_SEVERITY_VALUES), true);
});

test('isValidMessageSeverity accepts every severity and rejects others', () => {
  for (const s of MESSAGE_SEVERITY_VALUES) {
    assert.equal(isValidMessageSeverity(s), true, `expected ${s} to be valid`);
  }
  for (const bad of ['error', 'CRITICAL', '', null, undefined, 0, {}]) {
    assert.equal(isValidMessageSeverity(bad), false);
  }
});

// ---------------------------------------------------------------------------
// MESSAGE_TARGET vocabulary
// ---------------------------------------------------------------------------

test('exports a frozen MESSAGE_TARGET vocabulary distinguishing FIELD from LIVE_REGION', () => {
  assert.deepEqual(MESSAGE_TARGET, { FIELD: 'FIELD', LIVE_REGION: 'LIVE_REGION' });
  assert.equal(Object.isFrozen(MESSAGE_TARGET), true);
});

test('exports MESSAGE_TARGET_VALUES as a frozen array of the values', () => {
  assert.ok(Array.isArray(MESSAGE_TARGET_VALUES));
  assert.deepEqual([...MESSAGE_TARGET_VALUES], Object.values(MESSAGE_TARGET));
  assert.deepEqual([...MESSAGE_TARGET_VALUES].sort(), [...EXPECTED_TARGETS].sort());
  assert.equal(Object.isFrozen(MESSAGE_TARGET_VALUES), true);
});

test('isValidMessageTarget accepts every target and rejects others', () => {
  for (const t of MESSAGE_TARGET_VALUES) {
    assert.equal(isValidMessageTarget(t), true, `expected ${t} to be valid`);
  }
  for (const bad of ['field', 'liveregion', '', null, undefined, 0, {}]) {
    assert.equal(isValidMessageTarget(bad), false);
  }
});

// ---------------------------------------------------------------------------
// ARIA_LIVE vocabulary & severity -> politeness mapping (accessibility, §11.1)
// ---------------------------------------------------------------------------

test('exports a frozen ARIA_LIVE vocabulary of live-region politeness values', () => {
  assert.deepEqual(ARIA_LIVE, { ASSERTIVE: 'assertive', POLITE: 'polite' });
  assert.equal(Object.isFrozen(ARIA_LIVE), true);
  assert.ok(Array.isArray(ARIA_LIVE_VALUES));
  assert.deepEqual([...ARIA_LIVE_VALUES], Object.values(ARIA_LIVE));
  assert.equal(Object.isFrozen(ARIA_LIVE_VALUES), true);
});

test('ariaLiveForSeverity maps ERROR/WARNING to assertive and INFO/SUCCESS to polite', () => {
  assert.equal(ariaLiveForSeverity(MESSAGE_SEVERITY.ERROR), ARIA_LIVE.ASSERTIVE);
  assert.equal(ariaLiveForSeverity(MESSAGE_SEVERITY.WARNING), ARIA_LIVE.ASSERTIVE);
  assert.equal(ariaLiveForSeverity(MESSAGE_SEVERITY.INFO), ARIA_LIVE.POLITE);
  assert.equal(ariaLiveForSeverity(MESSAGE_SEVERITY.SUCCESS), ARIA_LIVE.POLITE);
});

test('ariaLiveForSeverity throws for an invalid severity', () => {
  assert.throws(() => ariaLiveForSeverity('error'));
  assert.throws(() => ariaLiveForSeverity('CRITICAL'));
  assert.throws(() => ariaLiveForSeverity(undefined));
  assert.throws(() => ariaLiveForSeverity(null));
});

// ---------------------------------------------------------------------------
// fieldMessage(): a message associated with a specific field
// ---------------------------------------------------------------------------

test('fieldMessage builds a field-bound message with the machine-usable field id and text', () => {
  const msg = fieldMessage('porting.msisdn', 'Enter the number you want to port in.');
  assertValidMessageShape(msg);
  assert.deepEqual(msg, {
    target: MESSAGE_TARGET.FIELD,
    field: 'porting.msisdn',
    message: 'Enter the number you want to port in.',
    severity: MESSAGE_SEVERITY.ERROR, // field messages default to ERROR
    ariaLive: ARIA_LIVE.ASSERTIVE, // derived from ERROR
    reasonCode: null,
  });
});

test('fieldMessage honours an explicit severity and derives the matching ariaLive', () => {
  const msg = fieldMessage('customer.firstName', 'Looks good.', {
    severity: MESSAGE_SEVERITY.SUCCESS,
  });
  assert.equal(msg.severity, MESSAGE_SEVERITY.SUCCESS);
  assert.equal(msg.ariaLive, ARIA_LIVE.POLITE);
});

test('fieldMessage can carry a reasonCode linking back to the reason-code catalog', () => {
  const msg = fieldMessage('deviceId', getReasonMeta(REASON_CODE.UNKNOWN_DEVICE).message, {
    reasonCode: REASON_CODE.UNKNOWN_DEVICE,
  });
  assert.equal(msg.reasonCode, REASON_CODE.UNKNOWN_DEVICE);
});

test('fieldMessage rejects a missing or blank field identifier', () => {
  assert.throws(() => fieldMessage('', 'text'));
  assert.throws(() => fieldMessage('   ', 'text'));
  assert.throws(() => fieldMessage(undefined, 'text'));
  assert.throws(() => fieldMessage(null, 'text'));
  assert.throws(() => fieldMessage(123, 'text'));
});

test('fieldMessage rejects a missing or blank message text', () => {
  assert.throws(() => fieldMessage('field', ''));
  assert.throws(() => fieldMessage('field', '   '));
  assert.throws(() => fieldMessage('field', undefined));
  assert.throws(() => fieldMessage('field', null));
});

test('fieldMessage rejects an invalid severity or reasonCode', () => {
  assert.throws(() => fieldMessage('field', 'text', { severity: 'CRITICAL' }));
  assert.throws(() => fieldMessage('field', 'text', { reasonCode: 'NOT_A_CODE' }));
});

// ---------------------------------------------------------------------------
// liveRegionMessage(): a message bound to a live region (not a single field)
// ---------------------------------------------------------------------------

test('liveRegionMessage builds a non-field message bound to a live region', () => {
  const msg = liveRegionMessage('We are still confirming your mobile money payment.');
  assertValidMessageShape(msg);
  assert.equal(msg.target, MESSAGE_TARGET.LIVE_REGION);
  assert.equal(msg.field, null);
  assert.equal(msg.message, 'We are still confirming your mobile money payment.');
  assert.equal(msg.severity, MESSAGE_SEVERITY.INFO); // status announcements default to INFO
  assert.equal(msg.ariaLive, ARIA_LIVE.POLITE);
  assert.equal(msg.reasonCode, null);
});

test('liveRegionMessage honours an explicit severity (e.g. a form-level error summary)', () => {
  const msg = liveRegionMessage('Please fix the highlighted fields.', {
    severity: MESSAGE_SEVERITY.ERROR,
  });
  assert.equal(msg.severity, MESSAGE_SEVERITY.ERROR);
  assert.equal(msg.ariaLive, ARIA_LIVE.ASSERTIVE);
  assert.equal(msg.field, null);
});

test('liveRegionMessage rejects a blank message', () => {
  assert.throws(() => liveRegionMessage(''));
  assert.throws(() => liveRegionMessage('   '));
  assert.throws(() => liveRegionMessage(undefined));
});

// ---------------------------------------------------------------------------
// fieldMessageFromError(): bridge from the existing error contract
// ---------------------------------------------------------------------------

test('fieldMessageFromError turns an AppError into a field-bound message carrying its reasonCode', () => {
  const err = new AppError(REASON_CODE.MISSING_OR_INVALID_DEVICE_ID);
  const meta = getReasonMeta(REASON_CODE.MISSING_OR_INVALID_DEVICE_ID);
  const msg = fieldMessageFromError(err, 'deviceId');

  assertValidMessageShape(msg);
  assert.equal(msg.target, MESSAGE_TARGET.FIELD);
  assert.equal(msg.field, 'deviceId');
  assert.equal(msg.reasonCode, REASON_CODE.MISSING_OR_INVALID_DEVICE_ID);
  assert.equal(msg.message, meta.message); // the customer-facing text, not a raw Error message
  assert.equal(msg.severity, MESSAGE_SEVERITY.ERROR);
  assert.equal(msg.ariaLive, ARIA_LIVE.ASSERTIVE);
});

test('fieldMessageFromError downgrades a bare Error to UNEXPECTED and never leaks the raw message', () => {
  const raw = new Error('sensitive stack detail: db password = hunter2');
  const msg = fieldMessageFromError(raw, 'cartId');

  assertValidMessageShape(msg);
  assert.equal(msg.reasonCode, REASON_CODE.UNEXPECTED);
  assert.equal(msg.field, 'cartId');
  assert.notEqual(msg.message, raw.message);
  assert.ok(!msg.message.includes('hunter2'), 'raw internal detail must not leak into the message');
});

test('fieldMessageFromError still requires a valid field identifier', () => {
  const err = new AppError(REASON_CODE.UNKNOWN_DEVICE);
  assert.throws(() => fieldMessageFromError(err, ''));
  assert.throws(() => fieldMessageFromError(err, undefined));
});

// ---------------------------------------------------------------------------
// isValidMessage(): structural predicate
// ---------------------------------------------------------------------------

test('isValidMessage accepts messages produced by the builders', () => {
  assert.equal(isValidMessage(fieldMessage('a.b', 'text')), true);
  assert.equal(isValidMessage(liveRegionMessage('text')), true);
  assert.equal(
    isValidMessage(fieldMessage('a', 'text', { reasonCode: REASON_CODE.UNKNOWN_DEVICE })),
    true,
  );
});

test('isValidMessage rejects malformed messages', () => {
  assert.equal(isValidMessage(null), false);
  assert.equal(isValidMessage({}), false);
  // FIELD target with no field id
  assert.equal(
    isValidMessage({ target: 'FIELD', field: null, message: 'x', severity: 'ERROR', ariaLive: 'assertive', reasonCode: null }),
    false,
  );
  // LIVE_REGION target must not carry a field id
  assert.equal(
    isValidMessage({ target: 'LIVE_REGION', field: 'a', message: 'x', severity: 'INFO', ariaLive: 'polite', reasonCode: null }),
    false,
  );
  // bad severity
  assert.equal(
    isValidMessage({ target: 'FIELD', field: 'a', message: 'x', severity: 'CRITICAL', ariaLive: 'assertive', reasonCode: null }),
    false,
  );
  // empty message text
  assert.equal(
    isValidMessage({ target: 'FIELD', field: 'a', message: '', severity: 'ERROR', ariaLive: 'assertive', reasonCode: null }),
    false,
  );
});

// ---------------------------------------------------------------------------
// buildFieldMessageResponse(): the endpoint response envelope
// ---------------------------------------------------------------------------

test('buildFieldMessageResponse assembles the documented response envelope', () => {
  const messages = [
    fieldMessage('porting.msisdn', 'Enter the number you want to port in.'),
    fieldMessage('customer.idDocumentNumber', 'This ID number is not valid.'),
    liveRegionMessage('Please fix the highlighted fields.', { severity: MESSAGE_SEVERITY.ERROR }),
  ];
  const res = buildFieldMessageResponse(messages, { correlationId: 'corr_12af' });

  assert.equal(typeof res, 'object');
  assert.deepEqual(Object.keys(res).sort(), ['correlationId', 'hasErrors', 'messages'].sort());
  assert.equal(res.correlationId, 'corr_12af');
  assert.equal(res.hasErrors, true);
  assert.equal(Array.isArray(res.messages), true);
  assert.equal(res.messages.length, 3);
  for (const m of res.messages) assertValidMessageShape(m);
  assert.deepEqual(res.messages, messages);
});

test('buildFieldMessageResponse defaults correlationId to null', () => {
  const res = buildFieldMessageResponse([fieldMessage('a', 'x')]);
  assert.equal(res.correlationId, null);
});

test('buildFieldMessageResponse.hasErrors is false when no message is an ERROR', () => {
  const res = buildFieldMessageResponse([
    liveRegionMessage('Payment pending.', { severity: MESSAGE_SEVERITY.INFO }),
    fieldMessage('a', 'ok', { severity: MESSAGE_SEVERITY.SUCCESS }),
  ]);
  assert.equal(res.hasErrors, false);
});

test('buildFieldMessageResponse copies the messages array (no shared reference)', () => {
  const messages = [fieldMessage('a', 'x')];
  const res = buildFieldMessageResponse(messages);
  assert.notEqual(res.messages, messages, 'response must not share the caller array reference');
});

test('buildFieldMessageResponse rejects a non-array or empty messages argument', () => {
  assert.throws(() => buildFieldMessageResponse());
  assert.throws(() => buildFieldMessageResponse(null));
  assert.throws(() => buildFieldMessageResponse('not an array'));
  assert.throws(() => buildFieldMessageResponse([]));
});

test('buildFieldMessageResponse rejects messages that are not valid message objects', () => {
  assert.throws(() => buildFieldMessageResponse([{ not: 'a message' }]));
  assert.throws(() => buildFieldMessageResponse([fieldMessage('a', 'x'), { bad: true }]));
});

// ---------------------------------------------------------------------------
// JSON serializability (the contract is what the API layer serializes)
// ---------------------------------------------------------------------------

test('a field message is JSON-serializable and round-trips unchanged', () => {
  const msg = fieldMessage('a.b', 'text', { reasonCode: REASON_CODE.UNKNOWN_DEVICE });
  assert.deepEqual(JSON.parse(JSON.stringify(msg)), msg);
});

test('the full response envelope is JSON-serializable and round-trips unchanged', () => {
  const res = buildFieldMessageResponse(
    [
      fieldMessage('porting.msisdn', 'Enter the number you want to port in.'),
      liveRegionMessage('Payment pending.'),
    ],
    { correlationId: 'corr_1' },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(res)), res);
});
