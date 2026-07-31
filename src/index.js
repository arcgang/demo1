'use strict';

const { DatabaseSync } = require('node:sqlite');

const { REQUIREMENT, REQUIREMENT_VALUES, isValidRequirement } = require('./requirement.js');
const { AVAILABILITY, AVAILABILITY_VALUES, isValidAvailability } = require('./availability.js');
const { runMigrations } = require('./migrations.js');
const { seed } = require('./seed.js');
const { recommend } = require('./recommend.js');
const { recalculateCart } = require('./cart.js');

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

// Open (or create) a database and bring its schema up to date. `location` may
// be a file path or ':memory:' for an ephemeral in-memory database.
function createDatabase(location = ':memory:') {
  const db = new DatabaseSync(location);
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Catalog entity creation
// ---------------------------------------------------------------------------

function assertName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('name is required');
  }
}

function normalizePrice(price) {
  const value = price === undefined || price === null ? 0 : price;
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error('price must be a non-negative number');
  }
  return value;
}

function makeCreator(table) {
  return function create(db, { name, price } = {}) {
    assertName(name);
    const finalPrice = normalizePrice(price);
    const info = db
      .prepare(`INSERT INTO ${table} (name, price) VALUES (?, ?)`)
      .run(name, finalPrice);
    return { id: Number(info.lastInsertRowid), name, price: finalPrice };
  };
}

function normalizeAvailability(availability) {
  if (availability === undefined || availability === null) {
    return AVAILABILITY.IN_STOCK;
  }
  if (!isValidAvailability(availability)) {
    throw new Error(
      `availability must be one of ${AVAILABILITY_VALUES.join(', ')}; received "${availability}"`,
    );
  }
  return availability;
}

// Devices carry the shared name/price fields plus their own merchandising
// signals (availability status and financing eligibility), so they get a
// bespoke creator rather than the generic one.
function createDevice(db, { name, price, availability, financingEligible } = {}) {
  assertName(name);
  const finalPrice = normalizePrice(price);
  const finalAvailability = normalizeAvailability(availability);
  const finalFinancingEligible = Boolean(financingEligible);
  const info = db
    .prepare(
      `INSERT INTO devices (name, price, availability, financing_eligible)
       VALUES (?, ?, ?, ?)`,
    )
    .run(name, finalPrice, finalAvailability, finalFinancingEligible ? 1 : 0);
  return {
    id: Number(info.lastInsertRowid),
    name,
    price: finalPrice,
    availability: finalAvailability,
    financingEligible: finalFinancingEligible,
  };
}

const createPlan = makeCreator('plans');
const createBundle = makeCreator('bundles');
const createAccessory = makeCreator('accessories');

// ---------------------------------------------------------------------------
// Catalog queries
// ---------------------------------------------------------------------------

function makeLister(table) {
  return function list(db) {
    return db.prepare(`SELECT id, name, price FROM ${table} ORDER BY id`).all();
  };
}

// Devices expose their availability status and financing indicator alongside
// the shared fields; `financing_eligible` is stored as 0/1 and surfaced as a
// JS boolean.
function getDevices(db) {
  return db
    .prepare(
      'SELECT id, name, price, availability, financing_eligible FROM devices ORDER BY id',
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      availability: row.availability,
      financingEligible: Boolean(row.financing_eligible),
    }));
}

const getPlans = makeLister('plans');
const getBundles = makeLister('bundles');
const getAccessories = makeLister('accessories');

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

// Attach a bundle and/or accessory to a device (optionally scoped to a plan),
// recording whether the add-on is REQUIRED or OPTIONAL for that pairing.
//
// The required-vs-optional constraint is validated here (in addition to the
// schema CHECK) so callers get a clear, early error rather than a raw SQL
// constraint failure.
function attach(db, { deviceId, planId, bundleId, accessoryId, requirement } = {}) {
  if (requirement === undefined || requirement === null) {
    throw new Error('requirement is mandatory (must be REQUIRED or OPTIONAL)');
  }
  if (!isValidRequirement(requirement)) {
    throw new Error(
      `requirement must be one of ${REQUIREMENT_VALUES.join(', ')}; received "${requirement}"`,
    );
  }
  if (deviceId === undefined || deviceId === null) {
    throw new Error('deviceId is required');
  }
  if (
    (bundleId === undefined || bundleId === null) &&
    (accessoryId === undefined || accessoryId === null)
  ) {
    throw new Error('an attachment must reference at least one add-on (a bundle or an accessory)');
  }

  const info = db
    .prepare(
      `INSERT INTO attachments (device_id, plan_id, bundle_id, accessory_id, requirement)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(deviceId, planId ?? null, bundleId ?? null, accessoryId ?? null, requirement);

  return {
    id: Number(info.lastInsertRowid),
    deviceId,
    planId: planId ?? null,
    bundleId: bundleId ?? null,
    accessoryId: accessoryId ?? null,
    requirement,
  };
}

// Shape a raw attachment row (joined against its add-on) into the object the
// application layer consumes. `price` is resolved from whichever add-on the
// attachment references.
function shapeAttachmentRow(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    planId: row.plan_id,
    bundleId: row.bundle_id,
    accessoryId: row.accessory_id,
    requirement: row.requirement,
    kind: row.bundle_id != null ? 'bundle' : 'accessory',
    name: row.bundle_name ?? row.accessory_name,
    price: row.bundle_price ?? row.accessory_price,
  };
}

const ATTACHMENT_SELECT = `
  SELECT
    a.id,
    a.device_id,
    a.plan_id,
    a.bundle_id,
    a.accessory_id,
    a.requirement,
    b.name  AS bundle_name,
    b.price AS bundle_price,
    ac.name  AS accessory_name,
    ac.price AS accessory_price
  FROM attachments a
  LEFT JOIN bundles     b  ON b.id  = a.bundle_id
  LEFT JOIN accessories ac ON ac.id = a.accessory_id
`;

// Query the attachable bundles/accessories for a device, each carrying its
// REQUIRED/OPTIONAL flag and price. Pass `{ requirement }` to filter to a
// single requirement level.
function getAttachmentsForDevice(db, deviceId, { requirement } = {}) {
  if (requirement !== undefined && !isValidRequirement(requirement)) {
    throw new Error(`requirement filter must be one of ${REQUIREMENT_VALUES.join(', ')}`);
  }

  let sql = `${ATTACHMENT_SELECT} WHERE a.device_id = ?`;
  const params = [deviceId];
  if (requirement !== undefined) {
    sql += ' AND a.requirement = ?';
    params.push(requirement);
  }
  sql += ' ORDER BY a.id';

  return db.prepare(sql).all(...params).map(shapeAttachmentRow);
}

// Query the attachments scoped to a specific device/plan pairing.
function getAttachmentsForDevicePlan(db, deviceId, planId, { requirement } = {}) {
  if (requirement !== undefined && !isValidRequirement(requirement)) {
    throw new Error(`requirement filter must be one of ${REQUIREMENT_VALUES.join(', ')}`);
  }

  let sql = `${ATTACHMENT_SELECT} WHERE a.device_id = ? AND a.plan_id IS ?`;
  const params = [deviceId, planId ?? null];
  if (requirement !== undefined) {
    sql += ' AND a.requirement = ?';
    params.push(requirement);
  }
  sql += ' ORDER BY a.id';

  return db.prepare(sql).all(...params).map(shapeAttachmentRow);
}

module.exports = {
  REQUIREMENT,
  REQUIREMENT_VALUES,
  isValidRequirement,
  AVAILABILITY,
  AVAILABILITY_VALUES,
  isValidAvailability,
  createDatabase,
  createDevice,
  createPlan,
  createBundle,
  createAccessory,
  getDevices,
  getPlans,
  getBundles,
  getAccessories,
  attach,
  getAttachmentsForDevice,
  getAttachmentsForDevicePlan,
  recommend,
  recalculateCart,
  seed,
};
