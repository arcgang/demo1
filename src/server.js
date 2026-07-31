'use strict';

// Minimal BFF-style REST HTTP layer (HLD: Node/TypeScript, REST/JSON; realized
// here in the repo's CommonJS + node:sqlite conventions).
//
// `createApp` bootstraps the server: it opens and seeds the existing database
// (unless a handle is supplied), wires JSON request/response middleware, and
// exposes a route-registration seam the catalog endpoints will plug into. The
// only business endpoint so far is `GET /health`, which reports 200 with
// dependency status. The returned app can be spun up on an ephemeral port with
// `listen()` and torn back down with `close()` (server + owned DB).

const http = require('node:http');

// Build a `{ status, body }` -> HTTP response writer that always emits JSON so
// every route (and the framework's own 400/404) shares one response shape.
function sendJson(res, status, body) {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// Read the full request body and JSON-parse it. Resolves `{ body }` for an
// empty or well-formed JSON body, or `{ error }` when the body is not valid
// JSON so the caller can answer 400.
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') {
        resolve({ body: undefined });
        return;
      }
      try {
        resolve({ body: JSON.parse(text) });
      } catch {
        resolve({ error: 'malformed JSON request body' });
      }
    });
    req.on('error', () => resolve({ error: 'could not read request body' }));
  });
}

// Bootstrap the application. With no `db` supplied the app owns a freshly
// opened, seeded database and closes it on teardown; a caller-supplied handle
// is reused as-is (not reseeded) and left open for the caller to manage.
function createApp(options = {}) {
  const { db: suppliedDb } = options;
  const model = require('./index.js');

  const ownsDb = !suppliedDb;
  const db = suppliedDb || model.createDatabase(':memory:');
  if (ownsDb) {
    model.seed(db);
  }

  // The app object is declared up front so route handlers registered during
  // bootstrap (e.g. /health) can reference it.
  const app = {};

  // Registered routes keyed by "METHOD PATH" so the HTTP method is part of
  // matching (a GET must not dispatch a POST-only route).
  const routes = new Map();

  function registerRoute(method, path, handler) {
    routes.set(`${method.toUpperCase()} ${path}`, handler);
    return app;
  }

  async function dispatch(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const key = `${req.method.toUpperCase()} ${url.pathname}`;
    const handler = routes.get(key);

    if (!handler) {
      sendJson(res, 404, { error: 'not found', path: url.pathname });
      return;
    }

    // JSON request middleware: parse the body up front and reject malformed
    // JSON with a 400 before the handler runs.
    const { body, error } = await readJsonBody(req);
    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const ctx = { req, res, db, body, query: url.searchParams };
    const result = await handler(ctx);
    const { status = 200, body: responseBody = null } = result || {};
    sendJson(res, status, responseBody);
  }

  const server = http.createServer((req, res) => {
    dispatch(req, res).catch((err) => {
      sendJson(res, 500, { error: 'internal server error', message: err && err.message });
    });
  });

  // Health endpoint: 200 with overall status plus per-dependency status.
  registerRoute('GET', '/health', () => ({
    status: 200,
    body: { status: 'ok', dependencies: { database: 'up' } },
  }));

  // Listen on `port` (0 for an OS-assigned ephemeral port) and resolve the
  // bound port once the server is accepting connections.
  function listen(port = 0) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve({ port: server.address().port });
      });
    });
  }

  // Tear down: stop accepting connections and, when the app owns the database,
  // close it too.
  function close() {
    const closeServer = new Promise((resolve) => {
      if (server.listening) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    return closeServer.then(() => {
      if (ownsDb) {
        db.close();
      }
    });
  }

  Object.assign(app, { db, server, registerRoute, listen, close });
  return app;
}

module.exports = { createApp };
