import { describe, it, expect, beforeAll } from "vitest";
import { attemptPurchase } from "../../src/domain/purchase.js";
import { ensureTestInfrastructure } from "./helpers/ensureInfra.js";
import { seedStock, uniqueUserId } from "./helpers/dynamo.js";

// Fires real concurrent requests directly at attemptPurchase() — this is the actual
// atomicity boundary (DynamoDB TransactWriteItems), so proving it here is stronger
// than proving it through the HTTP+queue layers.
describe("concurrency safety (integration, real LocalStack)", () => {
  beforeAll(async () => {
    await ensureTestInfrastructure();
  }, 30000);

  it("TC-C1: exactly one winner when N users race for the last item", async () => {
    await seedStock(1);
    const userIds = Array.from({ length: 10 }, () => uniqueUserId());

    const outcomes = await Promise.all(userIds.map((id) => attemptPurchase(id)));

    expect(outcomes.filter((o) => o === "PURCHASED")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "SOLD_OUT")).toHaveLength(9);
  });

  it("TC-B2: exactly one winner when the same user races against themself", async () => {
    await seedStock(20);
    const userId = uniqueUserId();

    const outcomes = await Promise.all(Array.from({ length: 10 }, () => attemptPurchase(userId)));

    expect(outcomes.filter((o) => o === "PURCHASED")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "ALREADY_PURCHASED")).toHaveLength(9);
  });
});
