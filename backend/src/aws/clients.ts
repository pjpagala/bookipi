import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SQSClient, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { config } from "../config.js";

const sdkConfig = {
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
};

export const ddbClient = new DynamoDBClient(sdkConfig);
export const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
export const sqsClient = new SQSClient(sdkConfig);

let cachedQueueUrl: string | undefined;

// Resolved once and cached — avoids a lookup round-trip on every request.
export async function getQueueUrl(): Promise<string> {
  if (cachedQueueUrl) return cachedQueueUrl;
  const result = await sqsClient.send(new GetQueueUrlCommand({ QueueName: config.queueName }));
  if (!result.QueueUrl) {
    throw new Error(`Queue "${config.queueName}" not found — run "pnpm run setup:aws" first`);
  }
  cachedQueueUrl = result.QueueUrl;
  return cachedQueueUrl;
}
