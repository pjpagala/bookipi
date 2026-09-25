import { useState } from "react";
import type { SaleStatus } from "@flash-sale/shared";
import { fetchPurchaseStatus, submitPurchase } from "../api";

interface PurchaseFormProps {
  saleStatus: SaleStatus;
  onPurchased: () => void; // lets the parent refresh the stock count
}

type Feedback =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "submitting" }
  | { kind: "processing" }
  | { kind: "purchased"; purchasedAt?: string }
  | { kind: "already_purchased"; purchasedAt?: string }
  | { kind: "sold_out" }
  | { kind: "not_purchased" }
  | { kind: "sale_not_active"; saleStatus: SaleStatus }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PurchaseForm({ saleStatus, onPurchased }: PurchaseFormProps) {
  const [userId, setUserId] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  const busy = feedback.kind === "checking" || feedback.kind === "submitting" || feedback.kind === "processing";

  async function handleBuyNow() {
    const trimmed = userId.trim();
    if (!trimmed) {
      setFeedback({ kind: "error", message: "Enter a user identifier first." });
      return;
    }

    setFeedback({ kind: "checking" });
    try {
      // Short-circuit: skip enqueuing a new attempt if this user already secured an item.
      const existing = await fetchPurchaseStatus(trimmed);
      if (existing.status === "PURCHASED") {
        setFeedback({ kind: "already_purchased", purchasedAt: existing.purchasedAt });
        return;
      }
    } catch (err) {
      setFeedback({ kind: "error", message: err instanceof Error ? err.message : "Failed to check purchase status" });
      return;
    }

    setFeedback({ kind: "submitting" });
    try {
      const result = await submitPurchase(trimmed);
      if (result.kind === "sale_not_active") {
        setFeedback({ kind: "sale_not_active", saleStatus: result.saleStatus });
        return;
      }
    } catch (err) {
      setFeedback({ kind: "error", message: err instanceof Error ? err.message : "Failed to submit purchase" });
      return;
    }

    setFeedback({ kind: "processing" });
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      try {
        const outcome = await fetchPurchaseStatus(trimmed);
        if (outcome.status === "PURCHASED") {
          setFeedback({ kind: "purchased", purchasedAt: outcome.purchasedAt });
          onPurchased();
          return;
        }
        if (outcome.status === "SOLD_OUT") {
          setFeedback({ kind: "sold_out" });
          return;
        }
        if (outcome.status === "NOT_PURCHASED") {
          setFeedback({ kind: "not_purchased" });
          return;
        }
        // still PENDING — keep polling
      } catch (err) {
        setFeedback({ kind: "error", message: err instanceof Error ? err.message : "Failed to check purchase result" });
        return;
      }
    }
    setFeedback({ kind: "error", message: "Still processing — please check again in a moment." });
  }

  return (
    <div className="purchase-form">
      <input
        type="text"
        placeholder="Enter your user ID (e.g. email)"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        disabled={busy}
      />
      <button type="button" onClick={handleBuyNow} disabled={busy || saleStatus !== "active"}>
        {busy ? "Processing…" : "Buy Now"}
      </button>
      <FeedbackMessage feedback={feedback} />
    </div>
  );
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  switch (feedback.kind) {
    case "idle":
      return null;
    case "checking":
      return <p className="feedback">Checking your status…</p>;
    case "submitting":
      return <p className="feedback">Submitting your purchase…</p>;
    case "processing":
      return <p className="feedback">Processing your purchase…</p>;
    case "purchased":
      return <p className="feedback success">Success! You've secured your item.</p>;
    case "already_purchased":
      return (
        <p className="feedback info">
          You've already secured an item{feedback.purchasedAt ? ` on ${new Date(feedback.purchasedAt).toLocaleString()}` : ""}.
        </p>
      );
    case "sold_out":
      return <p className="feedback error">Sold out — better luck next time.</p>;
    case "not_purchased":
      return <p className="feedback error">The sale has ended and you did not secure an item.</p>;
    case "sale_not_active":
      return <p className="feedback error">The sale is not currently active ({feedback.saleStatus}).</p>;
    case "error":
      return <p className="feedback error">{feedback.message}</p>;
  }
}
