'use strict';

// Acceptance tests: low-bandwidth performance budgets + constrained profile.
//
// This task is pure documentation/config (no frontend/backend exists yet). The
// single source of truth is a committed `perf-budgets.json` at the repo root,
// accompanied by a short human-readable note under `docs/`, so that measurement
// tooling AND reviewers agree on one set of numbers. Grounded in HLD §11.5.
//
// The committed config MUST capture:
//
//   Core Web Vitals budgets (per-page, at the p75 percentile):
//     * LCP <= 2.5s for the landing and category pages
//     * TTI <= 3.0s for the product, cart and checkout pages
//
//   API interaction budget (at the 95th percentile / p95):
//     * a response is shown within 2s
//     * the interaction completes within 5s
//
//   A reusable constrained low-bandwidth network / CPU throttling profile that
//   measurement tooling can apply directly:
//     * a device class (e.g. a low-end mobile class)
//     * network throttling: constrained down/up throughput + added latency
//     * CPU throttling: a slowdown multiplier (> 1x, i.e. slower than baseline)
//
// The shape below is the contract the implementation must satisfy. Values that
// the acceptance criteria pin exactly (2.5 / 3.0 / 2 / 5 and the p75 / p95
// percentiles, plus the page->metric mapping) are asserted exactly; the
// throttling numbers are asserted for internal consistency and for genuinely
// representing a *constrained low-bandwidth* environment.
//
// These tests are written BEFORE the config/docs exist and MUST fail until they
// are committed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const BUDGETS_PATH = path.join(REPO_ROOT, 'perf-budgets.json');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Read + parse the committed budgets config. A missing/invalid file fails the
// test with a clear message (which is the expected red state before the config
// is committed).
function loadBudgets() {
  assert.ok(
    fs.existsSync(BUDGETS_PATH),
    'expected a committed perf-budgets.json at the repository root',
  );
  const raw = fs.readFileSync(BUDGETS_PATH, 'utf8');
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, 'perf-budgets.json must be valid JSON');
  return parsed;
}

// Normalise a { threshold, unit } pair (or a bare number of seconds) to seconds
// so the config may store either seconds or milliseconds.
function toSeconds(value, unit) {
  const n = typeof value === 'number' ? value : Number(value);
  assert.ok(Number.isFinite(n), `expected a finite numeric threshold, got ${JSON.stringify(value)}`);
  const u = (unit || 's').toString().toLowerCase();
  if (u === 's' || u === 'sec' || u === 'seconds') return n;
  if (u === 'ms' || u === 'millisecond' || u === 'milliseconds') return n / 1000;
  assert.fail(`unsupported time unit: ${JSON.stringify(unit)} (use "s" or "ms")`);
  return n;
}

// Normalise a percentile that may be written as "p75" / "P75" / 75.
function toPercentile(value) {
  if (typeof value === 'number') return value;
  const m = /^p?(\d+(?:\.\d+)?)$/i.exec(String(value).trim());
  assert.ok(m, `expected a percentile like "p75" or 75, got ${JSON.stringify(value)}`);
  return Number(m[1]);
}

// The budgets collection may be an array of entries or an object keyed by
// metric; expose it as an array of normalised entries either way.
function budgetEntries(config) {
  const budgets = config.budgets;
  assert.ok(budgets, 'perf-budgets.json must expose a "budgets" section');
  if (Array.isArray(budgets)) return budgets;
  if (budgets && typeof budgets === 'object') {
    return Object.entries(budgets).map(([metric, v]) => ({ metric, ...v }));
  }
  assert.fail('"budgets" must be an array or an object keyed by metric');
  return [];
}

// The pages a budget entry applies to, normalised to a lowercase array.
function entryPages(entry) {
  const pages = entry.pages || entry.page || entry.routes || entry.route;
  const arr = Array.isArray(pages) ? pages : pages == null ? [] : [pages];
  return arr.map((p) => String(p).toLowerCase());
}

// Find the budget entry for a metric that covers a given page.
function findBudget(config, metric, page) {
  return budgetEntries(config).find(
    (e) =>
      String(e.metric || '').toUpperCase() === metric.toUpperCase() &&
      entryPages(e).includes(page.toLowerCase()),
  );
}

// ---------------------------------------------------------------------------
// The config file itself
// ---------------------------------------------------------------------------

test('a perf-budgets.json config is committed at the repository root', () => {
  assert.ok(fs.existsSync(BUDGETS_PATH), 'perf-budgets.json should exist at the repo root');
});

test('perf-budgets.json is valid, parseable JSON', () => {
  const config = loadBudgets();
  assert.equal(typeof config, 'object');
  assert.notEqual(config, null);
});

test('perf-budgets.json declares a budgets section and a throttling profile', () => {
  const config = loadBudgets();
  assert.ok(config.budgets, 'config should have a "budgets" section');
  assert.ok(config.profile, 'config should have a reusable "profile" section');
});

// ---------------------------------------------------------------------------
// LCP budget: <= 2.5s p75 for the landing and category pages
// ---------------------------------------------------------------------------

for (const page of ['landing', 'category']) {
  test(`LCP budget for the ${page} page is <= 2.5s at p75`, () => {
    const config = loadBudgets();
    const entry = findBudget(config, 'LCP', page);
    assert.ok(entry, `expected an LCP budget covering the "${page}" page`);

    const seconds = toSeconds(entry.threshold ?? entry.budget ?? entry.value, entry.unit);
    assert.equal(seconds, 2.5, `LCP budget for ${page} should be 2.5s`);

    assert.equal(
      toPercentile(entry.percentile ?? entry.p),
      75,
      `LCP budget for ${page} should be measured at p75`,
    );
  });
}

// ---------------------------------------------------------------------------
// TTI budget: <= 3.0s p75 for the product, cart and checkout pages
// ---------------------------------------------------------------------------

for (const page of ['product', 'cart', 'checkout']) {
  test(`TTI budget for the ${page} page is <= 3.0s at p75`, () => {
    const config = loadBudgets();
    const entry = findBudget(config, 'TTI', page);
    assert.ok(entry, `expected a TTI budget covering the "${page}" page`);

    const seconds = toSeconds(entry.threshold ?? entry.budget ?? entry.value, entry.unit);
    assert.equal(seconds, 3.0, `TTI budget for ${page} should be 3.0s`);

    assert.equal(
      toPercentile(entry.percentile ?? entry.p),
      75,
      `TTI budget for ${page} should be measured at p75`,
    );
  });
}

test('the LCP and TTI budgets do not cross-cover each other\'s pages', () => {
  const config = loadBudgets();
  // Landing/category are LCP pages, not TTI pages, and vice-versa. This guards
  // against a mapping that lumps every metric onto every page.
  assert.ok(!findBudget(config, 'TTI', 'landing'), 'landing is an LCP page, not a TTI page');
  assert.ok(!findBudget(config, 'LCP', 'checkout'), 'checkout is a TTI page, not an LCP page');
});

// ---------------------------------------------------------------------------
// API interaction budget: response within 2s, complete within 5s, at p95
// ---------------------------------------------------------------------------

test('perf-budgets.json declares an API interaction budget', () => {
  const config = loadBudgets();
  assert.ok(config.api, 'config should have an "api" interaction budget section');
});

test('the API budget shows a response within 2s (at p95)', () => {
  const config = loadBudgets();
  const api = config.api;
  assert.ok(api, 'expected an api budget');

  const respond = toSeconds(
    api.respondWithin ?? api.responseWithin ?? api.response ?? api.firstResponse,
    api.unit,
  );
  assert.equal(respond, 2, 'API response should be shown within 2s');

  assert.equal(toPercentile(api.percentile ?? api.p), 95, 'API budget should be measured at p95');
});

test('the API budget completes within 5s (at p95)', () => {
  const config = loadBudgets();
  const api = config.api;
  assert.ok(api, 'expected an api budget');

  const complete = toSeconds(api.completeWithin ?? api.complete ?? api.completion, api.unit);
  assert.equal(complete, 5, 'API interaction should complete within 5s');

  assert.equal(toPercentile(api.percentile ?? api.p), 95, 'API budget should be measured at p95');
});

test('the API response-time budget is tighter than the completion budget', () => {
  const config = loadBudgets();
  const api = config.api;
  const respond = toSeconds(
    api.respondWithin ?? api.responseWithin ?? api.response ?? api.firstResponse,
    api.unit,
  );
  const complete = toSeconds(api.completeWithin ?? api.complete ?? api.completion, api.unit);
  assert.ok(respond < complete, 'the "respond within" budget must be smaller than "complete within"');
});

// ---------------------------------------------------------------------------
// Reusable constrained low-bandwidth network / CPU profile
// ---------------------------------------------------------------------------

test('the profile names a device class', () => {
  const config = loadBudgets();
  const profile = config.profile;
  assert.ok(profile, 'expected a "profile" section');

  const deviceClass = profile.deviceClass ?? profile.device ?? profile.deviceCategory;
  assert.equal(typeof deviceClass, 'string', 'profile should declare a device class as a string');
  assert.ok(deviceClass.trim().length > 0, 'device class must not be empty');
});

test('the profile declares network throttling parameters', () => {
  const config = loadBudgets();
  const net = config.profile && config.profile.network;
  assert.ok(net, 'profile should declare a "network" throttling section');

  const down = net.downloadThroughputKbps ?? net.downloadKbps ?? net.throughputKbps;
  const up = net.uploadThroughputKbps ?? net.uploadKbps;
  const latency = net.latencyMs ?? net.rttMs ?? net.requestLatencyMs;

  assert.ok(Number.isFinite(down) && down > 0, 'download throughput (Kbps) should be a positive number');
  assert.ok(Number.isFinite(up) && up > 0, 'upload throughput (Kbps) should be a positive number');
  assert.ok(Number.isFinite(latency) && latency > 0, 'added latency (ms) should be a positive number');
});

test('the network profile genuinely represents a constrained low-bandwidth link', () => {
  const config = loadBudgets();
  const net = config.profile.network;

  const down = net.downloadThroughputKbps ?? net.downloadKbps ?? net.throughputKbps;
  const up = net.uploadThroughputKbps ?? net.uploadKbps;
  const latency = net.latencyMs ?? net.rttMs ?? net.requestLatencyMs;

  // A "low-bandwidth" profile must be constrained well below broadband. A
  // slow/regular-3G-class link tops out around ~3 Mbps down; we cap at that so
  // the profile cannot be quietly set to a fast connection.
  assert.ok(down <= 3000, 'a low-bandwidth download throughput should be <= 3000 Kbps (3G-class)');
  assert.ok(up <= down, 'upload throughput should not exceed download throughput');
  // Constrained mobile links carry meaningful latency.
  assert.ok(latency >= 100, 'a constrained mobile link should model >= 100ms of latency');
});

test('the profile declares a CPU slowdown multiplier greater than 1x', () => {
  const config = loadBudgets();
  const cpu = config.profile && config.profile.cpu;
  assert.ok(cpu, 'profile should declare a "cpu" throttling section');

  const multiplier =
    cpu.slowdownMultiplier ?? cpu.cpuSlowdownMultiplier ?? cpu.multiplier ?? cpu.rate;
  assert.ok(Number.isFinite(multiplier), 'CPU throttling should expose a numeric slowdown multiplier');
  assert.ok(
    multiplier > 1,
    'a constrained (low-end device) CPU profile must be slower than baseline (multiplier > 1x)',
  );
});

// ---------------------------------------------------------------------------
// A shared docs note lives under docs/
// ---------------------------------------------------------------------------

test('a docs/ note documents the performance budgets and profile', () => {
  assert.ok(fs.existsSync(DOCS_DIR), 'expected a docs/ directory');
  assert.ok(fs.statSync(DOCS_DIR).isDirectory(), 'docs/ should be a directory');

  const mdFiles = fs.readdirSync(DOCS_DIR).filter((f) => f.toLowerCase().endsWith('.md'));
  assert.ok(mdFiles.length > 0, 'expected at least one Markdown note under docs/');

  const combined = mdFiles
    .map((f) => fs.readFileSync(path.join(DOCS_DIR, f), 'utf8'))
    .join('\n')
    .toLowerCase();

  // The note must reference the budgets so reviewers share the same numbers.
  assert.match(combined, /performance budget/i, 'the docs note should discuss the performance budgets');
  assert.match(combined, /\blcp\b/i, 'the docs note should mention LCP');
  assert.match(combined, /\btti\b/i, 'the docs note should mention TTI');
  assert.match(combined, /2\.5/, 'the docs note should reference the 2.5s LCP budget');
  assert.match(combined, /3\.0|3\b/, 'the docs note should reference the 3.0s TTI budget');
  assert.match(combined, /p75/i, 'the docs note should reference the p75 percentile');
  assert.match(combined, /p95|95%/i, 'the docs note should reference the p95 / 95% API percentile');

  // ...and the constrained low-bandwidth profile.
  assert.match(
    combined,
    /low[- ]?bandwidth|throttl|constrained/i,
    'the docs note should describe the constrained low-bandwidth profile',
  );
});

test('the docs note points at perf-budgets.json as the single source of truth', () => {
  const mdFiles = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.md'));
  const combined = mdFiles
    .map((f) => fs.readFileSync(path.join(DOCS_DIR, f), 'utf8'))
    .join('\n');

  assert.match(
    combined,
    /perf-budgets\.json/,
    'the docs note should reference perf-budgets.json so config + docs stay in sync',
  );
});
