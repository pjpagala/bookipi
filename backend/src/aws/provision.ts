import {
  CreateTableCommand,
  ResourceInUseException,
  ConditionalCheckFailedException,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient, ddbDocClient, sqsClient } from "./clients.js";

// Shared by the one-off `setup:aws` CLI script and the integration test suite, so both
// provision LocalStack resources the exact same way.

export async function createTableIfNotExists(tableName: string): Promise<void> {
  try {
    await ddbClient.send(
      new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        BillingMode: "PAY_PER_REQUEST",
      })
    );
  } catch (err) {
    if (!(err instanceof ResourceInUseException)) throw err;
  }
  await waitUntilTableExists({ client: ddbClient, maxWaitTime: 30 }, { TableName: tableName });
}

export async function createQueueIfNotExists(queueName: string): Promise<string> {
  const result = await sqsClient.send(new CreateQueueCommand({ QueueName: queueName }));
  if (!result.QueueUrl) throw new Error(`Failed to create/resolve queue "${queueName}"`);
  return result.QueueUrl;
}

export async function seedInventoryIfAbsent(tableName: string, stock: number): Promise<void> {
  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: { pk: "PRODUCT", stock },
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
  } catch (err) {
    if (!(err instanceof ConditionalCheckFailedException)) throw err;
  }
}
