'use strict';

const { DatabaseSync } = require('node:sqlite');

const { REQUIREMENT, REQUIREMENT_VALUES, isValidRequirement } = require('./requirement.js');
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

// Devices carry an optional `family` attribute (a group of models that share
// accessories) in addition to name/price, so they get a dedicated creator.
function createDevice(db, { name, price, family } = {}) {
  assertName(name);
  const finalPrice = normalizePrice(price);
  const finalFamily = family === undefined ? null : family;
  const info = db
    .prepare('INSERT INTO devices (name, price, family) VALUES (?, ?, ?)')
    .run(name, finalPrice, finalFamily);
  return { id: Number(info.lastInsertRowid), name, price: finalPrice, family: finalFamily };
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

// Devices expose their `family` attribute alongside name/price.
function getDevices(db) {
  return db.prepare('SELECT id, name, price, family FROM devices ORDER BY id').all();
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

// ---------------------------------------------------------------------------
// Accessory compatibility
// ---------------------------------------------------------------------------

// Record that an accessory is compatible with a device family and/or a specific
// device. At least one of `family` / `deviceId` must be provided so the mapping
// resolves to a real target (mirrors the schema CHECK).
function recordAccessoryCompatibility(db, { accessoryId, family, deviceId } = {}) {
  if (accessoryId === undefined || accessoryId === null) {
    throw new Error('accessoryId is required');
  }
  const finalFamily = family ?? null;
  const finalDeviceId = deviceId ?? null;
  if (finalFamily === null && finalDeviceId === null) {
    throw new Error('compatibility must reference a device family or a specific device');
  }

  const info = db
    .prepare(
      `INSERT INTO accessory_compatibility (accessory_id, family, device_id)
       VALUES (?, ?, ?)`,
    )
    .run(accessoryId, finalFamily, finalDeviceId);

  return {
    id: Number(info.lastInsertRowid),
    accessoryId,
    family: finalFamily,
    deviceId: finalDeviceId,
  };
}

// Shape a compatibility row joined against its accessory into the object the
// application layer consumes, carrying the family compatibility cue.
function shapeCompatibleAccessoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    family: row.family,
  };
}

// Query the accessories compatible with a device family. Each result carries
// the accessory catalog fields plus the `family` compatibility cue.
function getCompatibleAccessoriesForFamily(db, family) {
  const rows = db
    .prepare(
      `SELECT ac.id, ac.name, ac.price, c.family AS family
       FROM accessory_compatibility c
       JOIN accessories ac ON ac.id = c.accessory_id
       WHERE c.family = ?
       ORDER BY ac.id`,
    )
    .all(family);
  return rows.map(shapeCompatibleAccessoryRow);
}

// Query the accessories compatible with a device. An accessory is compatible if
// it is mapped to the device's family or bound directly to the device itself.
function getCompatibleAccessories(db, deviceId) {
  const device = db
    .prepare('SELECT id, family FROM devices WHERE id = ?')
    .get(deviceId);
  if (device === undefined) return [];

  const rows = db
    .prepare(
      `SELECT ac.id, ac.name, ac.price, c.family AS family
       FROM accessory_compatibility c
       JOIN accessories ac ON ac.id = c.accessory_id
       WHERE c.device_id = ?
          OR (c.family IS NOT NULL AND c.family = ?)
       ORDER BY ac.id`,
    )
    .all(deviceId, device.family);
  return rows.map(shapeCompatibleAccessoryRow);
}

module.exports = {
  REQUIREMENT,
  REQUIREMENT_VALUES,
  isValidRequirement,
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
  recordAccessoryCompatibility,
  getCompatibleAccessories,
  getCompatibleAccessoriesForFamily,
  recommend,
  recalculateCart,
  seed,
};
