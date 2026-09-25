import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../src/server.js";
import { drainQueueOnce } from "../../src/worker/purchaseWorker.js";
import { ensureTestInfrastructure } from "./helpers/ensureInfra.js";
import { seedStock, uniqueUserId } from "./helpers/dynamo.js";

// Requires `docker compose up -d` (LocalStack) and the sale window to be active —
// see vitest.integration.config.ts for the dedicated Inventory/Purchases/queue names.
describe("purchase flow (integration, real LocalStack)", () => {
  const app = buildServer();

  beforeAll(async () => {
    await ensureTestInfrastructure();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it("TC-E1: rejects a purchase with no userId", async () => {
    const res = await app.inject({ method: "POST", url: "/purchase", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("TC-E2: an untouched user is PENDING", async () => {
    await seedStock(20);
    const res = await app.inject({ method: "GET", url: `/purchase/${uniqueUserId()}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "PENDING" });
  });

  it("TC-A4: a user can successfully purchase", async () => {
    await seedStock(20);
    const userId = uniqueUserId();

    const attempt = await app.inject({ method: "POST", url: "/purchase", payload: { userId } });
    expect(attempt.statusCode).toBe(202);
    expect(attempt.json()).toEqual({ status: "pending" });

    await drainQueueOnce();

    const status = await app.inject({ method: "GET", url: `/purchase/${userId}` });
    expect(status.json().status).toBe("PURCHASED");
  });

  it("TC-B1: a second purchase attempt by the same user does not change their PURCHASED state", async () => {
    await seedStock(20);
    const userId = uniqueUserId();

    await app.inject({ method: "POST", url: "/purchase", payload: { userId } });
    await drainQueueOnce();
    const firstStatus = await app.inject({ method: "GET", url: `/purchase/${userId}` });
    expect(firstStatus.json().status).toBe("PURCHASED");

    // The route itself doesn't pre-check (the frontend does) — it still enqueues,
    // and the worker's DynamoDB condition is what rejects the duplicate.
    const second = await app.inject({ method: "POST", url: "/purchase", payload: { userId } });
    expect(second.statusCode).toBe(202);
    await drainQueueOnce();

    const secondStatus = await app.inject({ method: "GET", url: `/purchase/${userId}` });
    expect(secondStatus.json().status).toBe("PURCHASED");
  });

  it("TC-C2: a new user is SOLD_OUT once stock is 0, without needing to enqueue", async () => {
    await seedStock(0);
    const res = await app.inject({ method: "GET", url: `/purchase/${uniqueUserId()}` });
    expect(res.json()).toEqual({ status: "SOLD_OUT" });
  });
});
