import {
  CreateTableCommand,
  ResourceInUseException,
  ConditionalCheckFailedException,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  QueueNameExists,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
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

interface QueueOptions {
  deadLetterQueueName: string;
  maxReceiveCount: number;
}

// SQS's CreateQueue is only idempotent when the requested Attributes exactly match an
// existing queue's — otherwise it throws QueueNameExists. Since we (re)apply Attributes
// via SetQueueAttributes afterward anyway, just resolve the existing queue's URL instead.
async function createOrGetQueueUrl(queueName: string, attributes?: Record<string, string>): Promise<string> {
  try {
    const result = await sqsClient.send(new CreateQueueCommand({ QueueName: queueName, Attributes: attributes }));
    if (!result.QueueUrl) throw new Error(`Failed to create/resolve queue "${queueName}"`);
    return result.QueueUrl;
  } catch (err) {
    if (!(err instanceof QueueNameExists)) throw err;
    const { QueueUrl } = await sqsClient.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (!QueueUrl) throw new Error(`Failed to resolve existing queue "${queueName}"`);
    return QueueUrl;
  }
}

// Creates the main queue wired to a dead-letter queue via a RedrivePolicy: a message that
// fails processing more than maxReceiveCount times is moved to the DLQ instead of cycling
// through the main queue forever (a poison message shouldn't block/slow down real traffic).
export async function createQueueIfNotExists(queueName: string, options: QueueOptions): Promise<string> {
  const dlqUrl = await createOrGetQueueUrl(options.deadLetterQueueName);

  const { Attributes: dlqAttributes } = await sqsClient.send(
    new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ["QueueArn"] })
  );
  const dlqArn = dlqAttributes?.QueueArn;
  if (!dlqArn) throw new Error(`Could not resolve ARN for queue "${options.deadLetterQueueName}"`);

  const redrivePolicy = JSON.stringify({
    deadLetterTargetArn: dlqArn,
    maxReceiveCount: options.maxReceiveCount,
  });

  const queueUrl = await createOrGetQueueUrl(queueName, { RedrivePolicy: redrivePolicy });

  // CreateQueue only applies Attributes on first creation — re-apply on every run so a
  // queue that already existed (e.g. from before the DLQ was introduced) gets wired up too.
  await sqsClient.send(new SetQueueAttributesCommand({ QueueUrl: queueUrl, Attributes: { RedrivePolicy: redrivePolicy } }));

  return queueUrl;
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
