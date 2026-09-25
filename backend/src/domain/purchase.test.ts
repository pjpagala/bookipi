import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { ddbDocClient } from "../aws/clients.js";
import { attemptPurchase } from "./purchase.js";

const ddbMock = mockClient(ddbDocClient);

function cancelled(reasons: Array<{ Code: string }>): TransactionCanceledException {
  return new TransactionCanceledException({
    message: "Transaction cancelled",
    CancellationReasons: reasons,
    $metadata: {},
  });
}

beforeEach(() => {
  ddbMock.reset();
});

describe("attemptPurchase", () => {
  it("returns PURCHASED when the transaction succeeds", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    await expect(attemptPurchase("alice", "corr-1")).resolves.toBe("PURCHASED");
  });

  it("stores productId and correlationId on the purchase record", async () => {
    ddbMock.on(TransactWriteCommand).resolves({});
    await attemptPurchase("alice", "corr-1");

    const call = ddbMock.commandCalls(TransactWriteCommand)[0]!;
    const putItem = call.args[0].input.TransactItems?.[1]?.Put?.Item;
    expect(putItem).toMatchObject({ pk: "alice", productId: "PRODUCT", correlationId: "corr-1" });
  });

  it("returns SOLD_OUT when only the inventory condition fails", async () => {
    ddbMock
      .on(TransactWriteCommand)
      .rejects(cancelled([{ Code: "ConditionalCheckFailed" }, { Code: "None" }]));
    await expect(attemptPurchase("alice", "corr-1")).resolves.toBe("SOLD_OUT");
  });

  it("returns ALREADY_PURCHASED when only the purchase-record condition fails", async () => {
    ddbMock
      .on(TransactWriteCommand)
      .rejects(cancelled([{ Code: "None" }, { Code: "ConditionalCheckFailed" }]));
    await expect(attemptPurchase("alice", "corr-1")).resolves.toBe("ALREADY_PURCHASED");
  });

  it("prioritizes ALREADY_PURCHASED when both conditions fail", async () => {
    ddbMock
      .on(TransactWriteCommand)
      .rejects(cancelled([{ Code: "ConditionalCheckFailed" }, { Code: "ConditionalCheckFailed" }]));
    await expect(attemptPurchase("alice", "corr-1")).resolves.toBe("ALREADY_PURCHASED");
  });

  it("rethrows unexpected errors so the worker retries the message", async () => {
    ddbMock.on(TransactWriteCommand).rejects(new Error("network blip"));
    await expect(attemptPurchase("alice", "corr-1")).rejects.toThrow("network blip");
  });
});
