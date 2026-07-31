'use strict';

// The structured server-side field/status message contract returned by the
// checkout & onboarding API layer (HLD §10.2 "field-level messages", §11.1
// "Error and status messages exposed semantically to assistive technologies").
//
// Every validation / status / error message the backend hands the frontend
// carries:
//
//   - a machine-usable field identifier (which form field it belongs to), and
//   - message text the frontend can render,
//
// plus a semantic binding hint (`target`) so the frontend knows whether to bind
// the message to a specific field (inline error) or to a live region (a
// form/page-level announcement for assistive technologies), and the ARIA
// live-region politeness (`ariaLive`) that announcement should use.
//
// This module follows the frozen-enum pattern of `status.js` / `reason-codes.js`
// and bridges to the existing error contract (`app-error.js` /
// `user-facing-error.js`) via `fieldMessageFromError`.

const { toUserFacingError } = require('./user-facing-error.js');
const { isValidReasonCode } = require('./reason-codes.js');

// ---------------------------------------------------------------------------
// MESSAGE_SEVERITY vocabulary
// ---------------------------------------------------------------------------

// How serious a message is. ERROR/WARNING demand attention; INFO/SUCCESS are
// advisory. Severity drives the ARIA live-region politeness (see ARIA_LIVE).
const MESSAGE_SEVERITY = Object.freeze({
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
});

const MESSAGE_SEVERITY_VALUES = Object.freeze(Object.values(MESSAGE_SEVERITY));

function isValidMessageSeverity(value) {
  return MESSAGE_SEVERITY_VALUES.includes(value);
}

// ---------------------------------------------------------------------------
// MESSAGE_TARGET vocabulary
// ---------------------------------------------------------------------------

// Where the frontend should bind the message: to a specific form FIELD (inline
// error/hint) or to a page/form-level LIVE_REGION (an assistive-tech
// announcement not tied to a single field).
const MESSAGE_TARGET = Object.freeze({
  FIELD: 'FIELD',
  LIVE_REGION: 'LIVE_REGION',
});

const MESSAGE_TARGET_VALUES = Object.freeze(Object.values(MESSAGE_TARGET));

function isValidMessageTarget(value) {
  return MESSAGE_TARGET_VALUES.includes(value);
}

// ---------------------------------------------------------------------------
// ARIA_LIVE vocabulary & severity -> politeness mapping (accessibility, §11.1)
// ---------------------------------------------------------------------------

// The ARIA live-region politeness a message should be announced with.
// ERROR/WARNING interrupt (assertive); INFO/SUCCESS wait their turn (polite).
const ARIA_LIVE = Object.freeze({
  ASSERTIVE: 'assertive',
  POLITE: 'polite',
});

const ARIA_LIVE_VALUES = Object.freeze(Object.values(ARIA_LIVE));

// Map a severity to its ARIA live-region politeness. Throws for an unknown
// severity so a miswired message can never announce with an undefined value.
function ariaLiveForSeverity(severity) {
  if (!isValidMessageSeverity(severity)) {
    throw new Error(`invalid message severity: ${JSON.stringify(severity)}`);
  }
  if (severity === MESSAGE_SEVERITY.ERROR || severity === MESSAGE_SEVERITY.WARNING) {
    return ARIA_LIVE.ASSERTIVE;
  }
  return ARIA_LIVE.POLITE;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Validate the optional { severity, reasonCode } shared by the builders and
// return the resolved values, defaulting severity to `defaultSeverity`.
function resolveOptions(opts, defaultSeverity) {
  const { severity = defaultSeverity, reasonCode = null } = opts || {};
  if (!isValidMessageSeverity(severity)) {
    throw new Error(`invalid message severity: ${JSON.stringify(severity)}`);
  }
  if (reasonCode !== null && !isValidReasonCode(reasonCode)) {
    throw new Error(`invalid reason code: ${JSON.stringify(reasonCode)}`);
  }
  return { severity, reasonCode };
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

// Build a message bound to a specific form field. `field` is the machine-usable
// field identifier the frontend targets (e.g. `porting.msisdn`). Field messages
// default to ERROR severity. Throws on a blank field id or message text.
function fieldMessage(field, message, opts = {}) {
  if (!isNonBlankString(field)) {
    throw new Error('fieldMessage requires a non-empty field identifier');
  }
  if (!isNonBlankString(message)) {
    throw new Error('fieldMessage requires non-empty message text');
  }
  const { severity, reasonCode } = resolveOptions(opts, MESSAGE_SEVERITY.ERROR);
  return {
    target: MESSAGE_TARGET.FIELD,
    field,
    message,
    severity,
    ariaLive: ariaLiveForSeverity(severity),
    reasonCode,
  };
}

// Build a message bound to a live region rather than a single field (e.g. a
// form-level error summary or a status announcement). Live-region messages
// default to INFO severity and never carry a field id.
function liveRegionMessage(message, opts = {}) {
  if (!isNonBlankString(message)) {
    throw new Error('liveRegionMessage requires non-empty message text');
  }
  const { severity, reasonCode } = resolveOptions(opts, MESSAGE_SEVERITY.INFO);
  return {
    target: MESSAGE_TARGET.LIVE_REGION,
    field: null,
    message,
    severity,
    ariaLive: ariaLiveForSeverity(severity),
    reasonCode,
  };
}

// Bridge from the existing error contract: turn any thrown value into a
// field-bound message. The value is normalized through `toUserFacingError`, so
// the message is always the customer-facing text (never a raw Error message)
// and carries the normalized reason code. Field messages default to ERROR.
function fieldMessageFromError(err, field, opts = {}) {
  if (!isNonBlankString(field)) {
    throw new Error('fieldMessageFromError requires a non-empty field identifier');
  }
  const normalized = toUserFacingError(err);
  const { severity = MESSAGE_SEVERITY.ERROR } = opts || {};
  return fieldMessage(field, normalized.message, {
    severity,
    reasonCode: normalized.reasonCode,
  });
}

// ---------------------------------------------------------------------------
// Structural predicate
// ---------------------------------------------------------------------------

// True when `msg` is a well-formed message object per this contract: exactly
// the contract fields, valid target/severity/ariaLive, non-empty text, a
// null-or-valid reasonCode, and a field id present iff the target is FIELD.
function isValidMessage(msg) {
  if (typeof msg !== 'object' || msg === null) return false;

  const expectedKeys = ['ariaLive', 'field', 'message', 'reasonCode', 'severity', 'target'];
  const keys = Object.keys(msg).sort();
  if (keys.length !== expectedKeys.length) return false;
  for (let i = 0; i < expectedKeys.length; i += 1) {
    if (keys[i] !== expectedKeys[i]) return false;
  }

  if (!isValidMessageTarget(msg.target)) return false;
  if (!isNonBlankString(msg.message)) return false;
  if (!isValidMessageSeverity(msg.severity)) return false;
  if (!ARIA_LIVE_VALUES.includes(msg.ariaLive)) return false;
  if (msg.reasonCode !== null && !isValidReasonCode(msg.reasonCode)) return false;

  if (msg.target === MESSAGE_TARGET.FIELD) {
    if (!isNonBlankString(msg.field)) return false;
  } else if (msg.field !== null) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

// Assemble the endpoint response envelope the API layer serializes:
//
//   { messages, correlationId, hasErrors }
//
// `messages` is a defensive copy of the supplied (non-empty) message array;
// every entry must be a valid message. `hasErrors` is true when any message is
// an ERROR, letting the frontend decide whether the submission failed.
function buildFieldMessageResponse(messages, opts = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('buildFieldMessageResponse requires a non-empty messages array');
  }
  for (const msg of messages) {
    if (!isValidMessage(msg)) {
      throw new Error('buildFieldMessageResponse received an invalid message object');
    }
  }
  const { correlationId = null } = opts || {};
  return {
    messages: [...messages],
    correlationId,
    hasErrors: messages.some((m) => m.severity === MESSAGE_SEVERITY.ERROR),
  };
}

module.exports = {
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
};
