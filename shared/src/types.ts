// Shared API contract types used by both backend and frontend.

export type SaleStatus = "upcoming" | "active" | "ended";

export interface SaleStatusResponse {
  status: SaleStatus;
  startsAt: string; // ISO timestamp
  endsAt: string; // ISO timestamp
  stockRemaining: number;
}

export interface PurchaseAttemptResponse {
  status: "pending";
}

export interface SaleNotActiveResponse {
  status: "SALE_NOT_ACTIVE";
  saleStatus: SaleStatus;
}

// Outcome of a user's purchase, derived by GET /purchase/:userId.
export type PurchaseOutcome =
  | "PENDING" // enqueued/still processing, or sale active and user hasn't attempted yet
  | "PURCHASED"
  | "SOLD_OUT"
  | "NOT_PURCHASED"; // sale ended and user never secured an item

export interface PurchaseStatusResponse {
  status: PurchaseOutcome;
  purchasedAt?: string; // ISO timestamp, present only when status is PURCHASED
}
