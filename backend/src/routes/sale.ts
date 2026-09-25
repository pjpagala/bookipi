import type { FastifyInstance } from "fastify";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { SaleStatusResponse } from "@flash-sale/shared";
import { ddbDocClient } from "../aws/clients.js";
import { config } from "../config.js";
import { getSaleStatus } from "../domain/saleWindow.js";

export async function saleRoutes(app: FastifyInstance) {
  app.get("/sale/status", async (): Promise<SaleStatusResponse> => {
    const status = getSaleStatus(new Date(), config.saleStart, config.saleEnd);
    const result = await ddbDocClient.send(
      new GetCommand({ TableName: config.tables.inventory, Key: { pk: "PRODUCT" } })
    );

    return {
      status,
      startsAt: config.saleStart.toISOString(),
      endsAt: config.saleEnd.toISOString(),
      stockRemaining: result.Item?.stock ?? 0,
    };
  });
}
