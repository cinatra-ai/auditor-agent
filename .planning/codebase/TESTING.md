# Testing Patterns

**Analysis Date:** 2026-06-09

## Test Framework

**Runner:** Not detected — no test framework is installed or configured in `package.json`. No `jest.config.*`, `vitest.config.*`, or `mocha` config is present.

**Assertion Library:** Not detected.

**Run Commands:**
```bash
# No test script defined in package.json.
# CI runs: corepack pnpm test --if-present
# (succeeds with no-op when the `test` script is absent)
```

## Test File Organization

**Location:** No test files exist in this repository. The repo contains only:
- `extension-kind-gate.mjs` — the sole implementation file
- `cinatra/oas.json` — generated agent spec artifact
- `package.json`, `tsconfig.json`, CI workflow, `README.md`, `LICENSE`

**Naming:** Not applicable — no tests exist.

## Test Structure

**Suite Organization:** Not applicable.

**Patterns:** Not applicable.

## Mocking

**Framework:** Not detected.

**Patterns:** Not applicable.

**What to Mock:** Not applicable.

**What NOT to Mock:** Not applicable.

## Fixtures and Factories

**Test Data:** Not applicable — no tests exist.

**Location:** Not applicable.

## Coverage

**Requirements:** None enforced. No coverage configuration is present.

**View Coverage:** Not applicable.

## Test Types

**Unit Tests:** None. However, all exported functions in `extension-kind-gate.mjs` are designed to be unit-testable:
- `parseArgs(argv)` — pure, takes argv array
- `validateAgent(packageRoot)` — pure, returns `string[]`
- `validateWorkflowPackageShape(pkg)` — pure, returns `string[]`
- `validateBpmnSanity(xml)` — pure, takes XML string, returns `string[]`
- `findWorkflowSidecars(packageRoot)` — filesystem walk, returns `string[]`
- `runGate(packageRoot)` — dispatches to above, returns `{ kind, errors }`

The entry-point guard pattern (`invokedDirectly` check) explicitly enables importing the module without triggering `main()`, making the validators importable in a test environment.

**Integration Tests:** None.

**E2E Tests:** Not used.

## CI Testing Strategy

The repo relies on CI (`ci.yml`) rather than a local test suite:

1. **Dependency-shape validation** (inline Node.js script in CI) — verifies no first-party `@cinatra-ai/*` packages leaked into `dependencies`/`devDependencies`.
2. **Agent OAS gate** — runs `node extension-kind-gate.mjs --package-root .` directly; validates `cinatra/oas.json` for retired CRM primitives.
3. **Pack dry-run** — `npm pack --dry-run` validates the publish payload shape.

Since this repo has host-internal `@cinatra-ai/*` optional peers, CI skips standalone install, typecheck, and `pnpm test`. The monorepo owns those steps.

## Common Patterns

**Async Testing:** Not applicable — all validators are synchronous.

**Error Testing:** Not applicable — no test suite. Validators are designed to return errors as `string[]` rather than throw, which simplifies assertion: `expect(errors).toContain("...")`.

## Recommendations for Adding Tests

If tests are added, the recommended approach given the existing code structure:
- Use Node's built-in `node:test` runner (no external dependency, compatible with zero-dep philosophy) or Vitest
- Test `validateBpmnSanity` and `validateWorkflowPackageShape` as pure unit tests (no filesystem needed)
- Test `validateAgent` and `findWorkflowSidecars` with a temporary directory fixture using `node:fs/promises` + `node:os` `mkdtemp`
- Add `"test": "node --test"` or `"test": "vitest run"` to `package.json` scripts

---

*Testing analysis: 2026-06-09*
