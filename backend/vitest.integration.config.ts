import { defineConfig } from "vitest/config";

// Integration tests (backend/tests/integration/**) — run against a real LocalStack
// (docker compose up). Uses dedicated table/queue names so they never collide with
// whatever is in the "dev" tables from manual testing.
export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    // Integration tests hit real network/DynamoDB transactions — run test files serially
    // to avoid flooding LocalStack and to keep failures easy to reason about.
    fileParallelism: false,
    env: {
      INVENTORY_TABLE: "InventoryTest",
      PURCHASES_TABLE: "PurchasesTest",
      PURCHASE_QUEUE_NAME: "flash-sale-purchases-test",
      // Deliberately wide and NOT tied to "today" — these tests must stay deterministic
      // regardless of which calendar date they run on. Sale-window-specific tests
      // (saleWindow.integration.test.ts) override these per-test as needed.
      SALE_START: "2020-01-01T00:00:00.000Z",
      SALE_END: "2099-01-01T00:00:00.000Z",
    },
  },
});
