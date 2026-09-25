import { createTableIfNotExists, createQueueIfNotExists, seedInventoryIfAbsent } from "../src/aws/provision.js";
import { config } from "../src/config.js";

async function main(): Promise<void> {
  await createTableIfNotExists(config.tables.inventory);
  console.log(`Table ready: "${config.tables.inventory}"`);
  await createTableIfNotExists(config.tables.purchases);
  console.log(`Table ready: "${config.tables.purchases}"`);

  const queueUrl = await createQueueIfNotExists(config.queueName);
  console.log(`Queue ready: ${queueUrl}`);

  await seedInventoryIfAbsent(config.tables.inventory, config.stockQuantity);
  console.log(`Inventory seeded (or already present) with stock=${config.stockQuantity}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

