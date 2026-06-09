# Technology Stack

**Analysis Date:** 2026-06-09

## Languages

**Primary:**
- JavaScript (ESM) - `extension-kind-gate.mjs` (self-contained CI gate, zero dependencies, Node builtins only)
- JSON - `cinatra/oas.json` (agent flow definition, agentspec_version 26.1.0)

**Secondary:**
- TypeScript (ES2023 target) - `tsconfig.json` declares `src/**/*.ts` / `src/**/*.tsx` as compilation targets; no `src/` directory is present in the current repo state (content-only extension, no TypeScript sources committed)

## Runtime

**Environment:**
- Node.js 24 (enforced by `.github/workflows/ci.yml` `setup-node` step)

**Package Manager:**
- pnpm via Corepack (`corepack enable` + `corepack pnpm` in CI)
- Lockfile: not committed (CI runs `--no-frozen-lockfile` for standalone installs)

## Frameworks

**Core:**
- Cinatra Agent Framework (agentspec v26.1.0) - the agent is defined declaratively via `cinatra/oas.json` as a `Flow` component with `ApiNode` and `InputMessageNode` primitives; no imperative framework code in repo

**Testing:**
- Not applicable — no test files present; CI runs `pnpm test --if-present`, which is a no-op for this repo

**Build/Dev:**
- TypeScript compiler (`tsc`) - config in `tsconfig.json`; targets `dist/` with `declaration`, `declarationMap`, and `sourceMap` outputs; `noEmit: false`
- `npm pack --dry-run` - used in CI to validate package shape without publishing

## Key Dependencies

**Critical:**
- None declared in `package.json` (`dependencies`, `devDependencies`, `peerDependencies` are all absent)
- The repo is a source mirror: host-internal `@cinatra-ai/*` packages are provided by the cinatra monorepo workspace at integration time, not listed as package deps

**Infrastructure:**
- `extension-kind-gate.mjs` - self-contained CI validation script (Node builtins only: `fs`, `path`); validates `cinatra/oas.json` for retired CRM primitives in LLM-visible prompt strings

## Configuration

**Environment:**
- `.npmrc` present — note existence only, contents not read
- `CINATRA_BASE_URL` — runtime template variable referenced in `cinatra/oas.json` API node URLs (e.g., `{{CINATRA_BASE_URL}}/api/auditor/run-skills`); injected by the Cinatra platform at agent execution time
- `CINATRA_MARKETPLACE_VENDOR_TOKEN` — org-level GitHub secret used by the release workflow for marketplace submission

**Build:**
- `tsconfig.json` - standalone strict TypeScript config (ES2023, ESNext modules, bundler resolution, `react-jsx`, `strict: true`, `noImplicitAny: false`)

## Platform Requirements

**Development:**
- Node.js 24+
- pnpm (via Corepack)
- Cinatra monorepo workspace for full typecheck/test (this repo is a source mirror)

**Production:**
- Cinatra Marketplace / `registry.cinatra.ai`
- Published via GitHub Release tag matching `v<package.json.version>`
- Release pipeline: `cinatra-ai/.github/.github/workflows/reusable-extension-release.yml@main`
- Package publishes only `cinatra/**` (`files` field in `package.json`)

---

*Stack analysis: 2026-06-09*
