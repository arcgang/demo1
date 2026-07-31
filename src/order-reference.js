'use strict';

// Order reference generator utility.
//
// This helper is PURE — it performs no DB access and reads no global clock or
// random source. Every input (the order `sequence` and a `timestamp`) is
// passed as an argument, so the same inputs always yield the same reference
// and distinct inputs always yield distinct references. That makes it
// deterministic and unit-testable in isolation, matching the explicit-
// validation, db-free style of the other helpers (e.g. src/currency.js).

// Encode a non-negative integer as an upper-cased base-36 string ([0-9A-Z]),
// which keeps the reference short and human-readable.
function encodeSegment(value) {
  return value.toString(36).toUpperCase();
}

// Build a unique, human-readable order reference of the form
// `ORD-<timestamp>-<sequence>`, where each trailing segment is the base-36
// encoding of the corresponding argument. Because both the timestamp and the
// sequence are encoded, the reference is fully determined by — and unique to —
// its (sequence, timestamp) pair.
function generateOrderReference({ sequence, timestamp } = {}) {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error('sequence must be a non-negative integer');
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    throw new Error('timestamp must be a finite number');
  }

  return `ORD-${encodeSegment(timestamp)}-${encodeSegment(sequence)}`;
}

module.exports = { generateOrderReference };
