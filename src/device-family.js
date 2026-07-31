'use strict';

// The device-family vocabulary shared by the schema (CHECK constraints) and the
// application layer, following the same enum-backed pattern as the requirement
// and order-status vocabularies. A device belongs to a family (e.g. a
// smartphone or a tablet), and an accessory is recorded as compatible with one
// or more families.
const DEVICE_FAMILY = Object.freeze({
  SMARTPHONE: 'SMARTPHONE',
  TABLET: 'TABLET',
  WEARABLE: 'WEARABLE',
  ROUTER: 'ROUTER',
});

const DEVICE_FAMILY_VALUES = Object.freeze(Object.values(DEVICE_FAMILY));

function isValidDeviceFamily(value) {
  return DEVICE_FAMILY_VALUES.includes(value);
}

module.exports = { DEVICE_FAMILY, DEVICE_FAMILY_VALUES, isValidDeviceFamily };
