'use strict';

// Acceptance tests: extend the `devices` schema with an `availability` status
// column and a `financing_eligible` indicator column.
//
// Contract exercised by these tests (authoritative for the implementation):
//  - A new migration (version > 2) adds two columns to `devices`:
//      * `availability`        TEXT, NOT NULL, DEFAULT 'IN_STOCK',
//                              CHECK (availability IN ('IN_STOCK','OUT_OF_STOCK','PREORDER'))
//      * `financing_eligible`  boolean/indicator, NOT NULL, DEFAULT falsey (0)
//  - `runMigrations` remains idempotent (safe to run repeatedly).
//  - `createDevice` accepts optional `availability` and `financingEligible`
//    inputs, applies sensible defaults, and returns both fields.
//  - `getDevices` returns both fields for every row, with `financingEligible`
//    surfaced as a JS boolean.
//
// These tests are written BEFORE implementation and must fail until the
// migration and query layer are updated.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS, runMigrations } = require('../src/migrations.js');

// ---------------------------------------------------------------------------
// Migration structure & idempotency
// ---------------------------------------------------------------------------

test('a new migration (version > 2) is registered for the device availability/financing columns', () => {
  const versions = MIGRATIONS.map((m) => m.version);
  const maxVersion = Math.max(...versions);
  assert.ok(maxVersion > 2, `expected a migration with version > 2, saw versions ${versions.join(', ')}`);

  // Versions remain unique and monotonic so ordering stays deterministic.
  assert.equal(new Set(versions).size, versions.length, 'migration versions must be unique');
});

test('runMigrations is idempotent: applying it repeatedly does not throw or re-run migrations', () => {
  const db = model.createDatabase(':memory:');

  const countMigrations = () =>
    db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;

  const before = countMigrations();
  assert.doesNotThrow(() => runMigrations(db), 'runMigrations should be safe to re-run');
  assert.doesNotThrow(() => runMigrations(db), 'runMigrations should be safe to re-run again');
  assert.equal(countMigrations(), before, 'repeat migration runs must not record duplicate versions');

  // The schema is still intact and queryable after repeated runs.
  assert.deepEqual(model.getDevices(db), []);
});

test('the devices table gains availability and financing_eligible columns', () => {
  const db = model.createDatabase(':memory:');
  const columns = db.prepare('PRAGMA table_info(devices)').all().map((c) => c.name);

  assert.ok(columns.includes('availability'), 'devices should have an `availability` column');
  assert.ok(
    columns.includes('financing_eligible'),
    'devices should have a `financing_eligible` column',
  );

  // Existing columns are preserved.
  for (const original of ['id', 'name', 'price']) {
    assert.ok(columns.includes(original), `devices should still have its \`${original}\` column`);
  }
});

// ---------------------------------------------------------------------------
// Schema-level CHECK constraint on availability
// ---------------------------------------------------------------------------

test('the availability column enforces a CHECK constraint at the schema level', () => {
  const db = model.createDatabase(':memory:');

  // A direct insert bypassing any app-layer validation must be rejected by the
  // schema CHECK when availability is not one of the known statuses.
  assert.throws(
    () =>
      db
        .prepare(
          'INSERT INTO devices (name, price, availability, financing_eligible) VALUES (?, ?, ?, ?)',
        )
        .run('Bad Device', 100, 'NOT_A_STATUS', 0),
    'inserting an unknown availability status should violate the CHECK constraint',
  );

  // Each of the documented statuses is accepted by the schema.
  for (const status of ['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER']) {
    assert.doesNotThrow(
      () =>
        db
          .prepare(
            'INSERT INTO devices (name, price, availability, financing_eligible) VALUES (?, ?, ?, ?)',
          )
          .run(`Device ${status}`, 100, status, 0),
      `availability "${status}" should satisfy the CHECK constraint`,
    );
  }
});

// ---------------------------------------------------------------------------
// createDevice: defaults
// ---------------------------------------------------------------------------

test('createDevice applies sensible defaults for availability and financingEligible', () => {
  const db = model.createDatabase(':memory:');

  const device = model.createDevice(db, { name: 'Aurora Phone 12', price: 899 });

  assert.equal(device.availability, 'IN_STOCK', 'availability should default to IN_STOCK');
  assert.equal(
    device.financingEligible,
    false,
    'financingEligible should default to false',
  );
  assert.equal(typeof device.financingEligible, 'boolean', 'financingEligible should be a boolean');

  // The pre-existing fields are still returned unchanged.
  assert.equal(device.name, 'Aurora Phone 12');
  assert.equal(device.price, 899);
  assert.equal(typeof device.id, 'number');
});

// ---------------------------------------------------------------------------
// createDevice: explicit values
// ---------------------------------------------------------------------------

test('createDevice persists and returns explicit availability and financingEligible values', () => {
  const db = model.createDatabase(':memory:');

  const preorder = model.createDevice(db, {
    name: 'Aurora Phone 13',
    price: 999,
    availability: 'PREORDER',
    financingEligible: true,
  });

  assert.equal(preorder.availability, 'PREORDER');
  assert.equal(preorder.financingEligible, true);

  const outOfStock = model.createDevice(db, {
    name: 'Aurora Tab S',
    price: 649,
    availability: 'OUT_OF_STOCK',
    financingEligible: false,
  });

  assert.equal(outOfStock.availability, 'OUT_OF_STOCK');
  assert.equal(outOfStock.financingEligible, false);
});

// ---------------------------------------------------------------------------
// getDevices: returns the new fields
// ---------------------------------------------------------------------------

test('getDevices returns availability and financingEligible for every device', () => {
  const db = model.createDatabase(':memory:');

  model.createDevice(db, { name: 'Default Device', price: 100 });
  model.createDevice(db, {
    name: 'Preorder Financeable',
    price: 1200,
    availability: 'PREORDER',
    financingEligible: true,
  });

  const devices = model.getDevices(db);
  assert.equal(devices.length, 2);

  for (const device of devices) {
    assert.ok(
      ['IN_STOCK', 'OUT_OF_STOCK', 'PREORDER'].includes(device.availability),
      `unexpected availability "${device.availability}"`,
    );
    assert.equal(
      typeof device.financingEligible,
      'boolean',
      'getDevices should surface financingEligible as a boolean',
    );
  }

  const byName = Object.fromEntries(devices.map((d) => [d.name, d]));
  assert.equal(byName['Default Device'].availability, 'IN_STOCK');
  assert.equal(byName['Default Device'].financingEligible, false);
  assert.equal(byName['Preorder Financeable'].availability, 'PREORDER');
  assert.equal(byName['Preorder Financeable'].financingEligible, true);
});

test('device availability and financing indicator survive a persistence round-trip', () => {
  const db = model.createDatabase(':memory:');

  const created = model.createDevice(db, {
    name: 'Round Trip',
    price: 500,
    availability: 'OUT_OF_STOCK',
    financingEligible: true,
  });

  const [fetched] = model.getDevices(db).filter((d) => d.id === created.id);
  assert.ok(fetched, 'expected the created device to be returned by getDevices');
  assert.equal(fetched.availability, 'OUT_OF_STOCK');
  assert.equal(fetched.financingEligible, true);
  assert.equal(fetched.availability, created.availability);
  assert.equal(fetched.financingEligible, created.financingEligible);
});
