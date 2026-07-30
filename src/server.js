'use strict';

const http = require('node:http');

const model = require('./index.js');

// ---------------------------------------------------------------------------
// Recommendations API endpoint
// ---------------------------------------------------------------------------
//
// A thin HTTP layer over the recommendation engine (`model.recommend`). The
// only route is:
//
//   GET /devices/{id}/recommendations?customerId={customerId}
//
// Documented JSON contract (HTTP 200):
//
//   {
//     "deviceId": <number>,          // the requested device id
//     "customerId": <number>,        // the requested customer id
//     "recommendations": [
//       {
//         "kind": "plan" | "bundle" | "accessory",
//         "id": <number>,            // the add-on's catalog id
//         "name": <string>,          // human-readable add-on name
//         "price": <number>,         // current per-item catalog price (>= 0)
//         "requirement": "REQUIRED" | "OPTIONAL"  // attachment type
//       },
//       ...
//     ]
//   }
//
// Recommendations are ranked REQUIRED-first by the engine. A device with no
// relevant add-ons yields an empty `recommendations` array.
//
// Error contract (all bodies are JSON `{ "error": <message> }`):
//   400  malformed request  — non-numeric device id, or missing customerId
//   404  not found          — unknown device id, or an unrouted path
//   405  method not allowed — a non-GET method on the recommendations route

// Match `/devices/{id}/recommendations`, capturing the raw device id segment.
const ROUTE = /^\/devices\/([^/]+)\/recommendations\/?$/;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

// Parse a string to a positive integer id, or return null when it is not a
// clean non-negative integer (e.g. 'not-a-number', '1.5', '', '-3').
function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function handleRecommendations(db, deviceRaw, url, res) {
  const deviceId = parseId(deviceRaw);
  if (deviceId === null) {
    sendJson(res, 400, { error: 'device id must be a positive integer' });
    return;
  }

  const customerId = parseId(url.searchParams.get('customerId'));
  if (customerId === null) {
    sendJson(res, 400, { error: 'customerId query parameter is required' });
    return;
  }

  // The engine anchors recommendations to an existing device; surface a clean
  // 404 rather than an empty payload for a device that does not exist.
  const device = db.prepare('SELECT id FROM devices WHERE id = ?').get(deviceId);
  if (!device) {
    sendJson(res, 404, { error: `no device with id ${deviceId}` });
    return;
  }

  const { recommendations } = model.recommend(db, {
    deviceId,
    customer: { id: customerId },
  });

  sendJson(res, 200, { deviceId, customerId, recommendations });
}

// Build an (unstarted) HTTP server bound to a database. Callers are
// responsible for `server.listen(...)`.
function createServer(db) {
  return http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      sendJson(res, 400, { error: 'malformed request url' });
      return;
    }

    const match = ROUTE.exec(url.pathname);
    if (!match) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }

    try {
      handleRecommendations(db, match[1], url, res);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
}

module.exports = { createServer };
