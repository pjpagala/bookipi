import type { SaleStatus } from "@flash-sale/shared";

// Active window is [saleStart, saleEnd) — inclusive start, exclusive end.
export function getSaleStatus(now: Date, saleStart: Date, saleEnd: Date): SaleStatus {
  if (now.getTime() < saleStart.getTime()) return "upcoming";
  if (now.getTime() >= saleEnd.getTime()) return "ended";
  return "active";
}
