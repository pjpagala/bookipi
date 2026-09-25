import pino from "pino";

// Shared logger factory so the API and worker processes emit consistently-shaped
// structured logs — makes it possible to grep a single correlationId across both.
export function createLogger(name: string) {
  return pino({ name, level: process.env.LOG_LEVEL ?? "info" });
}
