'use strict';

// Acceptance tests: the structured field/status message contract is DOCUMENTED
// for consumers (task acceptance: "a documented schema").
//
// README.md must describe the per-field server-side messaging contract so a
// frontend can bind each message to the correct field or live region:
//
//   - every field of the message object (target, field, message, severity,
//     ariaLive, reasonCode);
//   - the MESSAGE_TARGET values (FIELD, LIVE_REGION) and what each means for
//     binding (inline field vs. live region);
//   - the MESSAGE_SEVERITY values (ERROR, WARNING, INFO, SUCCESS);
//   - the ARIA_LIVE politeness mapping (assertive / polite) for assistive tech;
//   - a worked example of the endpoint response envelope (messages +
//     correlationId + hasErrors) inside a fenced code block.
//
// Written BEFORE the documentation exists; must FAIL until implemented.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const README = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
const README_LC = README.toLowerCase();

const {
  MESSAGE_SEVERITY_VALUES,
  MESSAGE_TARGET_VALUES,
  ARIA_LIVE_VALUES,
} = require('../src/field-messages.js');

test('README documents every field of the message object', () => {
  for (const field of ['target', 'field', 'message', 'severity', 'ariaLive', 'reasonCode']) {
    assert.ok(README.includes(field), `README must document the "${field}" message field`);
  }
});

test('README documents every MESSAGE_TARGET value', () => {
  for (const target of MESSAGE_TARGET_VALUES) {
    assert.ok(README.includes(target), `README must document the target ${target}`);
  }
});

test('README explains the field vs. live-region binding for assistive technologies', () => {
  // The doc must connect the contract to the frontend binding: a field id for
  // inline errors and a live region for announcements.
  assert.ok(README_LC.includes('live region') || README_LC.includes('live-region'),
    'README must mention the live region concept');
  assert.ok(README_LC.includes('field'), 'README must mention field binding');
});

test('README documents every MESSAGE_SEVERITY value', () => {
  for (const severity of MESSAGE_SEVERITY_VALUES) {
    assert.ok(README.includes(severity), `README must document the severity ${severity}`);
  }
});

test('README documents the ARIA live-region politeness mapping', () => {
  for (const politeness of ARIA_LIVE_VALUES) {
    assert.ok(README.includes(politeness), `README must document the aria-live value ${politeness}`);
  }
  assert.ok(README_LC.includes('aria'), 'README must reference ARIA / aria-live');
});

test('README includes a worked example of the field-message response envelope', () => {
  assert.ok(README.includes('```'), 'README must contain a fenced code example');
  const fenced = README.match(/```[\s\S]*?```/g) || [];
  const hasEnvelope = fenced.some(
    (block) =>
      block.includes('messages') &&
      block.includes('correlationId') &&
      block.includes('field') &&
      (block.includes('FIELD') || block.includes('LIVE_REGION')),
  );
  assert.ok(
    hasEnvelope,
    'a fenced code block must show a response envelope with messages, a field-bound message, and correlationId',
  );
});
