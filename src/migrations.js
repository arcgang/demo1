'use strict';

const { REQUIREMENT } = require('./requirement.js');

// Ordered list of migrations. Each migration has a monotonically increasing
// `version` and an `up(db)` that applies its schema change. `runMigrations`
// tracks the applied versions in a `schema_migrations` bookkeeping table so it
// is safe to run repeatedly against the same database.
const MIGRATIONS = [
  {
    version: 1,
    name: 'create_catalog_entities',
    up(db) {
      // Devices: the primary purchasable item a recommendation is anchored to.
      db.exec(`
        CREATE TABLE devices (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT    NOT NULL,
          price REAL    NOT NULL DEFAULT 0 CHECK (price >= 0)
        );
      `);

      // Plans: service plans that can pair with a device.
      db.exec(`
        CREATE TABLE plans (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT    NOT NULL,
          price REAL    NOT NULL DEFAULT 0 CHECK (price >= 0)
        );
      `);

      // Bundles: grouped add-ons that can be attached to a device/plan.
      db.exec(`
        CREATE TABLE bundles (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT    NOT NULL,
          price REAL    NOT NULL DEFAULT 0 CHECK (price >= 0)
        );
      `);

      // Accessories: individual add-ons that can be attached to a device/plan.
      db.exec(`
        CREATE TABLE accessories (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT    NOT NULL,
          price REAL    NOT NULL DEFAULT 0 CHECK (price >= 0)
        );
      `);
    },
  },
  {
    version: 2,
    name: 'create_attachments_relationship',
    up(db) {
      // Attachments: the relationship recording that a bundle or accessory is
      // attachable to a device (optionally scoped to a specific plan) and
      // whether it is REQUIRED or OPTIONAL for that pairing.
      //
      // Constraints encoded in the schema:
      //  - requirement must be one of the known values (required/optional).
      //  - exactly at least one of bundle_id / accessory_id must be present so
      //    an attachment always references a real add-on.
      db.exec(`
        CREATE TABLE attachments (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id    INTEGER NOT NULL REFERENCES devices(id),
          plan_id      INTEGER          REFERENCES plans(id),
          bundle_id    INTEGER          REFERENCES bundles(id),
          accessory_id INTEGER          REFERENCES accessories(id),
          requirement  TEXT    NOT NULL CHECK (requirement IN ('${REQUIREMENT.REQUIRED}', '${REQUIREMENT.OPTIONAL}')),
          CHECK (bundle_id IS NOT NULL OR accessory_id IS NOT NULL)
        );
      `);

      db.exec(`CREATE INDEX idx_attachments_device ON attachments(device_id);`);
      db.exec(`CREATE INDEX idx_attachments_device_plan ON attachments(device_id, plan_id);`);
    },
  },
  {
    version: 3,
    name: 'create_markets',
    up(db) {
      // Markets: the MarketContext data object from the HLD, capturing per-market
      // localization (currency, default language) and tax configuration that
      // downstream pricing/checkout logic consumes.
      //
      // Constraints encoded in the schema:
      //  - code is unique (e.g. ZA/TZ) so a market is addressable by its code.
      //  - tax_rate is a non-negative REAL rate.
      //  - tax_inclusive is a 0/1 flag: whether displayed prices already
      //    include tax.
      db.exec(`
        CREATE TABLE markets (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          code             TEXT    NOT NULL UNIQUE,
          name             TEXT    NOT NULL,
          currency         TEXT    NOT NULL,
          default_language TEXT    NOT NULL,
          tax_rate         REAL    NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
          tax_inclusive    INTEGER NOT NULL DEFAULT 0 CHECK (tax_inclusive IN (0, 1)),
          tax_label        TEXT    NOT NULL
        );
      `);
    },
  },
];

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function appliedVersions(db) {
  const rows = db.prepare('SELECT version FROM schema_migrations').all();
  return new Set(rows.map((r) => r.version));
}

// Apply every migration that has not yet been recorded, in version order.
function runMigrations(db) {
  ensureMigrationsTable(db);
  const applied = appliedVersions(db);
  const ordered = [...MIGRATIONS].sort((a, b) => a.version - b.version);

  for (const migration of ordered) {
    if (applied.has(migration.version)) continue;
    migration.up(db);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
      migration.version,
      migration.name,
    );
  }
}

module.exports = { MIGRATIONS, runMigrations };
