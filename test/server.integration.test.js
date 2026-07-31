'use strict';

// Acceptance tests (integration): the minimal BFF-style REST HTTP layer.
//
// Per the HLD this introduces a Node/TypeScript-shaped REST/JSON server (here
// realized in the repository's CommonJS + node:test + node:sqlite conventions):
//   - an app bootstrap (`createApp`) that opens and seeds the existing DB,
//   - JSON request/response middleware,
//   - a route-registration pattern the catalog endpoints can plug into,
//   - a `GET /health` endpoint returning 200 with dependency status,
//   - a test harness able to spin the app up (listen on an ephemeral port) and
//     tear it back down (close server + DB).
//
// There are no business endpoints yet beyond health. These tests are written
// BEFORE implementation and must fail until the HTTP layer exists.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const model = require('../src/index.js');

// ---------------------------------------------------------------------------
// Harness: spin an app up on an ephemeral port and guarantee teardown.
// ---------------------------------------------------------------------------

// Start an app listening on an OS-assigned port and hand back its base URL.
async function startApp(options) {
  const app = model.createApp(options);
  const { port } = await app.listen(0);
  assert.equal(typeof port, 'number', 'listen() should resolve the bound port');
  assert.ok(port > 0, 'listen(0) should bind a real, non-zero ephemeral port');
  return { app, base: `http://127.0.0.1:${port}` };
}

// Run `fn` against a freshly started app, tearing it down no matter what.
async function withApp(options, fn) {
  const started = await startApp(options);
  try {
    await fn(started);
  } finally {
    await started.app.close();
  }
}

// Fetch helper returning { status, contentType, body } with a JSON-parsed body
// where possible.
async function request(base, path, init) {
  const res = await fetch(base + path, init);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, contentType: res.headers.get('content-type'), body };
}

// ---------------------------------------------------------------------------
// Bootstrap surface
// ---------------------------------------------------------------------------

test('the model exposes the HTTP layer entry points', () => {
  assert.equal(typeof model.createApp, 'function', 'expected createApp to be exported');
});

test('createApp opens and seeds the existing database', () => {
  const app = model.createApp();
  try {
    assert.ok(app.db, 'the app should expose the database handle it opened');
    // The bootstrap seeds the sample catalog so business endpoints have data.
    assert.ok(
      model.getDevices(app.db).length > 0,
      'createApp should seed the catalog (seeded devices expected)',
    );
    assert.ok(
      model.getPlans(app.db).length > 0,
      'createApp should seed the catalog (seeded plans expected)',
    );
  } finally {
    app.close();
  }
});

test('createApp accepts a caller-supplied database handle without reseeding it', () => {
  const db = model.createDatabase(':memory:');
  const app = model.createApp({ db });
  try {
    assert.equal(app.db, db, 'createApp({ db }) should reuse the supplied handle');
    assert.deepEqual(
      model.getDevices(app.db),
      [],
      'a supplied (empty) db should not be auto-seeded out from under the caller',
    );
  } finally {
    app.close();
  }
});

test('the app exposes an underlying Node http.Server', async () => {
  await withApp(undefined, ({ app }) => {
    assert.ok(app.server instanceof http.Server, 'app.server should be a Node http.Server');
  });
});

// ---------------------------------------------------------------------------
// Spin-up / tear-down
// ---------------------------------------------------------------------------

test('the harness can spin the app up and tear it down', async () => {
  const { app, base } = await startApp();

  // Up: the health endpoint answers while listening.
  const up = await request(base, '/health');
  assert.equal(up.status, 200, 'health should answer 200 while the app is up');

  // Down: after close(), the port no longer accepts connections.
  await app.close();
  await assert.rejects(
    fetch(base + '/health'),
    'no connection should be accepted after the app is torn down',
  );
});

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

test('GET /health returns 200 with JSON dependency status', async () => {
  await withApp(undefined, async ({ base }) => {
    const res = await request(base, '/health');

    assert.equal(res.status, 200, 'GET /health should return 200');
    assert.match(
      res.contentType || '',
      /application\/json/,
      'health response should be JSON',
    );
    assert.equal(typeof res.body, 'object', 'health body should be a JSON object');
    assert.equal(res.body.status, 'ok', 'health should report an overall status of "ok"');

    assert.ok(res.body.dependencies, 'health should report a dependencies object');
    assert.equal(
      res.body.dependencies.database,
      'up',
      'health should report the database dependency as "up"',
    );
  });
});

// ---------------------------------------------------------------------------
// JSON middleware
// ---------------------------------------------------------------------------

test('JSON middleware parses a JSON request body and serializes the response', async () => {
  await withApp(undefined, async ({ app, base }) => {
    app.registerRoute('POST', '/echo', (ctx) => ({ status: 200, body: { received: ctx.body } }));

    const res = await request(base, '/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world', n: 7 }),
    });

    assert.equal(res.status, 200);
    assert.match(res.contentType || '', /application\/json/, 'response should be JSON');
    assert.deepEqual(
      res.body.received,
      { hello: 'world', n: 7 },
      'the handler should receive the parsed JSON body via ctx.body',
    );
  });
});

test('JSON middleware rejects a malformed JSON body with 400', async () => {
  await withApp(undefined, async ({ app, base }) => {
    app.registerRoute('POST', '/echo', (ctx) => ({ status: 200, body: { received: ctx.body } }));

    const res = await request(base, '/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ this is not json',
    });

    assert.equal(res.status, 400, 'a malformed JSON body should be rejected with 400');
    assert.equal(typeof res.body, 'object', 'the 400 response should still be a JSON object');
  });
});

// ---------------------------------------------------------------------------
// Route-registration pattern (the seam catalog endpoints plug into)
// ---------------------------------------------------------------------------

test('registered routes are dispatched and can read the app database via ctx', async () => {
  await withApp(undefined, async ({ app, base }) => {
    // A stand-in for the future catalog endpoints: it plugs into the same
    // registration pattern and reads from the seeded database on the context.
    app.registerRoute('GET', '/api/devices', (ctx) => ({
      status: 200,
      body: { devices: model.getDevices(ctx.db) },
    }));

    const res = await request(base, '/api/devices');

    assert.equal(res.status, 200, 'the registered route should be dispatched');
    assert.match(res.contentType || '', /application\/json/, 'response should be JSON');
    assert.ok(Array.isArray(res.body.devices), 'the route should return the device list');
    assert.ok(
      res.body.devices.length > 0,
      'the route should see the seeded catalog through ctx.db',
    );
  });
});

test('an unregistered route returns a 404 JSON response', async () => {
  await withApp(undefined, async ({ base }) => {
    const res = await request(base, '/api/nope');
    assert.equal(res.status, 404, 'an unknown route should return 404');
    assert.equal(typeof res.body, 'object', 'the 404 response should be a JSON object');
  });
});

test('the HTTP method is part of route matching', async () => {
  await withApp(undefined, async ({ app, base }) => {
    app.registerRoute('POST', '/api/things', () => ({ status: 201, body: { created: true } }));

    // The path exists, but only for POST — a GET must not match it.
    const wrongMethod = await request(base, '/api/things');
    assert.equal(wrongMethod.status, 404, 'GET on a POST-only route should not match');

    const rightMethod = await request(base, '/api/things', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(rightMethod.status, 201, 'POST on the registered route should dispatch');
    assert.equal(rightMethod.body.created, true);
  });
});
