// High-concurrency load test for POST /purchase (TC-H1). Pure HTTP client — no AWS SDK
// dependency here; run `pnpm run reset-stock` (in backend/) first for a deterministic
// starting stock, then start the API + worker, then run this script.
//
// Env vars: BASE_URL (default http://localhost:3000), TOTAL_REQUESTS (default 1500),
// DUPLICATE_RATE (default 0.05 — fraction of requests that reuse an earlier userId, to
// also exercise the one-per-user race under load, not just the stock race), CONCURRENCY
// (default 200 — max simultaneously in-flight requests; caps client-side socket usage,
// not a limitation of the server).

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TOTAL_REQUESTS = Number(process.env.TOTAL_REQUESTS ?? 1500);
const DUPLICATE_RATE = Number(process.env.DUPLICATE_RATE ?? 0.05);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 200);
const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 20;

interface RequestResult {
  userId: string;
  httpStatus: number;
  latencyMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// Builds the request list up front so a fixed fraction of requests intentionally reuse
// an earlier userId (simulating a user double-clicking "Buy Now" under load).
function buildUserIds(total: number, duplicateRate: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < total; i++) {
    if (i > 0 && Math.random() < duplicateRate) {
      ids.push(ids[Math.floor(Math.random() * ids.length)]!);
    } else {
      ids.push(`stress-${crypto.randomUUID()}`);
    }
  }
  return ids;
}

async function attemptPurchase(userId: string): Promise<RequestResult> {
  const startedAt = performance.now();
  const res = await fetch(`${BASE_URL}/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return { userId, httpStatus: res.status, latencyMs: performance.now() - startedAt };
}

// Runs work in fixed-size concurrent batches rather than all at once — this is what real
// load-testing tools do, and avoids exhausting client-side ephemeral ports/sockets, which
// is a client artifact, not something the server's concurrency control needs to survive.
async function mapBatched<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

async function fetchFinalStatus(userId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(`${BASE_URL}/purchase/${encodeURIComponent(userId)}`);
    const body = (await res.json()) as { status: string };
    if (body.status !== "PENDING") return body.status;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return "PENDING_TIMEOUT";
}

async function main(): Promise<void> {
  console.log(`Stress test: ${TOTAL_REQUESTS} requests against ${BASE_URL}`);

  const statusRes = await fetch(`${BASE_URL}/sale/status`);
  const status = (await statusRes.json()) as { status: string; stockRemaining: number };
  console.log(`Sale status: ${status.status}, stockRemaining: ${status.stockRemaining}`);
  if (status.status !== "active") {
    throw new Error(`Sale is not active (status=${status.status}) — aborting stress test`);
  }

  const userIds = buildUserIds(TOTAL_REQUESTS, DUPLICATE_RATE);
  const uniqueIds = [...new Set(userIds)];

  const wallStart = performance.now();
  const results = await mapBatched(userIds, CONCURRENCY, attemptPurchase);
  const wallDurationMs = performance.now() - wallStart;

  const accepted = results.filter((r) => r.httpStatus === 202).length;
  const rejected = results.filter((r) => r.httpStatus === 409).length;
  const errored = results.length - accepted - rejected;

  console.log(`\nRequest phase complete in ${wallDurationMs.toFixed(0)}ms`);
  console.log(`  202 accepted:        ${accepted}`);
  console.log(`  409 sale-not-active: ${rejected}`);
  console.log(`  other/errors:        ${errored}`);

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  console.log(
    `\nLatency (ms) — p50: ${percentile(latencies, 50).toFixed(1)}, p90: ${percentile(latencies, 90).toFixed(1)}, ` +
      `p99: ${percentile(latencies, 99).toFixed(1)}, max: ${latencies[latencies.length - 1]?.toFixed(1)}`
  );
  console.log(`Throughput: ${(TOTAL_REQUESTS / (wallDurationMs / 1000)).toFixed(1)} req/s`);

  console.log(`\nWaiting for the worker to drain the queue and polling final outcomes for ${uniqueIds.length} unique user(s)...`);
  const finalStatuses = await mapBatched(uniqueIds, CONCURRENCY, fetchFinalStatus);

  const purchased = finalStatuses.filter((s) => s === "PURCHASED").length;
  const soldOut = finalStatuses.filter((s) => s === "SOLD_OUT").length;
  const other = finalStatuses.length - purchased - soldOut;

  console.log(`\nFinal outcomes for ${uniqueIds.length} unique users:`);
  console.log(`  PURCHASED: ${purchased}`);
  console.log(`  SOLD_OUT:  ${soldOut}`);
  console.log(`  other (pending timeout, etc.): ${other}`);
  console.log(`\nDuplicate requests sent: ${TOTAL_REQUESTS - uniqueIds.length} (same userId reused to also exercise the one-per-user race under load)`);

  if (purchased > status.stockRemaining) {
    console.error(`\n❌ OVERSOLD: ${purchased} purchases exceed the starting stock of ${status.stockRemaining}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✅ No overselling: ${purchased} purchased <= starting stock of ${status.stockRemaining}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
