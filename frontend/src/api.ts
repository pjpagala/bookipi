import type {
  PurchaseAttemptResponse,
  PurchaseStatusResponse,
  SaleNotActiveResponse,
  SaleStatusResponse,
} from "@flash-sale/shared";

// Relative by default so the Vite dev proxy (see vite.config.ts) handles it;
// override via VITE_API_BASE_URL for a build served separately from the API.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchSaleStatus(): Promise<SaleStatusResponse> {
  const res = await fetch(`${BASE_URL}/sale/status`);
  if (!res.ok) throw new Error(`Failed to fetch sale status (${res.status})`);
  return res.json();
}

export async function fetchPurchaseStatus(userId: string): Promise<PurchaseStatusResponse> {
  const res = await fetch(`${BASE_URL}/purchase/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`Failed to fetch purchase status (${res.status})`);
  return res.json();
}

export type PurchaseSubmitResult =
  | { kind: "pending" }
  | { kind: "sale_not_active"; saleStatus: SaleNotActiveResponse["saleStatus"] };

export async function submitPurchase(userId: string): Promise<PurchaseSubmitResult> {
  const res = await fetch(`${BASE_URL}/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  if (res.status === 202) {
    (await res.json()) as PurchaseAttemptResponse;
    return { kind: "pending" };
  }
  if (res.status === 409) {
    const body = (await res.json()) as SaleNotActiveResponse;
    return { kind: "sale_not_active", saleStatus: body.saleStatus };
  }
  throw new Error(`Unexpected response from purchase attempt (${res.status})`);
}
