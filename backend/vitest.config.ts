import { defineConfig } from "vitest/config";

// Unit tests (backend/src/**/*.test.ts) — pure logic + mocked AWS SDK, no network calls.
export default defineConfig({
  test: {
    environment: "node",
  },
});
