import { describe, it, expect, vi } from "vitest";
import { uniqueUserId } from "./helpers/dynamo.js";

// config.ts reads SALE_START/SALE_END from process.env once at import time. To exercise
// different sale windows without spinning up separate processes, we temporarily change
// process.env and use vi.resetModules() to force a fresh import of the whole module graph
// (config -> routes -> server) that picks up the new env vars, then restore afterwards.
async function buildAppWithSaleWindow(saleStart: string, saleEnd: string) {
  const prevStart = process.env.SALE_START;
  const prevEnd = process.env.SALE_END;
  process.env.SALE_START = saleStart;
  process.env.SALE_END = saleEnd;
  vi.resetModules();

  const { buildServer } = await import("../../src/server.js");
  const app = buildServer();
  await app.ready();

  return {
    app,
    async cleanup() {
      await app.close();
      if (prevStart === undefined) delete process.env.SALE_START;
      else process.env.SALE_START = prevStart;
      if (prevEnd === undefined) delete process.env.SALE_END;
      else process.env.SALE_END = prevEnd;
      vi.resetModules();
    },
  };
}

describe("sale window enforcement (integration, real LocalStack)", () => {
  it("TC-D1: rejects purchases before the sale starts", async () => {
    const { app, cleanup } = await buildAppWithSaleWindow("2099-01-01T00:00:00.000Z", "2099-01-02T00:00:00.000Z");
    try {
      const res = await app.inject({ method: "POST", url: "/purchase", payload: { userId: uniqueUserId() } });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ status: "SALE_NOT_ACTIVE", saleStatus: "upcoming" });
    } finally {
      await cleanup();
    }
  });

  it("TC-D2: rejects purchases after the sale ends", async () => {
    const { app, cleanup } = await buildAppWithSaleWindow("2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z");
    try {
      const res = await app.inject({ method: "POST", url: "/purchase", payload: { userId: uniqueUserId() } });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ status: "SALE_NOT_ACTIVE", saleStatus: "ended" });
    } finally {
      await cleanup();
    }
  });

  it("TC-D3: a never-purchased user is NOT_PURCHASED once the sale has ended", async () => {
    const { app, cleanup } = await buildAppWithSaleWindow("2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z");
    try {
      const res = await app.inject({ method: "GET", url: `/purchase/${uniqueUserId()}` });
      expect(res.json()).toEqual({ status: "NOT_PURCHASED" });
    } finally {
      await cleanup();
    }
  });
});
