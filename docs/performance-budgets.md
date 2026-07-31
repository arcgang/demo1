# Performance Budgets & Constrained Low-Bandwidth Profile

This note is the human-readable companion to
[`perf-budgets.json`](../perf-budgets.json). That JSON file is the **single
source of truth** — measurement tooling (Lighthouse, WebPageTest, Playwright
CDP throttling, CI performance gates) and human reviewers all read the same
numbers from it. When budgets change, edit `perf-budgets.json` and reflect the
change here; do not hard-code thresholds anywhere else.

These budgets are grounded in HLD section 11.5. No frontend or backend exists
yet, so this is a committed contract that future implementation and tooling must
satisfy.

## Core Web Vitals budgets (per page, at p75)

Budgets are evaluated at the **75th percentile** (`p75`) of measurements taken
on the constrained low-bandwidth profile described below.

| Metric | Pages | Budget (p75) |
| ------ | -------------------------- | ------------ |
| **LCP** (Largest Contentful Paint) | landing, category | **≤ 2.5s** |
| **TTI** (Time To Interactive) | product, cart, checkout | **≤ 3.0s** |

- Content-first pages (landing, category) are held to an **LCP ≤ 2.5s** budget —
  the primary content must paint quickly.
- Interaction-heavy funnel pages (product, cart, checkout) are held to a
  **TTI ≤ 3.0s** budget — the page must become responsive quickly.

The two metrics map to disjoint page sets: LCP is not asserted on the TTI pages
and vice versa.

## API interaction budget (at p95)

For **95% of API interactions** (`p95`):

- a response is **shown within 2s** (`respondWithin`), and
- the interaction **completes within 5s** (`completeWithin`).

The "respond within" budget is deliberately tighter than the "complete within"
budget: users should see feedback well before the full result is ready.

## Constrained low-bandwidth network / CPU profile

A reusable throttling profile so every lab measurement models the same
constrained environment. It approximates a **low-end mobile device** on a
**regular-3G-class** link.

| Parameter | Value |
| --------- | ----- |
| Device class | `low-end-mobile` |
| Network download throughput | 1600 Kbps |
| Network upload throughput | 768 Kbps |
| Added latency (RTT) | 150 ms |
| CPU slowdown multiplier | 4× (slower than baseline) |

These figures keep the profile firmly in low-bandwidth territory (download
capped well below broadband, upload ≤ download, meaningful mobile latency) and
model a slower-than-baseline CPU (multiplier > 1×). Apply them directly to the
throttling settings of whichever measurement tool is in use so results are
comparable across runs and tools.
