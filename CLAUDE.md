# CLAUDE.md

Guidance for AI assistants (Claude Code, GitHub Copilot, etc.) working in this repository.

## Project

This repo is a take-home technical assessment for **Bookipi**: a **High-Throughput Flash Sale System** — a backend + frontend that lets thousands of concurrent users attempt to buy one unit of a single limited-stock product, enforcing "one item per user" and "no overselling" under load.

Full original brief: [Takehomeassessment.md](Takehomeassessment.md).

## Submission Constraints (from Bookipi email)

- Deadline: up to 7 days from receipt. Assessment started 2026-09-24 — aim to finish well before 2026-10-01.
- Must push to a **public** GitHub repo before submitting.
- Send the repo link to `aldo@bookipi.com` when ready (ask the user to confirm before this step — do not send emails automatically).
- AI assistance is explicitly allowed, but the candidate must be able to explain and defend every part of the solution (architecture, code, trade-offs) in a follow-up conversation. Favor clear, conventional, explainable patterns over clever/opaque ones. Avoid unnecessary abstraction or dependencies that would be hard to justify live.

## There WILL be a follow-up technical interview — this is not hypothetical

Direct quote from Bookipi's email, repeated here because it materially affects every implementation choice in this repo:

> "If you progress to the next stage, you may be asked to present your solution, walk us through the architecture and code, explain your technical decisions, and make or discuss changes to the implementation."

Implications for how we work:
- The candidate (not the AI) must be able to explain every file, dependency, and design decision unprompted, live, without notes.
- Prefer boring, standard, well-known patterns over clever ones — cleverness that can't be defended on the spot is a liability, not a strength.
- Every non-obvious choice (e.g. DynamoDB `TransactWriteItems`, SQS Standard vs FIFO, async 202+poll UX) must have a recorded rationale (see `plan.md` "Why this design" and "Decisions") so it can be re-explained on demand.
- Interviewers may ask to modify the implementation live — so the code must stay simple enough to change confidently under time pressure, not just to run correctly once.
- `DEMO_GUIDE.md` and `TEST_CASES.md` (see `plan.md` Phase F) exist specifically to prep for both the initial demo and this later interview.

## Hard Requirements (must not be dropped)

**Functional**
- Configurable flash sale start/end time; purchases only allowed while active.
- Single product, fixed limited stock.
- Enforce exactly one purchase per user.
- API endpoints: sale status (upcoming/active/ended), attempt purchase, check own purchase result.
- React frontend: show sale status, enter user identifier, "Buy Now" button, clear feedback (success / already purchased / sold out / sale not active).
- A system architecture diagram (justify component choices).

**Non-functional**
- High throughput / scalability — identify bottlenecks and mitigations.
- Robustness / fault tolerance — reason about crashes, network issues under load.
- Correct concurrency control — no overselling, no double-purchase, even under race conditions.

**Testing**
- Unit + integration tests for business logic and API endpoints.
- Stress/load tests proving concurrency safety under high concurrent load, with an explainable summary of results.

## Technical Guardrails

- Language: TypeScript 
- Backend: Node.js — Express, Fastify, NestJS, or native `http`.
- Frontend: React.
- Cloud-style services (queues, distributed cache, DB) may be mocked, run locally in Docker, or simulated in-memory — as long as the README explains the reasoning and what a production version would use instead. use AWS localstack

## Decisions

Final stack/architecture choices, locked after the planning Q&A (full rationale in [plan.md](plan.md) "Why this design" and "Locked decisions"):

- **Runtime**: Node.js v24.21.0 (latest LTS) via nvm, **pnpm** (via corepack) as package manager, **pnpm workspaces** monorepo (`backend/`, `frontend/`, `shared/`, `stress-test/`).
- **Backend framework**: Fastify.
- **Persistence**: DynamoDB via LocalStack. Concurrency safety (no oversell, no double-purchase) comes entirely from a single `TransactWriteItems` call (conditional stock decrement + conditional purchase-record put) — no app-level locks/mutexes.
- **Queue**: SQS Standard (not FIFO) via LocalStack, between the API and a separate worker process. `POST /purchase` enqueues and returns `202` immediately; the worker performs the actual DynamoDB transaction. Standard is sufficient because correctness is enforced at the DynamoDB layer even under duplicate/concurrent delivery.
- **Frontend**: Vite + React + TypeScript. `PurchaseForm` checks `GET /purchase/:userId` before enqueueing (UX-only optimization; server-side conditional write is the real enforcement).
- **Testing**: Vitest for unit + integration (integration runs against real LocalStack with dedicated `*Test`-suffixed tables/queue). Stress test is a standalone pure-HTTP-client script (`stress-test/`), no AWS SDK dependency, batched concurrency to avoid client-side socket exhaustion.
- **Logging**: structured (pino) with a `correlationId` per purchase attempt traceable across the API and worker processes.
- **Docker**: only LocalStack is containerized; backend/frontend/tests run directly via Node on the host.

## Deliverables Checklist

- [ ] Public Git repo with full source.
- [x] README.md: design choices & trade-offs, system diagram, build/run instructions (server, frontend, tests), stress test instructions + expected/actual results summary.
- [x] Working backend API.
- [x] Working React frontend.
- [x] Unit/integration tests.
- [x] Stress test suite + results write-up.
- [x] Architecture diagram.

## Working Agreement for This Repo

- Current phase: Phase E (docs) of [plan.md](plan.md) — core backend, frontend, and all automated tests are done and passing. See plan.md's Status checklist for exact progress.
- Decisions are recorded above and in plan.md — keep both in sync when anything changes.
- Keep code simple, well-structured, and idiomatic — reviewers are explicitly grading clarity over cleverness.
- When scaffolding subprojects (e.g. `backend/`, `frontend/`), add a short nested `CLAUDE.md` in each if it has its own build/run/test conventions worth documenting locally.
