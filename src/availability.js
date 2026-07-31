'use strict';

// The device availability vocabulary shared by the schema (CHECK constraint)
// and the application layer. A device is either IN_STOCK (available now),
// OUT_OF_STOCK (temporarily unavailable) or PREORDER (orderable ahead of
// release). New devices default to IN_STOCK unless stated otherwise.
const AVAILABILITY = Object.freeze({
  IN_STOCK: 'IN_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  PREORDER: 'PREORDER',
});

const AVAILABILITY_VALUES = Object.freeze(Object.values(AVAILABILITY));

const DEFAULT_AVAILABILITY = AVAILABILITY.IN_STOCK;

function isValidAvailability(value) {
  return AVAILABILITY_VALUES.includes(value);
}

module.exports = {
  AVAILABILITY,
  AVAILABILITY_VALUES,
  DEFAULT_AVAILABILITY,
  isValidAvailability,
};
