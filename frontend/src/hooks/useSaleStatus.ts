import { useCallback, useEffect, useState } from "react";
import type { SaleStatusResponse } from "@flash-sale/shared";
import { fetchSaleStatus } from "../api";

const POLL_INTERVAL_MS = 3000;

export function useSaleStatus() {
  const [status, setStatus] = useState<SaleStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSaleStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sale status");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { status, error, refresh };
}
