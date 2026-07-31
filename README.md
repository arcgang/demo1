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
  // Structured field/status message contract (see below).
  MESSAGE_SEVERITY,
  MESSAGE_TARGET,
  ARIA_LIVE,
  ariaLiveForSeverity,
  fieldMessage,
  liveRegionMessage,
  fieldMessageFromError,
  isValidMessage,
  buildFieldMessageResponse,
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

## Structured field/status message contract

The `toUserFacingError` shape above answers *what went wrong*. For checkout and
onboarding endpoints the API layer also needs to say *which field it went wrong
on*, so an accessible frontend can bind each message to the correct form field
or announce it in a live region. That per-field contract lives in
[`src/field-messages.js`](src/field-messages.js) and is re-exported from
`src/index.js`.

Every validation / status / error message is a plain, JSON-serializable object
carrying exactly these fields:

| Field | Type | Description |
| --- | --- | --- |
| `target` | `MESSAGE_TARGET` value | Where to bind the message: `FIELD` or `LIVE_REGION`. |
| `field` | string \| null | The machine-usable field identifier (e.g. `porting.msisdn`) for a `FIELD` message; always `null` for a `LIVE_REGION` message. |
| `message` | string | The (non-empty) customer-facing text to render. |
| `severity` | `MESSAGE_SEVERITY` value | How serious the message is (see below). |
| `ariaLive` | `ARIA_LIVE` value | The ARIA live-region politeness to announce with; derived from `severity`. |
| `reasonCode` | `REASON_CODE` value \| null | Links the message back to the reason-code catalog when it came from a failure; otherwise `null`. |

### Targets: field binding vs. live region

`MESSAGE_TARGET` tells the frontend how to surface the message for assistive
technologies:

| Target | Binding |
| --- | --- |
| `FIELD` | An inline message bound to a specific form field via its `field` identifier (e.g. an inline validation error under `customer.idDocumentNumber`). |
| `LIVE_REGION` | A form/page-level announcement bound to an ARIA live region rather than a single field (e.g. a "Please fix the highlighted fields" error summary, or a "payment pending" status). Its `field` is always `null`. |

### Severities and the ARIA live-region politeness mapping

`MESSAGE_SEVERITY` has four values — `ERROR`, `WARNING`, `INFO`, `SUCCESS`. The
`ariaLive` field is *derived from* the severity by `ariaLiveForSeverity`, so a
live region announces with the right urgency for assistive technologies:

| Severity | `ariaLive` |
| --- | --- |
| `ERROR` | `assertive` |
| `WARNING` | `assertive` |
| `INFO` | `polite` |
| `SUCCESS` | `polite` |

`ERROR`/`WARNING` map to `assertive` (announced immediately, interrupting);
`INFO`/`SUCCESS` map to `polite` (announced when the user is idle). `ARIA_LIVE`
exposes those two politeness values (`{ ASSERTIVE: 'assertive', POLITE:
'polite' }`).

### Builders

- `fieldMessage(field, message, { severity, reasonCode })` — a message bound to
  a field. Defaults `severity` to `ERROR`.
- `liveRegionMessage(message, { severity, reasonCode })` — a message bound to a
  live region. Defaults `severity` to `INFO`; `field` is always `null`.
- `fieldMessageFromError(err, field, { severity })` — normalizes any thrown
  value through `toUserFacingError` and binds the resulting customer-facing
  message (and its `reasonCode`) to `field`. A raw `Error` is downgraded to
  `UNEXPECTED` and its own message never leaks.
- `isValidMessage(msg)` — structural predicate for a well-formed message.

### Response envelope

`buildFieldMessageResponse(messages, { correlationId })` assembles the endpoint
response the API layer serializes: the `messages` array (a defensive copy),
the `correlationId` (defaulting to `null`), and `hasErrors` — `true` when any
message has `ERROR` severity, so the frontend can tell a failed submission from
an advisory one.

```json
{
  "messages": [
    {
      "target": "FIELD",
      "field": "porting.msisdn",
      "message": "Enter the number you want to port in.",
      "severity": "ERROR",
      "ariaLive": "assertive",
      "reasonCode": null
    },
    {
      "target": "FIELD",
      "field": "customer.idDocumentNumber",
      "message": "This ID number is not valid.",
      "severity": "ERROR",
      "ariaLive": "assertive",
      "reasonCode": null
    },
    {
      "target": "LIVE_REGION",
      "field": null,
      "message": "Please fix the highlighted fields.",
      "severity": "ERROR",
      "ariaLive": "assertive",
      "reasonCode": null
    }
  ],
  "correlationId": "corr_12af",
  "hasErrors": true
}
```
