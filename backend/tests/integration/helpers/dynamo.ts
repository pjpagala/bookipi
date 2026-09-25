import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../../../src/aws/clients.js";
import { config } from "../../../src/config.js";

// Overwrites the single Inventory item so each test starts from a known stock level,
// regardless of how much stock earlier tests in the suite consumed.
export async function seedStock(stock: number): Promise<void> {
  await ddbDocClient.send(
    new PutCommand({ TableName: config.tables.inventory, Item: { pk: "PRODUCT", stock } })
  );
}

// A fresh, random userId per test avoids needing to wipe the Purchases table between tests.
export function uniqueUserId(prefix = "user"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
