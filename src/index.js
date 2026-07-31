'use strict';

const { DatabaseSync } = require('node:sqlite');

const { REQUIREMENT, REQUIREMENT_VALUES, isValidRequirement } = require('./requirement.js');
const {
  SIM_OFFER_TYPE,
  SIM_OFFER_TYPE_VALUES,
  isValidSimOfferType,
} = require('./sim-offer.js');
const {
  MILESTONE,
  MILESTONE_VALUES,
  isValidMilestone,
  STATUS_STATE,
  STATUS_STATE_VALUES,
  isValidStatusState,
} = require('./status.js');
const {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  isValidOrderStatus,
  ORDER_NEXT_STEPS,
} = require('./order-status.js');
const {
  DONOR_NETWORK,
  DONOR_NETWORK_VALUES,
  isValidDonorNetwork,
  isValidDonorOperator,
  OWNERSHIP_TYPE,
  OWNERSHIP_TYPE_VALUES,
  isValidOwnershipType,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_VALUES,
  isValidVerificationStatus,
  PORTING_OUTCOME,
  PORTING_OUTCOME_VALUES,
  isValidPortingOutcome,
} = require('./porting.js');
const {
  AUDIT_EVENT_TYPE,
  AUDIT_EVENT_TYPE_VALUES,
  isValidAuditEventType,
  CONSENT_PURPOSE,
  CONSENT_PURPOSE_VALUES,
  isValidConsentPurpose,
  JOURNEY,
  JOURNEY_VALUES,
  isValidJourney,
} = require('./audit.js');
const {
  REASON_CODE,
  REASON_CODE_VALUES,
  CATEGORY,
  CATEGORY_VALUES,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
  getReasonMeta,
  isValidReasonCode,
} = require('./reason-codes.js');
const { AppError, fromReasonCode } = require('./app-error.js');
const { toUserFacingError } = require('./user-facing-error.js');
const { runMigrations } = require('./migrations.js');
const { seed } = require('./seed.js');
const { recommend } = require('./recommend.js');
const { recalculateCart } = require('./cart.js');
const { resolveMarket } = require('./market.js');
const { formatPrice, formatMarketPrice } = require('./currency.js');
const { generateOrderReference } = require('./order-reference.js');
const { verify } = require('./verification-adapter.js');

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

const createDevice = makeCreator('devices');
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

const getDevices = makeLister('devices');
const getPlans = makeLister('plans');
const getBundles = makeLister('bundles');
const getAccessories = makeLister('accessories');

// ---------------------------------------------------------------------------
// SIM/eSIM offers
// ---------------------------------------------------------------------------

// Shape a raw sim_offers row into the object the application layer consumes,
// exposing the SIM/ESIM type, price, availability, and the onboarding-
// implication flags as booleans.
function shapeSimOfferRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    price: row.price,
    availability: row.availability,
    requiresVerification: Boolean(row.requires_verification),
    activationRequired: Boolean(row.activation_required),
  };
}

// Persist a SIM/eSIM offer row and return the shaped offer. `name` is required,
// `type` must be one of the SIM/ESIM vocabulary, `price` is validated like a
// catalog price (defaults to 0, must be non-negative), and the onboarding flags
// `requiresVerification` (KYC/RICA) and `activationRequired` are stored as 0/1.
function createSimOffer(
  db,
  {
    name,
    type,
    price,
    availability,
    requiresVerification = false,
    activationRequired = false,
  } = {},
) {
  assertName(name);
  if (!isValidSimOfferType(type)) {
    throw new Error(
      `type must be one of ${SIM_OFFER_TYPE_VALUES.join(', ')}; received "${type}"`,
    );
  }
  if (typeof availability !== 'string' || availability.trim() === '') {
    throw new Error('availability is required');
  }
  const finalPrice = normalizePrice(price);
  const requiresVerificationFlag = requiresVerification ? 1 : 0;
  const activationRequiredFlag = activationRequired ? 1 : 0;

  const info = db
    .prepare(
      `INSERT INTO sim_offers (name, type, price, availability, requires_verification, activation_required)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(name, type, finalPrice, availability, requiresVerificationFlag, activationRequiredFlag);

  return {
    id: Number(info.lastInsertRowid),
    name,
    type,
    price: finalPrice,
    availability,
    requiresVerification: Boolean(requiresVerificationFlag),
    activationRequired: Boolean(activationRequiredFlag),
  };
}

// List the persisted SIM/eSIM offers (ordered by id), each shaped with its
// type, price, availability, and onboarding flags.
function getSimOffers(db) {
  return db
    .prepare(
      `SELECT id, name, type, price, availability, requires_verification, activation_required
       FROM sim_offers ORDER BY id`,
    )
    .all()
    .map(shapeSimOfferRow);
}

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
// Orders
// ---------------------------------------------------------------------------

// Shape a raw order row into the object the application layer consumes,
// mirroring the makeCreator/shapeRow conventions used for the catalog above.
function shapeOrderRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    deviceId: row.device_id,
    planId: row.plan_id,
    total: row.total,
  };
}

const ORDER_SELECT =
  'SELECT id, reference, status, device_id, plan_id, total FROM orders';

// Persist a confirmed cart as an order row and return the shaped order. A
// unique `order_reference` is generated (from the next order sequence and the
// current time) when `orderReference` is not supplied; `deviceId` is required
// and `total` is validated like a catalog price (defaults to 0, must be a
// non-negative number). A freshly created order begins PENDING.
function createOrder(db, { deviceId, planId, total, orderReference } = {}) {
  if (deviceId === undefined || deviceId === null) {
    throw new Error('deviceId is required');
  }
  const finalTotal = normalizePrice(total);

  let reference = orderReference;
  if (reference === undefined || reference === null) {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM orders').get();
    reference = generateOrderReference({ sequence: count, timestamp: Date.now() });
  }

  const status = ORDER_STATUS.PENDING;
  const info = db
    .prepare(
      `INSERT INTO orders (reference, status, device_id, plan_id, total)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(reference, status, deviceId, planId ?? null, finalTotal);

  return {
    id: Number(info.lastInsertRowid),
    reference,
    status,
    deviceId,
    planId: planId ?? null,
    total: finalTotal,
  };
}

// Look up a persisted order by its unique reference, returning the shaped order
// or undefined when no order carries that reference.
function getOrderByReference(db, orderReference) {
  const row = db.prepare(`${ORDER_SELECT} WHERE reference = ?`).get(orderReference);
  return shapeOrderRow(row);
}

module.exports = {
  REQUIREMENT,
  REQUIREMENT_VALUES,
  isValidRequirement,
  SIM_OFFER_TYPE,
  SIM_OFFER_TYPE_VALUES,
  isValidSimOfferType,
  MILESTONE,
  MILESTONE_VALUES,
  isValidMilestone,
  STATUS_STATE,
  STATUS_STATE_VALUES,
  isValidStatusState,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  isValidOrderStatus,
  ORDER_NEXT_STEPS,
  DONOR_NETWORK,
  DONOR_NETWORK_VALUES,
  isValidDonorNetwork,
  isValidDonorOperator,
  OWNERSHIP_TYPE,
  OWNERSHIP_TYPE_VALUES,
  isValidOwnershipType,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_VALUES,
  isValidVerificationStatus,
  PORTING_OUTCOME,
  PORTING_OUTCOME_VALUES,
  isValidPortingOutcome,
  AUDIT_EVENT_TYPE,
  AUDIT_EVENT_TYPE_VALUES,
  isValidAuditEventType,
  CONSENT_PURPOSE,
  CONSENT_PURPOSE_VALUES,
  isValidConsentPurpose,
  JOURNEY,
  JOURNEY_VALUES,
  isValidJourney,
  REASON_CODE,
  REASON_CODE_VALUES,
  CATEGORY,
  CATEGORY_VALUES,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
  getReasonMeta,
  isValidReasonCode,
  AppError,
  fromReasonCode,
  toUserFacingError,
  createDatabase,
  createDevice,
  createPlan,
  createBundle,
  createAccessory,
  createSimOffer,
  getSimOffers,
  getDevices,
  getPlans,
  getBundles,
  getAccessories,
  attach,
  getAttachmentsForDevice,
  getAttachmentsForDevicePlan,
  recommend,
  recalculateCart,
  resolveMarket,
  formatPrice,
  formatMarketPrice,
  generateOrderReference,
  createOrder,
  getOrderByReference,
  verify,
  seed,
};
