---
title: Replacing removed TS6 APIs in @stryker-mutator/core for TypeScript 7
date: 2026-07-15
category: runtime-errors/
module: "@stryker-mutator/core"
problem_type: runtime_error
component: tooling
severity: high
symptoms:
  - "pnpm --filter <pkg> mutation crashes with TypeError: ts.parseConfigFileTextToJson is not a function"
  - "pnpm --filter <pkg> mutation crashes with TypeError: ts.resolveProjectReferencePath is not a function"
root_cause: wrong_api
resolution_type: code_fix
tags:
  - stryker
  - typescript7
  - typescript-checker
  - tsconfig
  - mutation-testing
---

# Replacing removed TS6 APIs in @stryker-mutator/core for TypeScript 7

## Problem

TypeScript 7 (native Go port) removed two TS6 APIs: `ts.parseConfigFileTextToJson()` and `ts.resolveProjectReferencePath()`. `@stryker-mutator/core` v9.6.1's `TSConfigPreprocessor` called both via dynamic `import('typescript')`, crashing all Stryker mutation runs under TypeScript 7.

## Symptoms

- `pnpm --filter <pkg> mutation` crashes with `TypeError: ts.parseConfigFileTextToJson is not a function`
- `pnpm --filter <pkg> mutation` crashes with `TypeError: ts.resolveProjectReferencePath is not a function`
- The crash occurs during sandbox preprocessing, before any mutant checking or test running

## What Didn't Work

1. **pnpm patch @stryker-mutator/core interactively** — pnpm's `patch` command uses interactive prompts that cannot be automated via piped input (uses terminal raw mode)
2. **Postinstall scripts modifying node_modules** — fragile, breaks on every `pnpm install`, violates the principle of not modifying `node_modules` contents
3. **Full source-code fork with tsdown/tsc build** — the upstream Stryker core (126 TypeScript source files, 14 directories) was written for TS5 looser type settings; our shared tsconfig with TS7's `verbatimModuleSyntax` and other strictness produces 398 type errors
4. **pnpm override redirecting @stryker-mutator/core to workspace fork** — plugin resolution fails because `import()` resolves from the fork's dist directory, not the consumer's `node_modules`

## Solution

Replace both removed API calls with inline implementations. There are two copies in `.pnpm` (one with `supports-color` variant). Both must be patched.

### Step 1: Patch `ts.parseConfigFileTextToJson`

In `node_modules/.pnpm/@stryker-mutator+core@9.6.1_*/node_modules/@stryker-mutator/core/dist/src/sandbox/ts-config-preprocessor.js`:

Replace:
```javascript
const { default: ts } = await import('typescript');
const { config } = ts.parseConfigFileTextToJson(tsconfigFileName, await tsconfigFile.readContent());
```

With a string-aware inline parser that handles `/*` inside string values (important for glob patterns like `src/**/*.ts`):

```javascript
let config;
try {
    const content = await tsconfigFile.readContent();
    let stripped = '';
    let inStr = false, strCh = null;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i], nxt = content[i + 1];
        if (inStr) { stripped += ch; if (ch === '\\' && strCh) { stripped += content[++i]; continue; } if (ch === strCh) { inStr = false; strCh = null; } continue; }
        if (ch === '"' || ch === "'") { inStr = true; strCh = ch; stripped += ch; continue; }
        if (ch === '/' && nxt === '/') { while (i < content.length && content[i] !== '\n') i++; continue; }
        if (ch === '/' && nxt === '*') { i += 2; while (i < content.length) { if (content[i] === '*' && content[i + 1] === '/') { i += 2; break; } i++; } continue; }
        stripped += ch;
    }
    config = JSON.parse(stripped);
} catch { config = void 0; }
```

### Step 2: Patch `ts.resolveProjectReferencePath`

In the same file, replace:
```javascript
const { default: ts } = await import('typescript');
...
const referencePath = ts.resolveProjectReferencePath(reference);
```

With:
```javascript
const referencePath = reference.path.endsWith('.json') ? reference.path : reference.path + '/tsconfig.json';
```

### Step 3: Remove orphaned imports

Remove any remaining `const { default: ts } = await import('typescript');` lines that no longer have `ts.` references.

## Why This Works

The two removed APIs were simple utilities:

- `ts.parseConfigFileTextToJson` strips JavaScript comments from JSON text and calls `JSON.parse`. An inline character-by-character parser that tracks whether it's inside a string value handles comments correctly without the TS6 runtime. The existing `@systemfsoftware/stryker-js-typescript-checker` package already uses this same pattern in its `tsconfig-helpers.ts`.

- `ts.resolveProjectReferencePath` is a trivial path resolver: if the path ends with `.json`, return as-is; otherwise append `/tsconfig.json`.

Both can be implemented in under 30 lines with zero TypeScript runtime imports. The dynamic `import('typescript')` is no longer needed.

## Prevention

- **Fork source committed**: `packages/stryker-js/core/` (commit 711024f50) contains the patched preprocessor, helper source files (`parse-config-helper.ts`, `resolve-reference-helper.ts`), and 25 unit tests
- **Build script at `scripts/build-fork.mjs`**: copies the npm `@stryker-mutator/core` dist and recompiles the patched files with bun
- After `pnpm install`, the inlined-patch approach must be re-applied to `.pnpm` store copies
- The `scripts/postinstall-core-patch.mjs` (removed from active use as the user rejected the postinstall approach) provides a reference implementation of the patch logic

## Related Issues

- `docs/plans/2026-07-15-002-rewrite-stryker-core-ts7-parity-plan.md` — plan for achieving parity
- `docs/plans/2026-07-15-001-fork-stryker-ts7-typescript-checker-plan.md` — the TS7 checker fork plan

