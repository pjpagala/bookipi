import "dotenv/config";

const env = process.env;

// Default sale window is relative to "now" (1 hour ago -> 24 hours from now) rather than a
// fixed date, so the app is always "active" out of the box regardless of when it's run.
const now = Date.now();
const defaultSaleStart = new Date(now - 60 * 60 * 1000).toISOString();
const defaultSaleEnd = new Date(now + 24 * 60 * 60 * 1000).toISOString();

export const config = {
  port: Number(env.PORT ?? 3000),
  saleStart: new Date(env.SALE_START ?? defaultSaleStart),
  saleEnd: new Date(env.SALE_END ?? defaultSaleEnd),
  stockQuantity: Number(env.STOCK_QUANTITY ?? 100),
  aws: {
    endpoint: env.AWS_ENDPOINT ?? "http://localhost:4566",
    region: env.AWS_REGION ?? "us-east-1",
    accessKeyId: env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "test",
  },
  tables: {
    inventory: env.INVENTORY_TABLE ?? "Inventory",
    purchases: env.PURCHASES_TABLE ?? "Purchases",
  },
  queueName: env.PURCHASE_QUEUE_NAME ?? "flash-sale-purchases",
  // Poison messages (e.g. a handler bug that fails every time) get redirected here after
  // maxReceiveCount retries instead of cycling through the main queue forever.
  deadLetterQueueName: env.PURCHASE_DLQ_NAME ?? `${env.PURCHASE_QUEUE_NAME ?? "flash-sale-purchases"}-dlq`,
  maxReceiveCount: Number(env.PURCHASE_MAX_RECEIVE_COUNT ?? 3),
} as const;

