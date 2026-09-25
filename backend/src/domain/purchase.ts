export type PurchaseOutcome = "PURCHASED" | "SOLD_OUT" | "ALREADY_PURCHASED";

// TODO: implement — should atomically decrement stock and record the purchase.
export async function attemptPurchase(userId: string): Promise<PurchaseOutcome> {
  throw new Error("not implemented");
}
