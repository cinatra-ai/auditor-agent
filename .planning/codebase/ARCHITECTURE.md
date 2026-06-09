<!-- refreshed: 2026-06-09 -->
# Architecture

**Analysis Date:** 2026-06-09

## System Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Caller / Parent Agent                     │
│  Provides: data (object), parentPackageName, skillIds, run_id   │
└────────────────────────────┬────────────────────────────────────┘
                             │ invokes
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Auditor Agent Flow  (cinatra/oas.json)           │
│  kind: agent  •  agentspec_version: 26.1.0  •  id: auditor-flow │
├───────────────┬─────────────┬──────────────┬────────────────────┤
│  resolve_     │  run_skills │ review_gate  │  apply_patches     │
│  skills       │  (ApiNode)  │ (InputMsg    │  (ApiNode)         │
│  (ApiNode)    │             │  Node HITL)  │                    │
└───────┬───────┴──────┬──────┴──────┬───────┴────────┬───────────┘
        │              │             │                │
        ▼              ▼             ▼                ▼
┌────────────────────────────────────────────────────────────────┐
│              Cinatra Platform Backend APIs                      │
│  POST /api/auditor/run-skills  (phase=resolve or phase=run)    │
│  POST /api/auditor/apply                                       │
│  HITL review surface: @cinatra-ai/auditor-agent:review         │
└────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `resolve_skills` | Hybrid skill resolution: use explicit `skillIds` if provided, else call platform to resolve installed skills for `parentPackageName` | `cinatra/oas.json` |
| `run_skills` | Execute resolved skills against the data bundle via LLM; persist `SuggestionPatch[]` to `audit_events` for the review renderer | `cinatra/oas.json` |
| `review_gate` | HITL pause: render suggestions via `@cinatra-ai/auditor-agent:review`; collect `acceptedIds` and `dismissedIds` from the human | `cinatra/oas.json` |
| `apply_patches` | Deterministic patch application; replay-validates `acceptedIds ⊆` persisted suggestions for the run before mutating data | `cinatra/oas.json` |
| `extension-kind-gate.mjs` | Zero-dependency CI sanity gate: validates agent OAS for retired primitives; validates workflow BPMN shape | `extension-kind-gate.mjs` |

## Pattern Overview

**Overall:** Cinatra Platform Flow (linear DAG with HITL gate)

**Key Characteristics:**
- All business logic executes server-side in the Cinatra platform; the agent manifest (`cinatra/oas.json`) is a declarative description consumed by the platform runtime.
- No TypeScript source files exist in this repo — it is a **content-only extension** (pure `cinatra/**` manifest).
- The flow is strictly linear: `start → resolve_skills → run_skills → review_gate → apply_patches → end`.
- The HITL node (`review_gate`) is the only point where human input enters; the `apply_patches` node is always gated by `requiresApproval: true` + `approvalPolicy: always`.
- Suggestion patches are communicated out-of-band: `run_skills` persists to `audit_events`; the review renderer reads them via `getAuditDrawerDataAction()` — no on-flow data edge carries suggestions.

## Layers

**Flow Manifest Layer:**
- Purpose: Declarative definition of the agent's node graph, control-flow edges, data-flow edges, and node metadata consumed by the Cinatra runtime.
- Location: `cinatra/oas.json`
- Contains: `StartNode`, `ApiNode` × 2, `InputMessageNode` (HITL), `EndNode`, control-flow and data-flow edge arrays, per-node metadata (riskClass, requiresApproval, renderer).
- Depends on: Cinatra platform runtime (resolves `{{CINATRA_BASE_URL}}`).
- Used by: Cinatra marketplace publish pipeline and platform runtime.

**CI Gate Layer:**
- Purpose: Pre-publish validation that the manifest is free of retired CRM primitives and that the package shape is correct.
- Location: `extension-kind-gate.mjs`
- Contains: `parseArgs`, `validateAgent`, `validateWorkflow`, `validateWorkflowPackageShape`, `validateBpmnSanity`, `findWorkflowSidecars`, `runGate`, `main` — all pure functions except the top-level dispatch.
- Depends on: Node.js builtins only (`fs`, `path`). Zero registry dependencies.
- Used by: `.github/workflows/ci.yml` (`kind-gates` job).

**Package Manifest Layer:**
- Purpose: npm package identity, publish payload declaration, and Cinatra extension metadata.
- Location: `package.json`
- Contains: `cinatra.kind = "agent"`, `cinatra.apiVersion`, `cinatra.dependencies = []`, `files = ["cinatra/**"]`.
- Used by: CI (`npm pack --dry-run`), Cinatra extraction script, marketplace publish.

## Data Flow

### Primary Request Path (runtime)

1. **start** — receives `data` (object), `parentPackageName` (string), `cinatra_run_id` (string), `skillIds` (array) from the calling agent or user (`cinatra/oas.json` StartNode).
2. **resolve_skills** — `POST {{CINATRA_BASE_URL}}/api/auditor/run-skills` with `phase: "resolve"`; returns resolved `skillIds` array (`cinatra/oas.json` ApiNode).
3. **run_skills** — `POST {{CINATRA_BASE_URL}}/api/auditor/run-skills` with `phase: "run"` and resolved `skillIds`; executes LLM-driven skill heuristics; persists `SuggestionPatch[]` to `audit_events` (no on-flow output) (`cinatra/oas.json` ApiNode).
4. **review_gate** — HITL `InputMessageNode`; platform renders `@cinatra-ai/auditor-agent:review` surface to the human; human submits JSON `{ acceptedIds, dismissedIds }` encoded as a string in `reviewResult` (`cinatra/oas.json` InputMessageNode).
5. **apply_patches** — `POST {{CINATRA_BASE_URL}}/api/auditor/apply` with original `data`, `reviewResult`, and `agent_run_id`; replay-validates accepted IDs; returns `mutatedData` (`cinatra/oas.json` ApiNode).
6. **end** — emits `mutatedData` (object) as the flow's output (`cinatra/oas.json` EndNode).

### CI Validation Path

1. GitHub Actions `build` job — classifies repo as "source mirror" (has `@cinatra-ai/*` optional peers) or standalone; conditionally runs install, typecheck, test, and `npm pack --dry-run` (`.github/workflows/ci.yml`).
2. GitHub Actions `kind-gates` job (runs after `build`) — executes `node extension-kind-gate.mjs --package-root .`; calls `runGate` → `validateAgent` → scans `cinatra/oas.json` LLM-visible strings for banned primitives (`extension-kind-gate.mjs`, `cinatra/oas.json`).

**State Management:**
- No in-process state. All state (run context, suggestion patches) is owned by the Cinatra platform backend keyed on `agent_run_id` / `cinatra_run_id`.

## Key Abstractions

**SuggestionPatch:**
- Purpose: Structured audit suggestion with fields `{ id, fieldPath, op, value, message }`.
- Examples: Referenced in `run_skills` node description in `cinatra/oas.json`.
- Pattern: Persisted out-of-band to `audit_events`; consumed by the review renderer; accepted IDs passed to `apply_patches` for deterministic replay.

**Hybrid Skill Resolution (D-02):**
- Purpose: Allow callers to pass explicit `skillIds` (override) or rely on the platform to resolve installed skills for `parentPackageName` (default).
- Pattern: `resolve_skills` node, `cinatra/oas.json`.

**HITL Review Surface:**
- Purpose: Human-in-the-loop accept/dismiss gate before any data mutation.
- Examples: `review_gate` node (`cinatra/oas.json`), renderer `@cinatra-ai/auditor-agent:review`.
- Pattern: `InputMessageNode` with `requiresApproval: true`; output is JSON-string envelope `{ acceptedIds, dismissedIds }`.

## Entry Points

**Flow Entry (runtime):**
- Location: `cinatra/oas.json` → `start_node.$component_ref = "start"`
- Triggers: Invocation by any Cinatra agent or workflow passing required inputs `data` + `parentPackageName`.
- Responsibilities: Accept and forward inputs to downstream nodes.

**CI Gate Entry (development):**
- Location: `extension-kind-gate.mjs` → `main()` (invoked when script is the direct entry point)
- Triggers: `node extension-kind-gate.mjs --package-root .` (GitHub Actions `kind-gates` job).
- Responsibilities: Parse args, dispatch to `runGate`, print result, exit 0 or 1.

## Architectural Constraints

- **Threading:** Not applicable — no runtime TypeScript/JavaScript source. The gate script (`extension-kind-gate.mjs`) is synchronous Node.js (single-threaded, no worker threads).
- **Global state:** None. All gate functions are pure (inputs → string[] errors). No module-level mutable singletons.
- **Circular imports:** Not applicable — single `.mjs` file; no import graph.
- **Content-only extension:** The repo ships no TypeScript sources. The manifest (`cinatra/oas.json`) is the sole artifact published. All logic executes platform-side.
- **Zero-dependency gate:** `extension-kind-gate.mjs` intentionally imports only Node builtins so CI passes before the `@cinatra-ai/*` registry is reachable.
- **Approval gates:** `apply_patches` declares `riskClass: "write"` and `approvalPolicy: "always"` — the platform will never auto-apply patches without explicit human acceptance.

## Anti-Patterns

### Putting logic in the flow manifest

**What happens:** Business logic (skill execution, patch application) might be tempted to be inlined into the OAS JSON as prompt strings or data transforms.
**Why it's wrong:** All LLM execution and data mutation live server-side in the Cinatra platform. The OAS manifest is declarative; embedding logic breaks the platform's ability to version and audit behavior.
**Do this instead:** Keep `cinatra/oas.json` as a pure declarative graph. Business rules belong in the platform's `/api/auditor/*` handlers.

### Adding `@cinatra-ai/*` to `dependencies` or `devDependencies`

**What happens:** A developer adds a first-party package to `dependencies` or `devDependencies`.
**Why it's wrong:** The CI gate (`.github/workflows/ci.yml` classify step) will exit with code 2 and fail the build. These packages are monorepo-internal and not published to any registry.
**Do this instead:** Declare host-internal packages only as `peerDependencies` with `peerDependenciesMeta.<pkg>.optional: true`.

## Error Handling

**Strategy:** Validation-first, fail-fast.

**Patterns:**
- `extension-kind-gate.mjs` returns `string[]` error arrays from all validators; caller accumulates and reports all violations before exiting.
- Platform API nodes (`resolve_skills`, `run_skills`, `apply_patches`) rely on the Cinatra runtime for HTTP error handling and retry; no explicit error handling in the manifest.
- `apply_patches` replay-validates `acceptedIds ⊆` persisted suggestions server-side to prevent tampering.

## Cross-Cutting Concerns

**Logging:** Gate script uses `console.log` (success) and `console.error` (violations) only; no structured logging framework.
**Validation:** Two-layer — static (CI gate on OAS primitives) and runtime (platform validates patch replay integrity).
**Authentication:** Not applicable at the manifest level. Platform runtime handles auth. `cinatra_run_id` is the correlation token passed through the flow.

---

*Architecture analysis: 2026-06-09*
