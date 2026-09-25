import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { ddbDocClient } from "../aws/clients.js";
import { config } from "../config.js";

export type PurchaseOutcome = "PURCHASED" | "SOLD_OUT" | "ALREADY_PURCHASED";

// Atomically decrements stock and records the purchase in a single DynamoDB transaction —
// this is the sole source of concurrency safety (no app-level locks).
export async function attemptPurchase(userId: string): Promise<PurchaseOutcome> {
  const purchasedAt = new Date().toISOString();
  try {
    await ddbDocClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: config.tables.inventory,
              Key: { pk: "PRODUCT" },
              UpdateExpression: "SET stock = stock - :one",
              ConditionExpression: "stock > :zero",
              ExpressionAttributeValues: { ":one": 1, ":zero": 0 },
            },
          },
          {
            Put: {
              TableName: config.tables.purchases,
              Item: { pk: userId, purchasedAt },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
        ],
      })
    );
    return "PURCHASED";
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const reasons = err.CancellationReasons ?? [];
      const alreadyPurchased = reasons[1]?.Code === "ConditionalCheckFailed";
      const soldOut = reasons[0]?.Code === "ConditionalCheckFailed";
      // Check "already purchased" first: if both conditions failed, the user already
      // holds a unit, which is the more relevant outcome to report than sold-out.
      if (alreadyPurchased) return "ALREADY_PURCHASED";
      if (soldOut) return "SOLD_OUT";
    }
    throw err;
  }
}
