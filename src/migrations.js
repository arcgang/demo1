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
    name: 'add_device_family_and_accessory_compatibility',
    up(db) {
      // Devices gain a `family` attribute grouping models that share
      // accessories (e.g. all AURORA-family devices use the same charger).
      db.exec(`ALTER TABLE devices ADD COLUMN family TEXT;`);

      // Accessory compatibility: records that an accessory is compatible with a
      // device family and/or a specific device. At least one of `family` /
      // `device_id` must be present so a compatibility row always resolves to a
      // real target.
      db.exec(`
        CREATE TABLE accessory_compatibility (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          accessory_id INTEGER NOT NULL REFERENCES accessories(id),
          family       TEXT,
          device_id    INTEGER          REFERENCES devices(id),
          CHECK (family IS NOT NULL OR device_id IS NOT NULL)
        );
      `);

      db.exec(
        `CREATE INDEX idx_accessory_compatibility_family ON accessory_compatibility(family);`,
      );
      db.exec(
        `CREATE INDEX idx_accessory_compatibility_device ON accessory_compatibility(device_id);`,
      );
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
