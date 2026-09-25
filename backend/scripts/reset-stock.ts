import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { createTableIfNotExists } from "../src/aws/provision.js";
import { ddbDocClient } from "../src/aws/clients.js";
import { config } from "../src/config.js";

// Unconditionally overwrites the Inventory item — used before stress-test runs so the
// starting stock is known and small enough to prove no-overselling under heavy contention.
async function main(): Promise<void> {
  const stock = Number(process.env.STOCK_QUANTITY ?? config.stockQuantity);
  await createTableIfNotExists(config.tables.inventory);
  await ddbDocClient.send(
    new PutCommand({ TableName: config.tables.inventory, Item: { pk: "PRODUCT", stock } })
  );
  console.log(`Inventory reset to stock=${stock} in table "${config.tables.inventory}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
