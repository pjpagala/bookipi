import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { saleRoutes } from "./routes/sale.js";
import { purchaseRoutes } from "./routes/purchase.js";

export function buildServer() {
  const app = Fastify({ loggerInstance: createLogger("api") });
  app.register(saleRoutes);
  app.register(purchaseRoutes);
  return app;
}

async function start() {
  const app = buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

// Only auto-start when this file is run directly (e.g. `pnpm run dev`), not when
// imported by integration tests to reuse `buildServer`.
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
