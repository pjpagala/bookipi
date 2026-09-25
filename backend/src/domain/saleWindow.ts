import type { SaleStatus } from "@flash-sale/shared";

// TODO: implement — should return "upcoming" | "active" | "ended" based on the sale window.
export function getSaleStatus(now: Date, saleStart: Date, saleEnd: Date): SaleStatus {
  return "upcoming";
}
