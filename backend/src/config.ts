import "dotenv/config";

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  saleStart: new Date(env.SALE_START ?? "2026-09-24T00:00:00.000Z"),
  saleEnd: new Date(env.SALE_END ?? "2026-09-25T00:00:00.000Z"),
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
} as const;
