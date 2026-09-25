import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type {
  PurchaseAttemptResponse,
  PurchaseStatusResponse,
  SaleNotActiveResponse,
} from "@flash-sale/shared";
import { ddbDocClient, sqsClient, getQueueUrl } from "../aws/clients.js";
import { config } from "../config.js";
import { getSaleStatus } from "../domain/saleWindow.js";

interface PurchaseBody {
  userId?: string;
}

export async function purchaseRoutes(app: FastifyInstance) {
  app.post<{ Body: PurchaseBody }>("/purchase", async (request, reply) => {
    const { userId } = request.body ?? {};
    if (!userId || typeof userId !== "string") {
      return reply.status(400).send({ error: "userId is required" });
    }

    // correlationId ties this request's logs to the worker's logs for the same attempt.
    const correlationId = randomUUID();
    const log = request.log.child({ correlationId, userId });
    log.info("purchase attempt received");

    const saleStatus = getSaleStatus(new Date(), config.saleStart, config.saleEnd);
    if (saleStatus !== "active") {
      log.info({ saleStatus }, "purchase rejected: sale not active");
      const body: SaleNotActiveResponse = { status: "SALE_NOT_ACTIVE", saleStatus };
      return reply.status(409).send(body);
    }

    const queueUrl = await getQueueUrl();
    const { MessageId } = await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ userId, correlationId }),
      })
    );
    log.info({ messageId: MessageId }, "purchase attempt enqueued");

    const body: PurchaseAttemptResponse = { status: "pending" };
    return reply.status(202).send(body);
  });


  app.get<{ Params: { userId: string } }>("/purchase/:userId", async (request): Promise<PurchaseStatusResponse> => {
    const { userId } = request.params;

    const existing = await ddbDocClient.send(
      new GetCommand({ TableName: config.tables.purchases, Key: { pk: userId } })
    );
    if (existing.Item) {
      return { status: "PURCHASED", purchasedAt: existing.Item.purchasedAt };
    }

    const saleStatus = getSaleStatus(new Date(), config.saleStart, config.saleEnd);
    if (saleStatus === "ended") {
      return { status: "NOT_PURCHASED" };
    }

    const inventory = await ddbDocClient.send(
      new GetCommand({ TableName: config.tables.inventory, Key: { pk: "PRODUCT" } })
    );
    if ((inventory.Item?.stock ?? 0) <= 0) {
      return { status: "SOLD_OUT" };
    }

    return { status: "PENDING" };
  });
}
