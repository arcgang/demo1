'use strict';

// Acceptance tests: migrations create the schema for the recommendation /
// attachment data model. The implementation is expected to live at
// `src/index.js` and expose a small data-model API (see README of the task).
//
// These tests are written BEFORE implementation and must fail until the
// schema, migrations, seed and query layer exist.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

test('createDatabase returns a usable database handle', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(db, 'expected createDatabase to return a database handle');
});

test('migrations create the devices/plans/bundles/accessories tables (queryable and empty on a fresh db)', () => {
  const db = model.createDatabase(':memory:');

  // If the migrations ran, each entity table exists and yields an empty list.
  assert.deepEqual(model.getDevices(db), [], 'devices table should exist and be empty');
  assert.deepEqual(model.getPlans(db), [], 'plans table should exist and be empty');
  assert.deepEqual(model.getBundles(db), [], 'bundles table should exist and be empty');
  assert.deepEqual(model.getAccessories(db), [], 'accessories table should exist and be empty');
});

test('migrations create the attachments relationship (no attachments on a fresh db)', () => {
  const db = model.createDatabase(':memory:');
  assert.deepEqual(
    model.getAttachmentsForDevice(db, 1),
    [],
    'a fresh database should return no attachments for any device',
  );
});

test('the model exposes the REQUIRED/OPTIONAL requirement vocabulary', () => {
  assert.ok(model.REQUIREMENT, 'expected a REQUIREMENT enum to be exported');
  assert.equal(model.REQUIREMENT.REQUIRED, 'REQUIRED');
  assert.equal(model.REQUIREMENT.OPTIONAL, 'OPTIONAL');
});
