'use strict';

// Acceptance / integration tests: the Recommendations API endpoint.
//
// The recommendation engine (`model.recommend`) is exposed over HTTP as:
//
//   GET /devices/{id}/recommendations?customerId={customerId}
//
// The endpoint answers with the documented JSON contract:
//
//   {
//     deviceId: <number>,
//     customerId: <number>,
//     recommendations: [
//       { kind: 'plan' | 'bundle' | 'accessory', id, name, price, requirement },
//       ...
//     ],
//   }
//
// Each recommendation carries its attachment type (the REQUIRED / OPTIONAL
// `requirement` flag) and per-item pricing (a numeric `price`).
//
// The HTTP layer is expected to be exposed from `../src/server.js` as
// `createServer(db)`, returning a Node `http.Server` that has NOT yet started
// listening (the tests bind it to an ephemeral port).
//
// These tests are written BEFORE the endpoint exists and must fail until it is
// implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../src/index.js');
const { createServer } = require('../src/server.js');

// An existing prepaid customer, referenced by id in the query string.
const CUSTOMER_ID = 1;

// Spin up the API server on an ephemeral port against a fresh seeded database,
// invoke `fn` with a base URL, and always tear the server down afterwards.
async function withServer(setup, fn) {
  const db = model.createDatabase(':memory:');
  if (typeof setup === 'function') setup(db);

  const server = createServer(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    return await fn(baseUrl, db);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function recommendationsUrl(baseUrl, deviceId, customerId) {
  // Distinguish "not supplied" (default to CUSTOMER_ID) from an explicit
  // `undefined`, which callers use to omit customerId from the query string.
  if (arguments.length < 3) customerId = CUSTOMER_ID;
  const query = customerId === undefined ? '' : `?customerId=${customerId}`;
  return `${baseUrl}/devices/${deviceId}/recommendations${query}`;
}

// ---------------------------------------------------------------------------
// Documented JSON contract
// ---------------------------------------------------------------------------

test('GET /devices/{id}/recommendations returns 200 with JSON content type', async () => {
  await withServer(
    (db) => model.createDevice(db, { name: 'Phone X', price: 799 }),
    async (baseUrl, db) => {
      const [device] = model.getDevices(db);
      const res = await fetch(recommendationsUrl(baseUrl, device.id));

      assert.equal(res.status, 200, 'a known device should return 200');
      assert.match(
        res.headers.get('content-type') || '',
        /application\/json/i,
        'the endpoint must respond with JSON',
      );
    },
  );
});

test('response body matches the documented contract (deviceId, customerId, recommendations[])', async () => {
  await withServer(
    (db) => {
      const device = model.createDevice(db, { name: 'Phone X', price: 799 });
      const bundle = model.createBundle(db, { name: 'Insurance Bundle', price: 12 });
      const accessory = model.createAccessory(db, { name: 'Fast Charger', price: 29 });
      model.attach(db, {
        deviceId: device.id,
        bundleId: bundle.id,
        requirement: model.REQUIREMENT.REQUIRED,
      });
      model.attach(db, {
        deviceId: device.id,
        accessoryId: accessory.id,
        requirement: model.REQUIREMENT.OPTIONAL,
      });
    },
    async (baseUrl, db) => {
      const [device] = model.getDevices(db);
      const res = await fetch(recommendationsUrl(baseUrl, device.id));
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.deviceId, device.id, 'response should echo the requested device id');
      assert.equal(body.customerId, CUSTOMER_ID, 'response should echo the requested customer id');
      assert.ok(Array.isArray(body.recommendations), 'recommendations must be an array');
      assert.equal(body.recommendations.length, 2, 'expected a recommendation per relevant add-on');
    },
  );
});

// ---------------------------------------------------------------------------
// Required/optional flags and pricing fields are present on each item
// ---------------------------------------------------------------------------

test('every recommendation exposes an attachment type (REQUIRED/OPTIONAL) and numeric price', async () => {
  await withServer(
    (db) => {
      const device = model.createDevice(db, { name: 'Phone M', price: 999 });
      const requiredBundle = model.createBundle(db, { name: 'Device Protection', price: 12 });
      const optionalAccessory = model.createAccessory(db, { name: 'Protective Case', price: 24 });
      model.attach(db, {
        deviceId: device.id,
        bundleId: requiredBundle.id,
        requirement: model.REQUIREMENT.REQUIRED,
      });
      model.attach(db, {
        deviceId: device.id,
        accessoryId: optionalAccessory.id,
        requirement: model.REQUIREMENT.OPTIONAL,
      });
    },
    async (baseUrl, db) => {
      const [device] = model.getDevices(db);
      const res = await fetch(recommendationsUrl(baseUrl, device.id));
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.ok(body.recommendations.length > 0, 'expected recommendations to assert over');

      for (const rec of body.recommendations) {
        assert.ok(
          ['plan', 'bundle', 'accessory'].includes(rec.kind),
          'each recommendation declares its kind',
        );
        assert.equal(typeof rec.name, 'string', 'each recommendation exposes a name');
        assert.ok(rec.name.length > 0, 'recommendation name must not be empty');

        // Per-item pricing must be present and numeric.
        assert.ok(
          Object.prototype.hasOwnProperty.call(rec, 'price'),
          'each recommendation must include a price field',
        );
        assert.equal(typeof rec.price, 'number', 'price must be numeric');
        assert.ok(rec.price >= 0, 'price must be non-negative');

        // Attachment type (required/optional flag) must be present.
        assert.ok(
          Object.prototype.hasOwnProperty.call(rec, 'requirement'),
          'each recommendation must include a requirement flag',
        );
        assert.ok(
          rec.requirement === model.REQUIREMENT.REQUIRED ||
            rec.requirement === model.REQUIREMENT.OPTIONAL,
          'requirement flag must be REQUIRED or OPTIONAL',
        );
      }

      const requirements = new Set(body.recommendations.map((r) => r.requirement));
      assert.ok(
        requirements.has(model.REQUIREMENT.REQUIRED),
        'the payload should surface a REQUIRED attachment type',
      );
      assert.ok(
        requirements.has(model.REQUIREMENT.OPTIONAL),
        'the payload should surface an OPTIONAL attachment type',
      );
    },
  );
});

test('per-item pricing reflects the current catalog price of the add-on', async () => {
  await withServer(
    (db) => {
      const device = model.createDevice(db, { name: 'Phone P', price: 699 });
      const accessory = model.createAccessory(db, { name: 'Wireless Earbuds', price: 99 });
      model.attach(db, {
        deviceId: device.id,
        accessoryId: accessory.id,
        requirement: model.REQUIREMENT.OPTIONAL,
      });
    },
    async (baseUrl, db) => {
      const [device] = model.getDevices(db);
      const [accessory] = model.getAccessories(db);

      const res = await fetch(recommendationsUrl(baseUrl, device.id));
      const body = await res.json();

      const earbuds = body.recommendations.find(
        (r) => r.kind === 'accessory' && r.id === accessory.id,
      );
      assert.ok(earbuds, 'expected the attached accessory among the recommendations');
      assert.equal(earbuds.price, 99, 'the item should carry the accessory current price');
    },
  );
});

// ---------------------------------------------------------------------------
// Result-set scenarios
// ---------------------------------------------------------------------------

test('a device with no relevant add-ons returns an empty recommendations array', async () => {
  await withServer(
    (db) => model.createDevice(db, { name: 'Bare Phone', price: 199 }),
    async (baseUrl, db) => {
      const [device] = model.getDevices(db);
      const res = await fetch(recommendationsUrl(baseUrl, device.id));
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(body.recommendations, [], 'nothing attached should recommend nothing');
    },
  );
});

// ---------------------------------------------------------------------------
// Request validation and error contract
// ---------------------------------------------------------------------------

test('omitting customerId is rejected with a 400', async () => {
  await withServer(
    (db) => model.createDevice(db, { name: 'Phone C', price: 399 }),
    async (baseUrl, db) => {
      const [device] = model.getDevices(db);
      const res = await fetch(recommendationsUrl(baseUrl, device.id, undefined));

      assert.equal(res.status, 400, 'a missing customerId must be a client error');
    },
  );
});

test('an unknown device id returns a 404', async () => {
  await withServer(null, async (baseUrl) => {
    const res = await fetch(recommendationsUrl(baseUrl, 999999));
    assert.equal(res.status, 404, 'an unknown device must return 404');
  });
});

test('a non-numeric device id is rejected with a 400', async () => {
  await withServer(null, async (baseUrl) => {
    const res = await fetch(recommendationsUrl(baseUrl, 'not-a-number'));
    assert.equal(res.status, 400, 'a non-numeric device id must be a client error');
  });
});
