'use strict';

// Acceptance tests: a new migration introduces the SIM/eSIM offer data model:
//
//   sim_offers                 an offer with a name, a SIM/ESIM fulfilment_type
//                              (CHECK constrained), a non-negative price, and a
//                              nullable default_plan_id FK to plans.
//   sim_offer_eligible_plans   a join table modelling the associated plan
//                              choices available for each offer (sim_offer_id
//                              FK, plan_id FK).
//
// The migration is expected to follow the existing pattern in
// `src/migrations.js`: a monotonically increasing `version`, an `up(db)` that
// creates the tables with CHECK constraints, and bookkeeping recorded in
// `schema_migrations`. The fulfilment-type vocabulary lives in a shared frozen
// constant (`src/fulfilmentType.js`), mirroring `src/requirement.js`.
//
// These tests are written BEFORE implementation and must fail until the
// migration exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS, runMigrations } = require('../src/migrations.js');
const { FULFILMENT_TYPE } = require('../src/fulfilmentType.js');

// ---------------------------------------------------------------------------
// Schema introspection helpers (via SQLite PRAGMAs).
// ---------------------------------------------------------------------------

function columnInfo(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  const byName = {};
  for (const row of rows) byName[row.name] = row;
  return byName;
}

function foreignKeys(db, table) {
  return db.prepare(`PRAGMA foreign_key_list(${table})`).all();
}

function tableExists(db, table) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
}

// Locate the migration that introduces the sim_offers schema. The migration is
// keyed by the table(s) it creates rather than a hard-coded version number, so
// the test stays correct as the migration list grows.
function simOffersMigration() {
  return MIGRATIONS.find(
    (m) => typeof m.name === 'string' && /sim.?offer/i.test(m.name),
  );
}

// ---------------------------------------------------------------------------
// Migration bookkeeping / pattern
// ---------------------------------------------------------------------------

test('a sim_offers migration exists and follows the established pattern', () => {
  const migration = simOffersMigration();

  assert.ok(migration, 'expected a migration that creates the sim_offers schema');
  assert.equal(typeof migration.version, 'number', 'migration should have a numeric version');
  assert.equal(typeof migration.name, 'string', 'migration should have a name');
  assert.ok(migration.name.length > 0, 'migration name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'migration should expose an up(db) function');
});

test('migration versions remain a gap-free sequence starting at 1', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be a gap-free sequence from 1');
});

test('the sim_offers migration is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const migration = simOffersMigration();
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  const versions = rows.map((r) => r.version);
  assert.ok(
    versions.includes(migration.version),
    `version ${migration.version} should be recorded in schema_migrations`,
  );
});

// ---------------------------------------------------------------------------
// sim_offers table
// ---------------------------------------------------------------------------

test('the sim_offers table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'sim_offers'), 'sim_offers table should exist');
  const rows = db.prepare('SELECT * FROM sim_offers').all();
  assert.deepEqual(rows, [], 'sim_offers table should be empty on a fresh db');
});

test('the sim_offers table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'sim_offers');

  for (const name of ['id', 'name', 'fulfilment_type', 'price', 'default_plan_id']) {
    assert.ok(cols[name], `sim_offers table should have a "${name}" column`);
  }

  // price is a numeric (REAL) column.
  assert.match(
    String(cols.price.type).toUpperCase(),
    /REAL|NUM|FLOAT|DOUB/,
    'price should be a REAL/numeric column',
  );
});

test('sim_offers.default_plan_id is nullable and references plans', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'sim_offers');

  // notnull === 0 means the column allows NULL.
  assert.equal(cols.default_plan_id.notnull, 0, 'default_plan_id should be nullable');

  const fks = foreignKeys(db, 'sim_offers');
  const planFk = fks.find((fk) => fk.from === 'default_plan_id');
  assert.ok(planFk, 'sim_offers.default_plan_id should be a foreign key');
  assert.equal(planFk.table, 'plans', 'default_plan_id should reference the plans table');
});

test('a valid sim_offer row can be inserted with a null default plan and read back', () => {
  const db = model.createDatabase(':memory:');
  db.prepare(
    `INSERT INTO sim_offers (name, fulfilment_type, price) VALUES (?, ?, ?)`,
  ).run('Prepaid Starter SIM', FULFILMENT_TYPE.SIM, 0);

  const row = db.prepare('SELECT * FROM sim_offers WHERE name = ?').get('Prepaid Starter SIM');
  assert.equal(row.name, 'Prepaid Starter SIM');
  assert.equal(row.fulfilment_type, 'SIM');
  assert.equal(row.price, 0);
  assert.equal(row.default_plan_id, null, 'default_plan_id should be nullable / null when omitted');
});

test('a sim_offer can reference an existing plan as its default plan', () => {
  const db = model.createDatabase(':memory:');
  const plan = model.createPlan(db, { name: 'Unlimited 20GB', price: 799 });

  db.prepare(
    `INSERT INTO sim_offers (name, fulfilment_type, price, default_plan_id) VALUES (?, ?, ?, ?)`,
  ).run('eSIM Contract', FULFILMENT_TYPE.ESIM, 149.99, plan.id);

  const row = db.prepare('SELECT * FROM sim_offers WHERE name = ?').get('eSIM Contract');
  assert.equal(row.fulfilment_type, 'ESIM');
  assert.equal(row.price, 149.99);
  assert.equal(row.default_plan_id, plan.id);
});

test('sim_offers.fulfilment_type is constrained to SIM/ESIM (CHECK constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(`INSERT INTO sim_offers (name, fulfilment_type, price) VALUES (?, ?, ?)`)
        .run('Bad Offer', 'PHYSICAL', 10),
    /CHECK|constraint/i,
    'an unknown fulfilment_type should violate a CHECK constraint',
  );
});

test('sim_offers.fulfilment_type rejects lowercase / malformed values (CHECK constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(`INSERT INTO sim_offers (name, fulfilment_type, price) VALUES (?, ?, ?)`)
        .run('Bad Offer', 'sim', 10),
    /CHECK|constraint/i,
    'a lowercase fulfilment_type should violate a CHECK constraint',
  );
});

test('sim_offers.price must be non-negative (CHECK constraint)', () => {
  const db = model.createDatabase(':memory:');
  assert.throws(
    () =>
      db
        .prepare(`INSERT INTO sim_offers (name, fulfilment_type, price) VALUES (?, ?, ?)`)
        .run('Negative Offer', FULFILMENT_TYPE.SIM, -1),
    /CHECK|constraint/i,
    'a negative price should violate a CHECK constraint',
  );
});

test('sim_offers.default_plan_id foreign key is enforced', () => {
  const db = model.createDatabase(':memory:');
  // No plan with id 999 exists, so the FK should reject the insert.
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO sim_offers (name, fulfilment_type, price, default_plan_id) VALUES (?, ?, ?, ?)`,
        )
        .run('Dangling Offer', FULFILMENT_TYPE.ESIM, 10, 999),
    /FOREIGN KEY|constraint/i,
    'referencing a non-existent plan should violate the foreign key',
  );
});

// ---------------------------------------------------------------------------
// sim_offer_eligible_plans join table
// ---------------------------------------------------------------------------

test('the sim_offer_eligible_plans join table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(
    tableExists(db, 'sim_offer_eligible_plans'),
    'sim_offer_eligible_plans table should exist',
  );
  const rows = db.prepare('SELECT * FROM sim_offer_eligible_plans').all();
  assert.deepEqual(rows, [], 'sim_offer_eligible_plans table should be empty on a fresh db');
});

test('the sim_offer_eligible_plans table has sim_offer_id and plan_id columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'sim_offer_eligible_plans');

  for (const name of ['sim_offer_id', 'plan_id']) {
    assert.ok(cols[name], `sim_offer_eligible_plans table should have a "${name}" column`);
  }
});

test('sim_offer_eligible_plans references sim_offers and plans', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'sim_offer_eligible_plans');

  const offerFk = fks.find((fk) => fk.from === 'sim_offer_id');
  assert.ok(offerFk, 'sim_offer_eligible_plans.sim_offer_id should be a foreign key');
  assert.equal(offerFk.table, 'sim_offers', 'sim_offer_id should reference the sim_offers table');

  const planFk = fks.find((fk) => fk.from === 'plan_id');
  assert.ok(planFk, 'sim_offer_eligible_plans.plan_id should be a foreign key');
  assert.equal(planFk.table, 'plans', 'plan_id should reference the plans table');
});

test('an offer and its eligible plan choices persist end-to-end', () => {
  const db = model.createDatabase(':memory:');

  const planA = model.createPlan(db, { name: 'Unlimited 20GB', price: 799 });
  const planB = model.createPlan(db, { name: 'Red Premium', price: 1099 });

  const offerInfo = db
    .prepare(
      `INSERT INTO sim_offers (name, fulfilment_type, price, default_plan_id) VALUES (?, ?, ?, ?)`,
    )
    .run('eSIM Contract', FULFILMENT_TYPE.ESIM, 149.99, planA.id);
  const offerId = Number(offerInfo.lastInsertRowid);

  const insertEligible = db.prepare(
    `INSERT INTO sim_offer_eligible_plans (sim_offer_id, plan_id) VALUES (?, ?)`,
  );
  insertEligible.run(offerId, planA.id);
  insertEligible.run(offerId, planB.id);

  const eligible = db
    .prepare('SELECT plan_id FROM sim_offer_eligible_plans WHERE sim_offer_id = ? ORDER BY plan_id')
    .all(offerId)
    .map((r) => r.plan_id);

  assert.deepEqual(
    eligible,
    [planA.id, planB.id].sort((a, b) => a - b),
    'both eligible plan choices should be persisted for the offer',
  );
});

test('sim_offer_eligible_plans foreign keys are enforced', () => {
  const db = model.createDatabase(':memory:');
  const plan = model.createPlan(db, { name: 'Unlimited 20GB', price: 799 });

  // A dangling sim_offer_id must be rejected.
  assert.throws(
    () =>
      db
        .prepare(`INSERT INTO sim_offer_eligible_plans (sim_offer_id, plan_id) VALUES (?, ?)`)
        .run(999, plan.id),
    /FOREIGN KEY|constraint/i,
    'referencing a non-existent sim_offer should violate the foreign key',
  );

  const offerInfo = db
    .prepare(`INSERT INTO sim_offers (name, fulfilment_type, price) VALUES (?, ?, ?)`)
    .run('Prepaid Starter SIM', FULFILMENT_TYPE.SIM, 0);
  const offerId = Number(offerInfo.lastInsertRowid);

  // A dangling plan_id must be rejected.
  assert.throws(
    () =>
      db
        .prepare(`INSERT INTO sim_offer_eligible_plans (sim_offer_id, plan_id) VALUES (?, ?)`)
        .run(offerId, 999),
    /FOREIGN KEY|constraint/i,
    'referencing a non-existent plan should violate the foreign key',
  );
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('running migrations a second time is idempotent (no error, schema unchanged)', () => {
  const db = model.createDatabase(':memory:');

  const before = db
    .prepare(`SELECT version FROM schema_migrations ORDER BY version`)
    .all()
    .map((r) => r.version);

  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const after = db
    .prepare(`SELECT version FROM schema_migrations ORDER BY version`)
    .all()
    .map((r) => r.version);

  assert.deepEqual(after, before, 'schema_migrations should be unchanged after re-running');
  assert.ok(tableExists(db, 'sim_offers'), 'sim_offers table should still exist after re-running');
  assert.ok(
    tableExists(db, 'sim_offer_eligible_plans'),
    'sim_offer_eligible_plans table should still exist after re-running',
  );
});
