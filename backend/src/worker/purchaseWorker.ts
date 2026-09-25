import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  type Message,
} from "@aws-sdk/client-sqs";
import { fileURLToPath } from "node:url";
import { sqsClient, getQueueUrl } from "../aws/clients.js";
import { attemptPurchase } from "../domain/purchase.js";
import { createLogger } from "../logger.js";

const logger = createLogger("worker");

interface PurchaseMessageBody {
  userId: string;
  correlationId: string;
}

// Reports queue backlog whenever a batch is received — useful for observing
// backpressure/burst-smoothing during the stress test without spamming idle polls.
async function logQueueDepth(queueUrl: string): Promise<void> {
  const { Attributes } = await sqsClient.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
    })
  );
  logger.info(
    {
      visible: Attributes?.ApproximateNumberOfMessages,
      inFlight: Attributes?.ApproximateNumberOfMessagesNotVisible,
    },
    "queue depth"
  );
}

async function processMessage(message: Message, queueUrl: string): Promise<void> {
  if (!message.Body || !message.ReceiptHandle) return;
  const { userId, correlationId } = JSON.parse(message.Body) as PurchaseMessageBody;
  const log = logger.child({ correlationId, userId, messageId: message.MessageId });
  log.info("message received from queue");

  const startedAt = Date.now();
  try {
    const outcome = await attemptPurchase(userId, correlationId);
    log.info({ outcome, durationMs: Date.now() - startedAt }, "purchase transaction completed");
    // Delete on every terminal business outcome — sold-out/already-purchased are not errors.
    await sqsClient.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
    log.info("message deleted from queue");
  } catch (err) {
    // Leave the message in the queue on unexpected/infra errors — SQS visibility timeout
    // will make it visible again for another worker to retry.
    log.error({ err }, "failed to process purchase, message retained for retry");
  }
}

async function receiveAndProcessBatch(queueUrl: string, waitTimeSeconds: number): Promise<number> {
  const { Messages } = await sqsClient.send(
    new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: waitTimeSeconds })
  );
  if (!Messages?.length) return 0;
  logger.info({ batchSize: Messages.length }, "received message batch");
  await logQueueDepth(queueUrl);
  await Promise.allSettled(Messages.map((message) => processMessage(message, queueUrl)));
  return Messages.length;
}

// Exposed so integration tests can manually pump the queue once instead of running the
// infinite poll loop below.
export async function drainQueueOnce(waitTimeSeconds = 5): Promise<number> {
  const queueUrl = await getQueueUrl();
  return receiveAndProcessBatch(queueUrl, waitTimeSeconds);
}

async function pollLoop(): Promise<void> {
  const queueUrl = await getQueueUrl();
  logger.info({ queueUrl }, "worker started, polling queue");
  for (;;) {
    await receiveAndProcessBatch(queueUrl, 20);
  }
}

// Only auto-start the poll loop when this file is run directly (e.g. `pnpm run worker`),
// not when imported by integration tests to reuse `drainQueueOnce`.
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  pollLoop().catch((err) => {
    logger.error({ err }, "worker crashed");
    process.exit(1);
  });
}


