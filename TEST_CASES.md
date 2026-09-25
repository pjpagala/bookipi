# Test Cases

Source of truth for both the Phase D automated tests (unit/integration/stress) and the `DEMO_GUIDE.md` live walkthrough. See [plan.md](plan.md) for where each fits in the build phases.

Each case lists **Setup**, **Steps**, **Expected Result**, and **Coverage** (how it's verified: `unit`, `integration`, `stress`, or `manual`/demo-only).

## A. Core happy path

**TC-A1 — Sale status: upcoming**
- Setup: `SALE_START` in the future.
- Steps: `GET /sale/status`.
- Expected: `{ status: "upcoming", startsAt, endsAt, stockRemaining }`.
- Coverage: unit (`src/domain/saleWindow.test.ts`), manual.

**TC-A2 — Sale status: active**
- Setup: current time between `SALE_START` and `SALE_END`.
- Steps: `GET /sale/status`.
- Expected: `status: "active"`, `stockRemaining` matches DynamoDB inventory item.
- Coverage: unit (`src/domain/saleWindow.test.ts`), integration (`tests/integration/sale.integration.test.ts`), manual.

**TC-A3 — Sale status: ended**
- Setup: current time after `SALE_END`.
- Steps: `GET /sale/status`.
- Expected: `status: "ended"`.
- Coverage: unit (`src/domain/saleWindow.test.ts`), manual.

**TC-A4 — Successful purchase (happy path)**
- Setup: sale active, stock available, brand-new `userId`.
- Steps: `POST /purchase {userId}` → wait → `GET /purchase/:userId`.
- Expected: `POST` returns `202 { status: "pending" }`; `GET` eventually returns `{ status: "PURCHASED", purchasedAt }`; stock decremented by exactly 1.
- Coverage: integration (`tests/integration/purchase.integration.test.ts`), manual.

**TC-A5 — Happy path via frontend**
- Setup: same as TC-A4.
- Steps: open the app, enter a user ID, click "Buy Now".
- Expected: banner shows "Sale is live"; form shows "Processing…" then "Success! You've secured your item."
- Coverage: manual (demo).

## B. One-per-user enforcement

**TC-B1 — Duplicate purchase, sequential**
- Setup: user already holds a purchase (from TC-A4).
- Steps: same user clicks "Buy Now" again (frontend pre-checks `GET /purchase/:userId` first).
- Expected: UI short-circuits to "You've already secured an item on …" without enqueuing; stock unaffected.
- Coverage: manual, integration (`tests/integration/purchase.integration.test.ts`).

**TC-B2 — Duplicate purchase, concurrent race**
- Setup: sale active, stock available, single `userId`.
- Steps: fire 2+ concurrent `POST /purchase` for the *same* `userId` (bypassing the frontend's pre-check, e.g. via script/Postman).
- Expected: exactly one worker outcome is `PURCHASED`, the rest are `ALREADY_PURCHASED`; stock decremented exactly once.
- Coverage: integration (`tests/integration/concurrency.integration.test.ts`), stress.

## C. Stock / sold-out enforcement

**TC-C1 — Last-item race**
- Setup: `STOCK_QUANTITY=1`.
- Steps: fire 5 concurrent `POST /purchase` with 5 unique `userId`s.
- Expected: exactly 1 `PURCHASED`, 4 `SOLD_OUT`; stock never negative.
- Coverage: integration (`tests/integration/concurrency.integration.test.ts`), stress.

**TC-C2 — Sold out for a new user**
- Setup: stock already at 0.
- Steps: new user checks `GET /purchase/:userId` without ever having purchased.
- Expected: `{ status: "SOLD_OUT" }`, derived without enqueuing anything.
- Coverage: integration (`tests/integration/purchase.integration.test.ts`), manual.

## D. Sale window enforcement

**TC-D1 — Purchase attempt before sale start**
- Setup: `SALE_START` in the future.
- Steps: `POST /purchase {userId}`.
- Expected: `409 { status: "SALE_NOT_ACTIVE", saleStatus: "upcoming" }`.
- Coverage: integration (`tests/integration/saleWindow.integration.test.ts`), manual.

**TC-D2 — Purchase attempt after sale end**
- Setup: `SALE_END` in the past.
- Steps: `POST /purchase {userId}`.
- Expected: `409 { status: "SALE_NOT_ACTIVE", saleStatus: "ended" }`.
- Coverage: integration (`tests/integration/saleWindow.integration.test.ts`), manual.

**TC-D3 — Status check after sale ended, never purchased**
- Setup: sale ended, `userId` never attempted a purchase.
- Steps: `GET /purchase/:userId`.
- Expected: `{ status: "NOT_PURCHASED" }`.
- Coverage: integration (`tests/integration/saleWindow.integration.test.ts`), manual.

## E. Input validation

**TC-E1 — Missing userId**
- Steps: `POST /purchase {}` (no `userId`, or empty string).
- Expected: `400` with an error body.
- Coverage: integration (`tests/integration/purchase.integration.test.ts`).

**TC-E2 — Pending status for untouched user**
- Setup: sale active, stock available, `userId` never attempted.
- Steps: `GET /purchase/:userId`.
- Expected: `{ status: "PENDING" }`.
- Coverage: integration (`tests/integration/purchase.integration.test.ts`), manual.

## F. Fault tolerance / resilience

**TC-F1 — Worker restart, no message loss**
- Setup: enqueue a purchase, kill the worker process before it's processed.
- Steps: restart the worker.
- Expected: the queued purchase is still processed correctly after restart (SQS durability).
- Coverage: manual (demo).

**TC-F2 — Worker error triggers retry**
- Setup: temporarily break the LocalStack endpoint (or induce a DynamoDB error).
- Steps: attempt a purchase, observe the worker log a retained/error message, then restore connectivity.
- Expected: message is **not** deleted on error; becomes visible again after the SQS visibility timeout and is retried successfully once the dependency is healthy.
- Coverage: manual (demo).

**TC-F3 — API restart after enqueue**
- Setup: enqueue a purchase, then kill/restart the API server (not the worker).
- Steps: wait for the worker to process the already-enqueued message.
- Expected: purchase still completes — proves the API and worker are decoupled and the API is not a single point of failure for in-flight purchases.
- Coverage: manual (demo).

## G. Observability

**TC-G1 — Correlation ID tracing**
- Steps: trigger one purchase, grab the `correlationId` from the API log line, grep both the API and worker log streams for it.
- Expected: a single `correlationId` shows the full lifecycle: "purchase attempt received" → "enqueued" (API) → "message received" → "purchase transaction completed" → "message deleted" (worker).
- Coverage: manual (demo).

**TC-G2 — Queue depth under burst**
- Steps: fire a burst of purchases (e.g. via the stress test), watch worker logs.
- Expected: "queue depth" log lines show `visible`/`inFlight` counts rising then draining to 0 as the worker catches up.
- Coverage: manual (demo), stress.

## H. Load / concurrency at scale

**TC-H1 — Stress test**
- Setup: small stock (e.g. 100), stress script configured for 1000-2000 concurrent `POST /purchase` requests against mostly-unique `userId`s.
- Steps: run `pnpm run stress-test`.
- Expected: exactly `stock` `PURCHASED`, remainder `SOLD_OUT`, zero duplicate purchases, no server errors/crashes; latency percentiles + throughput captured in the results summary.
- Coverage: stress (`stress-test/src/purchaseStress.ts`) — actual run results in [STRESS_TEST_RESULTS.md](STRESS_TEST_RESULTS.md) (100/100 purchased, 0 oversold, 0 errors).

## I. Frontend UX states

**TC-I1 — All feedback states**
- Steps: walk through each state in the UI: upcoming (countdown), active (live stock count), ended, processing, success, already-purchased, sold-out, sale-not-active, and a network-error case (stop the backend, click "Buy Now").
- Expected: each state renders the correct, distinct message from `PurchaseForm`'s feedback switch.
- Coverage: manual (demo).
