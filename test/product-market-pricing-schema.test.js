'use strict';

// Acceptance tests: a new migration introduces the `product_market_pricing`
// table, scoping each catalog item to a market with a market-currency price and
// a purchasable flag. A row's presence (plus its purchasable flag and the
// market's currency) is what satisfies the per-market availability, currency,
// and purchasability criteria.
//
// The migration is expected to follow the existing pattern in
// `src/migrations.js`: a monotonically increasing `version`, an `up(db)` that
// creates the table with CHECK constraints and supporting indexes, and
// bookkeeping recorded in `schema_migrations`.
//
// NOTE: the task brief calls this "migration version 4", but this branch
// already ships migrations 1-6 (4 = carts, 5 = orders, 6 = cart optional
// selections). The established suite requires a gap-free version sequence, so
// this per-market pricing migration is the next version in that sequence. The
// tests below therefore assert the *behaviour* of the migration and the
// gap-free invariant rather than pinning a specific (already-taken) number.
//
// These tests are written BEFORE implementation and must fail until the
// migration exists.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { MIGRATIONS } = require('../src/migrations.js');

// ---------------------------------------------------------------------------
// Schema-introspection helpers (mirrors the style used in migrations.test.js).
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

function tableSql(db, table) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return row ? row.sql : '';
}

// The list of key columns (in order) for a given index name.
function indexColumns(db, indexName) {
  return db
    .prepare(`PRAGMA index_info(${indexName})`)
    .all()
    .map((c) => c.name);
}

// All indexes declared on a table, each with its ordered key columns and
// whether it is UNIQUE.
function indexes(db, table) {
  return db
    .prepare(`PRAGMA index_list(${table})`)
    .all()
    .map((idx) => ({
      name: idx.name,
      unique: idx.unique === 1,
      columns: indexColumns(db, idx.name),
    }));
}

// True when `table` has any index whose key columns include `column`.
function hasIndexOn(db, table, column) {
  return indexes(db, table).some((idx) => idx.columns.includes(column));
}

// Extract the single-quoted literals a `CHECK (<column> IN (...))` clause
// constrains `column` to, so a test can exercise accepted values without
// hard-coding the exact vocabulary casing.
function checkAllowedValues(sql, column) {
  const clause = new RegExp(`${column}[^)]*IN\\s*\\(([^)]*)\\)`, 'i').exec(sql);
  if (!clause) return [];
  const literals = clause[1].match(/'([^']*)'/g) || [];
  return literals.map((s) => s.slice(1, -1));
}

// Seed a market so `product_market_pricing.market_code` foreign keys resolve.
function seedMarket(db, code = 'ZA') {
  db.prepare(
    `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, 'South Africa', 'ZAR', 'en-ZA', 0.15, 1, 'VAT');
  return code;
}

// ---------------------------------------------------------------------------
// Migration existence + gap-free sequence.
// ---------------------------------------------------------------------------

test('a per-market pricing migration exists and follows the established pattern', () => {
  const versions = MIGRATIONS.map((m) => m.version);

  // Versions remain a monotonically increasing, gap-free sequence from 1.
  const sorted = [...versions].sort((a, b) => a - b);
  const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
  assert.deepEqual(sorted, expected, 'migration versions should be a gap-free sequence from 1');

  // The pricing migration extends the sequence beyond the pre-existing 1-6.
  const maxVersion = Math.max(...versions);
  assert.ok(
    maxVersion >= 7,
    'expected a new migration (version >= 7) adding per-market pricing on top of migrations 1-6',
  );

  const migration = MIGRATIONS.find((m) => m.version === maxVersion);
  assert.equal(typeof migration.name, 'string', 'the pricing migration should have a name');
  assert.ok(migration.name.length > 0, 'the pricing migration name should be non-empty');
  assert.equal(typeof migration.up, 'function', 'the pricing migration should expose an up(db) function');
});

test('the pricing migration is recorded in schema_migrations after createDatabase', () => {
  const db = model.createDatabase(':memory:');
  const versions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  const maxVersion = Math.max(...MIGRATIONS.map((m) => m.version));
  assert.ok(
    maxVersion >= 7 && versions.includes(maxVersion),
    'the pricing migration version (>= 7) should be recorded in schema_migrations',
  );

  // The recorded set matches the declared set (gap-free, nothing skipped).
  const expected = Array.from({ length: versions.length }, (_, i) => i + 1);
  assert.deepEqual(versions, expected, 'recorded versions should be gap-free from 1');
});

// ---------------------------------------------------------------------------
// Table + columns.
// ---------------------------------------------------------------------------

test('the product_market_pricing table exists and is empty on a fresh database', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(tableExists(db, 'product_market_pricing'), 'product_market_pricing table should exist');
  const rows = db.prepare('SELECT * FROM product_market_pricing').all();
  assert.deepEqual(rows, [], 'product_market_pricing should be empty on a fresh db');
});

test('the product_market_pricing table has the expected columns', () => {
  const db = model.createDatabase(':memory:');
  const cols = columnInfo(db, 'product_market_pricing');

  for (const name of ['market_code', 'product_type', 'product_id', 'price', 'purchasable']) {
    assert.ok(cols[name], `product_market_pricing should have a "${name}" column`);
  }

  // price is a market-currency REAL amount.
  assert.match(
    String(cols.price.type).toUpperCase(),
    /REAL|NUM|FLOAT|DOUB/,
    'price should be a REAL/numeric column',
  );

  // product_id is an INTEGER catalog id.
  assert.match(
    String(cols.product_id.type).toUpperCase(),
    /INT/,
    'product_id should be an INTEGER column',
  );
});

// ---------------------------------------------------------------------------
// Referential integrity.
// ---------------------------------------------------------------------------

test('product_market_pricing.market_code references the markets table', () => {
  const db = model.createDatabase(':memory:');
  const fks = foreignKeys(db, 'product_market_pricing');

  const marketFk = fks.find((fk) => fk.from === 'market_code');
  assert.ok(marketFk, 'product_market_pricing.market_code should be a foreign key');
  assert.equal(marketFk.table, 'markets', 'market_code should reference the markets table');
  assert.equal(marketFk.to, 'code', 'market_code should reference markets(code)');
});

test('product_market_pricing foreign keys are enforced (unknown market rejected)', () => {
  const db = model.createDatabase(':memory:');
  // No market with this code exists, so the FK should reject the insert.
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('NOPE', firstProductType(db), 1, 100, 1),
    /FOREIGN KEY|constraint/i,
    'a pricing row for a non-existent market should violate the foreign key',
  );
});

// ---------------------------------------------------------------------------
// CHECK constraints.
// ---------------------------------------------------------------------------

test('product_market_pricing.product_type is constrained to device/plan/bundle/accessory', () => {
  const db = model.createDatabase(':memory:');
  const sql = tableSql(db, 'product_market_pricing');
  assert.match(sql, /CHECK\s*\(/i, 'product_market_pricing should declare a CHECK constraint');

  const allowed = checkAllowedValues(sql, 'product_type');
  assert.deepEqual(
    [...allowed].sort(),
    ['accessory', 'bundle', 'device', 'plan'],
    'product_type CHECK should enumerate exactly device/plan/bundle/accessory',
  );

  const market = seedMarket(db);

  // Each enumerated product type is accepted.
  for (const type of ['device', 'plan', 'bundle', 'accessory']) {
    assert.doesNotThrow(
      () =>
        db
          .prepare(
            `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(market, type, 1, 100, 1),
      `product_type "${type}" should be accepted`,
    );
  }

  // A value outside the enumeration is rejected.
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(market, 'gadget', 2, 100, 1),
    /CHECK|constraint/i,
    'an unknown product_type should violate the CHECK constraint',
  );
});

test('product_market_pricing.purchasable is constrained to the 0/1 flag values', () => {
  const db = model.createDatabase(':memory:');
  const market = seedMarket(db);

  // Both flag values are accepted (false = unsupported / payment-dependent).
  for (const flag of [0, 1]) {
    assert.doesNotThrow(
      () =>
        db
          .prepare(
            `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(market, firstProductType(db), 100 + flag, 100, flag),
      `purchasable = ${flag} should be accepted`,
    );
  }

  // A value other than 0/1 is rejected.
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(market, firstProductType(db), 999, 100, 2),
    /CHECK|constraint/i,
    'a purchasable value other than 0 or 1 should violate a CHECK constraint',
  );
});

// ---------------------------------------------------------------------------
// Indexes: unique (market_code, product_type, product_id) + market_code.
// ---------------------------------------------------------------------------

test('product_market_pricing has a unique index on (market_code, product_type, product_id)', () => {
  const db = model.createDatabase(':memory:');

  const composite = indexes(db, 'product_market_pricing').find(
    (idx) =>
      idx.unique &&
      idx.columns.length === 3 &&
      idx.columns.includes('market_code') &&
      idx.columns.includes('product_type') &&
      idx.columns.includes('product_id'),
  );
  assert.ok(
    composite,
    'expected a UNIQUE index covering (market_code, product_type, product_id)',
  );

  const market = seedMarket(db);
  const type = firstProductType(db);
  db.prepare(
    `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(market, type, 1, 100, 1);

  // Re-scoping the same (market, type, product) is rejected by the unique index.
  assert.throws(
    () =>
      db
        .prepare(
          `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(market, type, 1, 200, 0),
    /UNIQUE|constraint/i,
    'duplicate (market_code, product_type, product_id) should violate the unique index',
  );
});

test('product_market_pricing has an index on market_code for scoped queries', () => {
  const db = model.createDatabase(':memory:');
  assert.ok(
    hasIndexOn(db, 'product_market_pricing', 'market_code'),
    'product_market_pricing.market_code should be indexed for scoped lookups',
  );
});

// ---------------------------------------------------------------------------
// Availability semantics end-to-end.
// ---------------------------------------------------------------------------

test('the same product can be priced differently across markets', () => {
  const db = model.createDatabase(':memory:');
  seedMarket(db, 'ZA');
  db.prepare(
    `INSERT INTO markets (code, name, currency, default_language, tax_rate, tax_inclusive, tax_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('TZ', 'Tanzania', 'TZS', 'sw-TZ', 0.18, 0, 'VAT');

  const type = firstProductType(db);
  const insert = db.prepare(
    `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
     VALUES (?, ?, ?, ?, ?)`,
  );
  // Same catalog item, two markets, two prices — allowed because the unique
  // scope includes market_code.
  insert.run('ZA', type, 42, 18999.0, 1);
  insert.run('TZ', type, 42, 950000.0, 1);

  const za = db
    .prepare(
      `SELECT price, purchasable FROM product_market_pricing
       WHERE market_code = ? AND product_type = ? AND product_id = ?`,
    )
    .get('ZA', type, 42);
  assert.equal(za.price, 18999.0);
  assert.equal(za.purchasable, 1);

  const scoped = db
    .prepare('SELECT product_id FROM product_market_pricing WHERE market_code = ? ORDER BY product_id')
    .all('TZ');
  assert.deepEqual(
    scoped.map((r) => r.product_id),
    [42],
    'a market-scoped query should only see rows for that market',
  );
});

test('a non-purchasable offer (e.g. payment-dependent) is still recorded as available', () => {
  const db = model.createDatabase(':memory:');
  const market = seedMarket(db);
  const type = firstProductType(db);

  // Presence of the row = available in the market; purchasable = 0 marks it
  // as an unsupported or payment-dependent offer.
  db.prepare(
    `INSERT INTO product_market_pricing (market_code, product_type, product_id, price, purchasable)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(market, type, 7, 4999.0, 0);

  const row = db
    .prepare(
      `SELECT purchasable FROM product_market_pricing
       WHERE market_code = ? AND product_type = ? AND product_id = ?`,
    )
    .get(market, type, 7);
  assert.ok(row, 'the offer row should exist (available in the market)');
  assert.equal(row.purchasable, 0, 'the offer should be flagged non-purchasable');
});

test('re-running migrations after the pricing table exists is idempotent', () => {
  const db = model.createDatabase(':memory:');
  const { runMigrations } = require('../src/migrations.js');

  const before = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');
  assert.doesNotThrow(() => runMigrations(db), 're-running migrations should be safe');

  const after = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((r) => r.version);

  assert.deepEqual(after, before, 'schema_migrations should be unchanged after re-running');
  assert.ok(
    tableExists(db, 'product_market_pricing'),
    'product_market_pricing should still exist after re-running',
  );
});

// Pick a valid `product_type` value from the CHECK enumeration so inserts that
// do not care about the specific type stay decoupled from the vocabulary.
function firstProductType(db) {
  const allowed = checkAllowedValues(tableSql(db, 'product_market_pricing'), 'product_type');
  return allowed.length > 0 ? allowed[0] : 'device';
}
