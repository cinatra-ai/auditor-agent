# External Integrations

**Analysis Date:** 2026-06-09

## APIs & External Services

**Cinatra Platform API:**
- Auditor run-skills endpoint — resolves and executes audit skills against a content bundle
  - URL template: `{{CINATRA_BASE_URL}}/api/auditor/run-skills`
  - HTTP method: POST
  - Called by two `ApiNode` flow nodes: `resolve_skills` (phase: "resolve") and `run_skills` (phase: "run")
  - Auth: `CINATRA_BASE_URL` injected at runtime by platform; no explicit auth header in `cinatra/oas.json`
  - Defined in: `cinatra/oas.json`

- Auditor apply endpoint — deterministically applies accepted patches to the content bundle
  - URL template: `{{CINATRA_BASE_URL}}/api/auditor/apply`
  - HTTP method: POST
  - Called by `apply_patches` `ApiNode` flow node
  - Auth: same platform-injected base URL
  - Defined in: `cinatra/oas.json`

**Cinatra Marketplace:**
- Extension submission on GitHub Release via `cinatra-ai/.github/.github/workflows/reusable-extension-release.yml@main`
- Uses org secret `CINATRA_MARKETPLACE_VENDOR_TOKEN`
- Publish target: `registry.cinatra.ai`
- Defined in: `.github/workflows/release.yml`

## Data Storage

**Databases:**
- Not applicable — this is a declarative flow extension. Data persistence (audit_events / SuggestionPatch[]) is handled server-side by the Cinatra platform API (`/api/auditor/run-skills`), not by this repo

**File Storage:**
- Not applicable

**Caching:**
- Not applicable

## Authentication & Identity

**Auth Provider:**
- Cinatra platform (runtime injection of `CINATRA_BASE_URL`); no OAuth, API key, or JWT configuration in this repo
- Marketplace auth: `CINATRA_MARKETPLACE_VENDOR_TOKEN` GitHub org secret (used only in release CI, not in agent runtime)

## Monitoring & Observability

**Error Tracking:**
- Not detected — no error tracking SDK configured in this repo

**Logs:**
- Cinatra platform handles runtime logging server-side; `extension-kind-gate.mjs` writes violations to stdout/stderr (Node `console.error`)

## CI/CD & Deployment

**Hosting:**
- Cinatra Marketplace (`registry.cinatra.ai`)

**CI Pipeline:**
- GitHub Actions
  - `ci.yml` — runs on push/PR to `main`; validates package shape, skips install/typecheck/test for source-mirror repos (those declaring host-internal `@cinatra-ai/*` optional peers), then runs `extension-kind-gate.mjs` for agent OAS validation
  - `release.yml` — triggers on GitHub Release published event; delegates to reusable org workflow for marketplace submission with build-provenance attestation (`id-token: write`, `attestations: write`)

## Environment Configuration

**Required env vars at agent runtime:**
- `CINATRA_BASE_URL` — base URL for Cinatra platform API calls (injected by platform, not configured in repo)

**Required secrets in GitHub org:**
- `CINATRA_MARKETPLACE_VENDOR_TOKEN` — used by `release.yml` for marketplace submission

**Secrets location:**
- GitHub org-level secrets (not stored in repo); `.npmrc` present in repo root (contents not read)

## Webhooks & Callbacks

**Incoming:**
- `InputMessageNode` (id: `review_gate`) — the agent pauses flow execution and surfaces a HITL review screen; the human submits accepted/dismissed suggestion IDs via the `@cinatra-ai/auditor-agent:review` renderer surface (`a2uiSurfaceId: auditor:review-gate:input`); the review result re-enters flow as a JSON-encoded string `{ acceptedIds: string[], dismissedIds: string[] }`
- Defined in: `cinatra/oas.json` (`$referenced_components.review_gate`)

**Outgoing:**
- POST `{{CINATRA_BASE_URL}}/api/auditor/run-skills` (phase: resolve) — skill resolution
- POST `{{CINATRA_BASE_URL}}/api/auditor/run-skills` (phase: run) — skill execution, persists `SuggestionPatch[]` to platform-side `audit_events`
- POST `{{CINATRA_BASE_URL}}/api/auditor/apply` — deterministic patch application, returns `mutatedData`

---

*Integration audit: 2026-06-09*
