# demo1

A catalog + ordering service library. This document describes the **blocking-state
messaging contract**: the vocabulary and normalized response shape a UI or API
layer renders when an operation cannot proceed.

Every error module described here is re-exported from `src/index.js`, so a
downstream layer has a single import surface:

```js
const {
  REASON_CODE,
  REASON_CODE_VALUES,
  CATEGORY,
  CATEGORY_VALUES,
  STATE_PRESERVATION,
  STATE_PRESERVATION_VALUES,
  getReasonMeta,
  isValidReasonCode,
  AppError,
  fromReasonCode,
  toUserFacingError,
} = require('./src/index.js');
```

The single source of truth for the values below lives in
[`src/reason-codes.js`](src/reason-codes.js); `AppError`
([`src/app-error.js`](src/app-error.js)) carries the contract at throw time and
`toUserFacingError` ([`src/user-facing-error.js`](src/user-facing-error.js))
normalizes any thrown value into the response shape.

## Reason codes

Each reason code carries a user-facing `message` (an explanation safe to show a
customer — never a raw `Error` message) and a `nextStep` (what the customer
should do next). Each also has a default `category` (see below).

| Reason code | Category | User-facing message | Next step |
| --- | --- | --- | --- |
| `MISSING_OR_INVALID_DEVICE_ID` | `RETRYABLE` | We could not tell which device you are looking at. | Choose a device again and retry. |
| `UNKNOWN_DEVICE` | `RETRYABLE` | The selected device is no longer available in our catalog. | Return to the catalog and pick an available device. |
| `MISSING_CUSTOMER_CONTEXT` | `NEEDS_SUPPORT` | We need to know who you are before we can tailor recommendations. | Sign in or continue as a guest, then retry. |
| `MISSING_OR_INVALID_REQUIREMENT` | `NEEDS_DOCUMENTATION` | This add-on is missing a valid required-or-optional setting. | Mark the add-on as REQUIRED or OPTIONAL and try again. |
| `NO_ADDON_REFERENCED` | `RETRYABLE` | No bundle or accessory was chosen to attach to this device. | Select at least one bundle or accessory, then retry. |
| `INVALID_REQUIREMENT_FILTER` | `NEEDS_DOCUMENTATION` | The requirement filter used to load add-ons was not valid. | Filter by REQUIRED or OPTIONAL, or clear the filter, and retry. |
| `UNEXPECTED` | `NEEDS_SUPPORT` | Something went wrong on our side while processing your request. | Please try again shortly or contact support if it persists. |

Look up a code's metadata at runtime with `getReasonMeta(code)`, which returns
the frozen `{ code, message, nextStep, category }` record (and throws for an
unknown code). Use `isValidReasonCode(code)` to test membership.

## Categories and the `retryable` flag

The `category` classifies **how a blocking state should be handled**. There are
exactly three categories, and the boolean `retryable` field is *derived from*
the category — a consumer never sets it directly:

| Category | `retryable` | Meaning — how a consumer should handle it |
| --- | --- | --- |
| `RETRYABLE` | `true` | The customer can safely repeat the same action (usually after fixing their own input). Show a retry affordance. |
| `NEEDS_SUPPORT` | `false` | Retrying will not help; the customer should contact support (or sign in / escalate). Do **not** offer a bare retry. |
| `NEEDS_DOCUMENTATION` | `false` | The customer must provide or correct documentation/input before the action can succeed. Guide them to fix it rather than retry as-is. |

In other words, `retryable === true` **only** for the `RETRYABLE` category;
both `NEEDS_SUPPORT` and `NEEDS_DOCUMENTATION` yield `retryable === false`. This
is how `RETRYABLE` is distinguished from `NEEDS_SUPPORT` / `NEEDS_DOCUMENTATION`:
the category names the reason a retry is or is not viable, and `retryable`
collapses that into the single boolean a UI can gate a "Try again" button on.

## State-preservation vocabulary

When a failure occurs, in-progress work may or may not survive. The
`statePreservation` object reports the fate of three facets — the shopping
**cart**, the pending **order**, and any **payment** in flight — using this
vocabulary:

| Value | Meaning |
| --- | --- |
| `PRESERVED` | The state was kept intact; the customer can resume from where they were. |
| `DISCARDED` | The state was intentionally thrown away and must be rebuilt. |
| `UNKNOWN` | The fate of the state could not be determined (used when the failure was unclassified). |

`statePreservation` always has all three facets:

```js
{ cart: 'PRESERVED', order: 'PRESERVED', payment: 'PRESERVED' }
```

An `AppError` defaults every facet to `PRESERVED` (nothing is lost unless the
throwing site says so). An unclassified failure normalized through
`toUserFacingError` reports every facet as `UNKNOWN`.

## Normalized user-facing response shape

`toUserFacingError(err)` turns *any* thrown value into this stable, serializable
shape — the object a UI or API layer should render:

| Field | Type | Description |
| --- | --- | --- |
| `reasonCode` | `REASON_CODE` value | Which failure occurred. |
| `message` | string | Customer-facing explanation (never a raw `Error` message). |
| `nextStep` | string | What the customer should do next. |
| `category` | `CATEGORY` value | How to handle the failure. |
| `retryable` | boolean | Derived from `category`; `true` only for `RETRYABLE`. |
| `statePreservation` | `{ cart, order, payment }` | State-preservation value per facet. |

An `AppError` maps straight through (its `userMessage` becomes `message`).
Anything else — a bare `Error`, an `Error` subclass, or a non-`Error` value — is
downgraded to `UNEXPECTED`: non-retryable, every state facet `UNKNOWN`, and its
own message kept out of the customer-facing `message`.

### Worked example

Given the `UNKNOWN_DEVICE` failure:

```js
const { AppError, toUserFacingError, REASON_CODE } = require('./src/index.js');

const normalized = toUserFacingError(new AppError(REASON_CODE.UNKNOWN_DEVICE));
```

`normalized` is:

```json
{
  "reasonCode": "UNKNOWN_DEVICE",
  "message": "The selected device is no longer available in our catalog.",
  "nextStep": "Return to the catalog and pick an available device.",
  "category": "RETRYABLE",
  "retryable": true,
  "statePreservation": {
    "cart": "PRESERVED",
    "order": "PRESERVED",
    "payment": "PRESERVED"
  }
}
```

Because the category is `RETRYABLE`, `retryable` is `true`, so a UI can safely
offer the "Return to the catalog and pick an available device" next step as a
retry.
