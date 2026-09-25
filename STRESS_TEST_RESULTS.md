# Stress Test Results

Load test for the flash sale system's core correctness guarantee: **no overselling, no duplicate purchases, even under heavy concurrent load.** See [TEST_CASES.md](TEST_CASES.md) TC-H1 and [plan.md](plan.md) Phase D.

## How to run it

```bash
docker compose up -d                 # LocalStack
cd backend
pnpm run setup:aws                   # create tables/queue (idempotent)
STOCK_QUANTITY=100 pnpm run reset-stock   # deterministic starting stock
pnpm run dev                         # API server (separate terminal)
pnpm run worker                      # worker (separate terminal)

cd ..
TOTAL_REQUESTS=1000 pnpm run stress-test
```

Env vars for `stress-test`: `BASE_URL` (default `http://localhost:3000`), `TOTAL_REQUESTS` (default 1500), `DUPLICATE_RATE` (default 0.05 — fraction of requests that intentionally reuse an earlier `userId`, to also exercise the one-per-user race under load), `CONCURRENCY` (default 200 — max simultaneously in-flight requests; a client-side cap to avoid exhausting local ephemeral ports, not a server limitation).

## Actual run (2026-09-24)

- **Setup:** stock reset to 100, sale window active, LocalStack running locally (Windows host).
- **Load:** 1000 `POST /purchase` requests, batched at 200 concurrent in-flight at a time, 949 unique `userId`s + 51 intentional duplicates.

```
Sale status: active, stockRemaining: 100

Request phase complete in 2289ms
  202 accepted:        1000
  409 sale-not-active: 0
  other/errors:        0

Latency (ms) — p50: 181.8, p90: 1204.2, p99: 1265.6, max: 1270.7
Throughput: 436.8 req/s

Waiting for the worker to drain the queue and polling final outcomes for 949 unique user(s)...

Final outcomes for 949 unique users:
  PURCHASED: 100
  SOLD_OUT:  849
  other (pending timeout, etc.): 0

Duplicate requests sent: 51 (same userId reused to also exercise the one-per-user race under load)

✅ No overselling: 100 purchased <= starting stock of 100
```

## Interpretation

- **Exactly 100 purchases** for a starting stock of 100 — zero oversold, zero undersold. This is enforced entirely by the DynamoDB `TransactWriteItems` conditional decrement in `attemptPurchase()`, not by any client-side coordination or locking.
- **All 51 duplicate-userId requests** resolved correctly (no double-purchases) — `949 unique = 100 purchased + 849 sold out` accounts for every unique user exactly once, confirming the one-per-user condition holds even when the *same* user's requests race against each other under load.
- **Zero errors / zero stuck-pending outcomes** — every one of the 1000 enqueued requests was drained and resolved by the worker within the polling window, demonstrating the SQS + worker pipeline keeps up with a burst without dropping or losing messages.
- **p50 latency (182ms) vs p99 (1266ms)**: the gap reflects request queuing at the HTTP layer under the 200-concurrency client batch (not the DynamoDB transaction itself, which completes in single-digit milliseconds per the correlationId-tagged worker logs — see `TEST_CASES.md` TC-G1). In a production deployment this is where horizontal scaling (more Fastify instances behind a load balancer, more worker processes) would reduce tail latency further; see README for the scaling discussion.
- **Throughput (~437 req/s)** was measured against a single local Fastify process and a single LocalStack container on one machine — a deliberately modest environment. The architecture (stateless API, SQS buffering, DynamoDB conditional writes) is designed to scale horizontally in front of real AWS services; this number is a baseline, not a ceiling.
