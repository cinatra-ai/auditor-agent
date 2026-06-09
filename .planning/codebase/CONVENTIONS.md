# Coding Conventions

**Analysis Date:** 2026-06-09

## Overview

This is a small, content-only Cinatra agent extension repo. The sole implementation file is `extension-kind-gate.mjs` — a self-contained, zero-dependency Node.js ES module CI gate. There is no `src/` directory. The `cinatra/oas.json` is a generated artifact; `package.json` is the extension manifest.

## Naming Patterns

**Files:**
- `kebab-case` with `.mjs` extension for standalone ES module scripts: `extension-kind-gate.mjs`
- `camelCase` for internal JS identifiers (functions, variables, constants)
- `SCREAMING_SNAKE_CASE` for module-level constants: `LLM_VISIBLE_FIELDS`, `BANNED_PRIMITIVES`, `BPMN_MODEL_NS`

**Functions:**
- `camelCase` for all exported and internal functions: `parseArgs`, `validateAgent`, `validateBpmnSanity`, `walkLlmStrings`, `scanOasString`, `findWorkflowSidecars`, `runGate`
- Private helpers (not exported) use the same `camelCase` pattern: `wordBoundary`, `walkLlmStrings`, `scanOasString`

**Variables:**
- `camelCase` for locals: `packageRoot`, `oasPath`, `findings`, `bpmnPrefixes`
- Short loop variables `m`, `nm` used for regex match results
- Destructuring preferred over indexed access: `const { kind, errors } = runGate(packageRoot)`

**Types:**
- No TypeScript in `extension-kind-gate.mjs` (it is plain JS). `tsconfig.json` is present for future `src/` TypeScript sources targeting ES2023/ESNext with `strict: true` and `verbatimModuleSyntax: true`.

## Code Style

**Formatting:**
- No formatter config detected (no `.prettierrc`, `biome.json`, or `.eslintrc`). The file uses consistent 2-space indentation throughout.

**Linting:**
- No linter config detected. The gate file self-describes as "self-contained, zero-dependency" — linting is inherited from the monorepo at extraction time.

**Module system:**
- `"type": "module"` in `package.json` — ESM throughout.
- All imports use named Node built-ins: `import { readFileSync, existsSync, readdirSync } from "node:fs"` (explicit `node:` prefix required).
- No third-party imports in `extension-kind-gate.mjs`.

## Import Organization

**Order (as observed in `extension-kind-gate.mjs`):**
1. Node built-ins with explicit `node:` prefix (`node:fs`, `node:path`)
2. No external or internal imports (intentional constraint — zero-dependency design)

**Path Aliases:**
- Not applicable — single-file module with no internal imports.

## Error Handling

**Pattern:** Pure functions return `string[]` error arrays rather than throwing. Callers accumulate and inspect the array.

```js
// extension-kind-gate.mjs
export function validateAgent(packageRoot) {
  const errors = [];
  // ...
  return errors; // empty = pass, non-empty = fail
}
```

**I/O errors** are caught with try/catch and pushed into the errors array as strings:
```js
try {
  parsed = JSON.parse(readFileSync(oasPath, "utf8"));
} catch (err) {
  errors.push(`cinatra/oas.json failed to parse: ${err instanceof Error ? err.message : String(err)}`);
  return errors;
}
```

**Top-level** (`main`) uses a global try/catch with `process.exit(1)` on unexpected errors.

**Exit codes:** `0` = pass, `1` = violations found.

## Logging

**Framework:** `console.log` / `console.error` (no logging library).

**Patterns:**
- Success: `console.log("✓ extension-kind-gate: ...")` 
- Failure: `console.error("✗ extension-kind-gate: ...")` followed by per-error `console.error("  • " + e)`
- Logging only in `main()`. Exported validator functions are pure (no side effects, no I/O logging).

## Comments

**When to Comment:**
- Block comments at the top of each logical section using `// ---` dividers.
- Inline comments explain non-obvious design constraints, especially "why NOT" decisions (e.g., why `pnpm dlx` is avoided, why partial XML parsing is intentional).
- JSDoc-style `/** ... */` used on exported functions to document purpose and purity contract.

**Example:**
```js
/** Validate an agent extension at packageRoot. Pure: returns string[] errors. */
export function validateAgent(packageRoot) { ... }
```

## Function Design

**Size:** Functions are medium-length (20–80 lines). Each function does one well-scoped thing.

**Parameters:** Functions take a single `packageRoot` string or a parsed value (e.g., `pkg` object, `xml` string). No options objects.

**Return Values:** Exported validators always return `string[]`. Internal helpers return booleans, sets, or arrays. Never throws except `parseArgs` (which is called before any validation).

**Purity:** Exported validators are pure (no I/O side effects). I/O is isolated to `runGate`, `validateWorkflow`, `findWorkflowSidecars`, and `main`.

## Module Design

**Exports:** Named exports for all validator functions and helpers:
- `parseArgs`, `validateAgent`, `validateWorkflowPackageShape`, `validateBpmnSanity`, `findWorkflowSidecars`, `validateWorkflow`, `runGate`

**Entry Point Guard:**
```js
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) { main(); }
```
This pattern allows the file to be imported as a module (for testing) without running `main()` as a side effect.

## TypeScript Config (for future `src/` sources)

Key settings in `tsconfig.json`:
- `"strict": true` with `"noImplicitAny": false` (strict but slightly relaxed)
- `"verbatimModuleSyntax": true` — type-only imports must use `import type`
- `"moduleResolution": "bundler"` — for bundler-compatible resolution
- `"isolatedModules": true` — each file must be independently compilable
- Target: `ES2023`, module: `ESNext`

---

*Convention analysis: 2026-06-09*
