import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../src/server.js";
import { ensureTestInfrastructure } from "./helpers/ensureInfra.js";
import { seedStock } from "./helpers/dynamo.js";

describe("sale status (integration, real LocalStack)", () => {
  const app = buildServer();

  beforeAll(async () => {
    await ensureTestInfrastructure();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it("TC-A2: reports active status with the current stock level", async () => {
    await seedStock(42);
    const res = await app.inject({ method: "GET", url: "/sale/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("active");
    expect(body.stockRemaining).toBe(42);
  });
});
