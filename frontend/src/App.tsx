import { useSaleStatus } from "./hooks/useSaleStatus";
import { PurchaseForm } from "./components/PurchaseForm";
import "./App.css";

function formatCountdown(target: string): string {
  const diffMs = new Date(target).getTime() - Date.now();
  if (diffMs <= 0) return "0s";
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`].filter(Boolean).join(" ");
}

function App() {
  const { status, error, refresh } = useSaleStatus();

  return (
    <div className="app">
      <h1>Flash Sale</h1>

      {error && <p className="feedback error">{error}</p>}

      {!status ? (
        <p>Loading sale status…</p>
      ) : (
        <>
          <div className={`sale-banner ${status.status}`}>
            {status.status === "upcoming" && <p>Sale starts in {formatCountdown(status.startsAt)}</p>}
            {status.status === "active" && <p>Sale is live — {status.stockRemaining} item(s) left</p>}
            {status.status === "ended" && <p>Sale has ended</p>}
          </div>

          <PurchaseForm saleStatus={status.status} onPurchased={refresh} />
        </>
      )}
    </div>
  );
}

export default App;

