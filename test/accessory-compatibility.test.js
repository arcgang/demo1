'use strict';

// Acceptance tests: the accessory-compatibility model functions on
// `src/index.js`.
//
// The task extends the data-model API with:
//
//   - a creator/setter that records that an accessory is compatible with a
//     device family, and
//   - a reader that lists an accessory's compatible families.
//
// Following the makeCreator / getAttachmentsForDevice conventions already in
// src/index.js, both are re-exported from module.exports.
//
// The design is silent on the exact export names, so these tests resolve the
// creator and reader from a small set of conventional candidates (and fail
// clearly if neither is present). The durable acceptance criteria are:
// compatibility rows can be created and read back, and an invalid accessory id
// is rejected.
//
// These tests are written BEFORE implementation and must fail until the
// functions exist.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// Resolve the creator/setter and reader by conventional candidate names.
// ---------------------------------------------------------------------------

const CREATOR_CANDIDATES = [
  'addAccessoryCompatibility',
  'setAccessoryCompatibility',
  'createAccessoryCompatibility',
  'recordAccessoryCompatibility',
  'addCompatibleFamily',
  'setCompatibleFamily',
];

const READER_CANDIDATES = [
  'getCompatibleFamilies',
  'getAccessoryCompatibility',
  'getAccessoryCompatibleFamilies',
  'listCompatibleFamilies',
  'getCompatibilities',
];

function resolve(candidates) {
  for (const name of candidates) {
    if (typeof model[name] === 'function') return model[name];
  }
  return undefined;
}

const createCompatibility = resolve(CREATOR_CANDIDATES);
const readCompatibility = resolve(READER_CANDIDATES);

function freshDb() {
  return model.createDatabase(':memory:');
}

function seedAccessory(db, name = 'Case') {
  return model.createAccessory(db, { name, price: 199 });
}

// Pick valid family values. Prefer an exported DEVICE_FAMILY vocabulary if one
// exists; otherwise use plausible device-family strings.
function families() {
  if (model.DEVICE_FAMILY && typeof model.DEVICE_FAMILY === 'object') {
    return Object.values(model.DEVICE_FAMILY);
  }
  return ['SMARTPHONE', 'TABLET', 'WEARABLE', 'ROUTER'];
}

// Normalize a reader result to a plain array of family strings, tolerating
// either a list of strings or a list of row-like objects carrying `family`.
function familyList(result) {
  const arr = Array.isArray(result) ? result : [];
  return arr.map((entry) => (typeof entry === 'string' ? entry : entry && entry.family));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

test('a compatibility creator/setter is re-exported from src/index.js', () => {
  assert.ok(
    createCompatibility,
    `expected one of ${CREATOR_CANDIDATES.join(', ')} to be exported as a function`,
  );
});

test('a compatible-families reader is re-exported from src/index.js', () => {
  assert.ok(
    readCompatibility,
    `expected one of ${READER_CANDIDATES.join(', ')} to be exported as a function`,
  );
});

// ---------------------------------------------------------------------------
// Recording and reading back compatibility
// ---------------------------------------------------------------------------

test('recording a compatible family can be read back for the accessory', () => {
  const db = freshDb();
  const accessory = seedAccessory(db);
  const [family] = families();

  createCompatibility(db, { accessoryId: accessory.id, family });

  const listed = familyList(readCompatibility(db, accessory.id));
  assert.ok(listed.includes(family), 'the recorded family should be listed for the accessory');
});

test('recording several families lists them all for the accessory', () => {
  const db = freshDb();
  const accessory = seedAccessory(db);
  const chosen = families().slice(0, 3);

  for (const family of chosen) {
    createCompatibility(db, { accessoryId: accessory.id, family });
  }

  const listed = familyList(readCompatibility(db, accessory.id)).sort();
  assert.deepEqual(
    listed,
    [...chosen].sort(),
    'every recorded compatible family should be listed for the accessory',
  );
});

test('the reader returns an empty list for an accessory with no recorded families', () => {
  const db = freshDb();
  const accessory = seedAccessory(db);

  const listed = readCompatibility(db, accessory.id);
  assert.ok(Array.isArray(listed), 'the reader should return an array');
  assert.deepEqual(familyList(listed), [], 'an accessory with no compatibility should list nothing');
});

test('compatibility is scoped per accessory (one accessory does not leak into another)', () => {
  const db = freshDb();
  const a = seedAccessory(db, 'Case');
  const b = seedAccessory(db, 'Charger');
  const [famA, famB] = families();

  createCompatibility(db, { accessoryId: a.id, family: famA });
  createCompatibility(db, { accessoryId: b.id, family: famB });

  const listedA = familyList(readCompatibility(db, a.id));
  assert.deepEqual(listedA.sort(), [famA].sort(), 'accessory A should list only its own family');
  assert.ok(!listedA.includes(famB), 'accessory A must not list accessory B compatibility');
});

// ---------------------------------------------------------------------------
// Validation: invalid accessory ids rejected
// ---------------------------------------------------------------------------

test('recording compatibility for a non-existent accessory id is rejected', () => {
  assert.ok(createCompatibility, 'the compatibility creator must be implemented');
  const db = freshDb();
  const [family] = families();

  assert.throws(
    () => createCompatibility(db, { accessoryId: 9999, family }),
    'recording compatibility for an unknown accessory id should throw',
  );
});

test('recording compatibility without an accessory id is rejected', () => {
  assert.ok(createCompatibility, 'the compatibility creator must be implemented');
  const db = freshDb();
  const [family] = families();

  assert.throws(
    () => createCompatibility(db, { family }),
    'a missing accessory id should be rejected',
  );
});

test('recording compatibility without a family is rejected', () => {
  assert.ok(createCompatibility, 'the compatibility creator must be implemented');
  const db = freshDb();
  const accessory = seedAccessory(db);

  assert.throws(
    () => createCompatibility(db, { accessoryId: accessory.id }),
    'a missing family should be rejected',
  );
});
