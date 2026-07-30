'use strict';

// The requirement vocabulary shared by the schema (CHECK constraint) and the
// application layer. An add-on attached to a device/plan is either REQUIRED
// (it must be taken with the device) or OPTIONAL (it may be added).
const REQUIREMENT = Object.freeze({
  REQUIRED: 'REQUIRED',
  OPTIONAL: 'OPTIONAL',
});

const REQUIREMENT_VALUES = Object.freeze(Object.values(REQUIREMENT));

function isValidRequirement(value) {
  return REQUIREMENT_VALUES.includes(value);
}

module.exports = { REQUIREMENT, REQUIREMENT_VALUES, isValidRequirement };
