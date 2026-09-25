import { createTableIfNotExists, createQueueIfNotExists } from "../../../src/aws/provision.js";
import { config } from "../../../src/config.js";

// Idempotent — safe to call from every integration test file's beforeAll.
export async function ensureTestInfrastructure(): Promise<void> {
  await createTableIfNotExists(config.tables.inventory);
  await createTableIfNotExists(config.tables.purchases);
  await createQueueIfNotExists(config.queueName);
}
