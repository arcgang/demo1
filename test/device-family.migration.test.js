'use strict';

// Acceptance tests (schema level): a migration introduces a `family` attribute
// on devices and an `accessory_compatibility` relationship linking an accessory
// to a device family (and/or a specific device). The migration must apply
// idempotently — running it more than once is a safe no-op.
//
// Written BEFORE implementation: these must fail until the migration exists.

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const { MIGRATIONS, runMigrations } = require('../src/migrations.js');

function migratedDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  return db;
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function tableExists(db, name) {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined
  );
}

test('migration adds a `family` attribute to the devices table', () => {
  const db = migratedDb();
  const cols = columnNames(db, 'devices');
  assert.ok(cols.includes('family'), 'expected devices to have a `family` column');
});

test('migration creates an accessory_compatibility relationship keyed on accessory_id', () => {
  const db = migratedDb();

  assert.ok(
    tableExists(db, 'accessory_compatibility'),
    'expected an accessory_compatibility table to exist',
  );

  const cols = columnNames(db, 'accessory_compatibility');
  assert.ok(cols.includes('accessory_id'), 'compatibility rows must reference accessory_id');
  assert.ok(
    cols.includes('family') || cols.includes('device_id'),
    'compatibility rows must link to a device family or a specific device',
  );
});

test('a fresh database has no accessory_compatibility rows', () => {
  const db = migratedDb();
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM accessory_compatibility')
    .get().n;
  assert.equal(count, 0, 'a fresh database should have no compatibility rows');
});

test('schema migrates idempotently: running migrations twice is a safe no-op', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  runMigrations(db);
  // A second application must not throw (e.g. re-adding a column / table).
  assert.doesNotThrow(() => runMigrations(db), 'migrations must be safe to re-run');

  // The new schema exists exactly once and is still usable.
  assert.ok(columnNames(db, 'devices').includes('family'));
  assert.ok(tableExists(db, 'accessory_compatibility'));

  // Bookkeeping records each migration exactly once — no duplicate inserts.
  const applied = db
    .prepare('SELECT COUNT(*) AS n FROM schema_migrations')
    .get().n;
  assert.equal(applied, MIGRATIONS.length, 'each migration recorded exactly once');
});
