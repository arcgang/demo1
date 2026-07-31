'use strict';

const { REQUIREMENT } = require('./requirement.js');

// Order lifecycle vocabulary, following the same enum-backed CHECK pattern as
// the requirement vocabulary. A confirmed cart becomes an order that begins
// PENDING (awaiting payment), advances to PAID and then IN_FULFILLMENT, and
// ends in a terminal COMPLETED or FAILED state.
const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  IN_FULFILLMENT: 'IN_FULFILLMENT',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));

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
  {
    version: 4,
    name: 'create_carts',
    up(db) {
      // Carts: an in-progress telecom configuration a shopper is building,
      // anchored to a device with an optional plan. `created_at` records when
      // the cart was first persisted and `updated_at` tracks the last time it
      // was touched, so a transient failure does not lose the selection and
      // stale carts can be reasoned about.
      db.exec(`
        CREATE TABLE carts (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id  INTEGER NOT NULL REFERENCES devices(id),
          plan_id    INTEGER          REFERENCES plans(id),
          created_at TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // Cart selected attachments: the OPTIONAL attachment ids a shopper has
      // selected for a cart. Required attachments are implied by the pairing
      // and need not be recorded here. Rows are removed with their parent cart.
      db.exec(`
        CREATE TABLE cart_selected_attachments (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          cart_id       INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
          attachment_id INTEGER NOT NULL REFERENCES attachments(id)
        );
      `);

      db.exec(`CREATE INDEX idx_carts_device ON carts(device_id);`);
      db.exec(`CREATE INDEX idx_csa_cart ON cart_selected_attachments(cart_id);`);
      db.exec(
        `CREATE INDEX idx_csa_attachment ON cart_selected_attachments(attachment_id);`,
      );
    },
  },
  {
    version: 5,
    name: 'create_orders',
    up(db) {
      // Orders: a confirmed cart persisted as an order, anchored to a device
      // with an optional plan. Each order carries a unique, human-readable
      // `reference` (e.g. ORD-0001) so it can be looked up and shared.
      //
      // Constraints encoded in the schema:
      //  - reference is unique so an order is addressable by its reference.
      //  - status must be one of the known lifecycle values (mirroring the
      //    requirement.js enum pattern via a CHECK constraint).
      //  - total is a non-negative REAL amount payable for the order.
      db.exec(`
        CREATE TABLE orders (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          reference  TEXT    NOT NULL UNIQUE,
          status     TEXT    NOT NULL CHECK (status IN (${ORDER_STATUS_VALUES.map(
            (v) => `'${v}'`,
          ).join(', ')})),
          device_id  INTEGER NOT NULL REFERENCES devices(id),
          plan_id    INTEGER          REFERENCES plans(id),
          total      REAL    NOT NULL DEFAULT 0 CHECK (total >= 0),
          created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // Order items: the itemized breakdown of a confirmed order. Each row
      // captures the add-on `kind` (bundle/accessory), the `source_id` pointing
      // back at the originating catalog row, the display `name`, the `price` at
      // the time of confirmation, and whether it was REQUIRED or OPTIONAL for
      // the pairing. Rows are removed with their parent order.
      db.exec(`
        CREATE TABLE order_items (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          kind        TEXT    NOT NULL,
          source_id   INTEGER,
          name        TEXT    NOT NULL,
          price       REAL    NOT NULL DEFAULT 0 CHECK (price >= 0),
          requirement TEXT    NOT NULL CHECK (requirement IN ('${REQUIREMENT.REQUIRED}', '${REQUIREMENT.OPTIONAL}'))
        );
      `);

      db.exec(`CREATE INDEX idx_orders_reference ON orders(reference);`);
      db.exec(`CREATE INDEX idx_order_items_order ON order_items(order_id);`);
    },
  },
  {
    version: 6,
    name: 'create_cart_optional_selections',
    up(db) {
      // Cart optional selections: durable storage for the OPTIONAL attachment
      // ids a shopper has selected on an in-progress cart, so a transient
      // failure does not lose their device/plan/optional-add-on configuration.
      //
      // Constraints encoded in the schema:
      //  - cart_id / attachment_id are foreign keys, so a selection can only
      //    reference a real cart and a real attachment.
      //  - (cart_id, attachment_id) is unique, so the same optional add-on can
      //    be selected at most once per cart.
      //  - rows are removed with their parent cart.
      db.exec(`
        CREATE TABLE cart_optional_selections (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          cart_id       INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
          attachment_id INTEGER NOT NULL REFERENCES attachments(id),
          UNIQUE (cart_id, attachment_id)
        );
      `);

      db.exec(
        `CREATE INDEX idx_cos_cart ON cart_optional_selections(cart_id);`,
      );
      db.exec(
        `CREATE INDEX idx_cos_attachment ON cart_optional_selections(attachment_id);`,
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

module.exports = { MIGRATIONS, runMigrations, ORDER_STATUS, ORDER_STATUS_VALUES };
