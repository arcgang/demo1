'use strict';

// Input-validation helper for DTO validation on write endpoints (LLD §4.2
// step 2, §11.1 "Input validation"). It validates a decoded request body
// against a small field spec and reports — without throwing — which fields are
// missing or of the wrong type, so a controller can turn a failed validation
// into a 400 with field-level messages.
//
//   validateBody(body, spec) -> { valid, errors, value }
//
//     spec:  { <field>: { type: 'string'|'number'|'boolean'|'object', required? } }
//     valid: boolean — true only when there are no errors
//     errors: array of { field, message } (empty when valid)
//     value:  the validated body when valid, otherwise null

// A body must be a plain object (not null, not an array, not a primitive)
// before any per-field rule can apply.
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Report whether `value` matches the spec's declared primitive/object `type`.
function matchesType(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    default:
      return false;
  }
}

// Validate `body` against `spec`, collecting every violation rather than
// stopping at the first so callers can surface all field-level messages at once.
function validateBody(body, spec) {
  const errors = [];

  if (!isPlainObject(body)) {
    errors.push({ field: '(body)', message: 'request body must be a JSON object' });
    return { valid: false, errors, value: null };
  }

  for (const [field, rule] of Object.entries(spec)) {
    const present = Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined;

    if (!present) {
      if (rule.required) {
        errors.push({ field, message: `${field} is required` });
      }
      continue;
    }

    if (!matchesType(body[field], rule.type)) {
      errors.push({ field, message: `${field} must be of type ${rule.type}` });
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, value: valid ? body : null };
}

module.exports = { validateBody };
