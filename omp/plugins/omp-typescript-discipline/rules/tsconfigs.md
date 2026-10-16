---
description: Tooling files and @types/node belong in a referenced tsconfig.node.json, never in a package's main or app project, so shipped source is not typechecked against Node globals
condition: '("types"\s*:\s*\[[^\]]*"(@types\/)?node"[^\]]*\]|"include"\s*:\s*\[[^\]]*\b(tsdown|vitest|vite|eslint|oxlint|playwright|storybook|dprint|scripts)\b)'
scope:
  - "tool:edit(**/tsconfig.json)"
  - "tool:write(**/tsconfig.json)"
  - "tool:edit(**/tsconfig.build.json)"
  - "tool:write(**/tsconfig.build.json)"
  - "tool:edit(**/tsconfig.app.json)"
  - "tool:write(**/tsconfig.app.json)"
interruptMode: never
recurrence: recurring
---

1. **Tooling & Root files:** Root-level tooling files (e.g. `tsdown.config.ts`, `vitest.config.ts`, `vite.config.ts`, scripts, configs) outside `src` / `test` / `tests` / `__tests__` must NOT be included in the package's source project (`tsconfig.app.json`, or `tsconfig.json` where the package has no project split). They belong in a dedicated `tsconfig.node.json` referenced from the root `tsconfig.json`.
2. **Node Types Boundary:** `"node"` or `"@types/node"` must not appear in `compilerOptions.types` of the source project. Node types belong in `tsconfig.node.json`, or in `tsconfig.test.json` when the tests themselves need them.

Legal: a test project listing `node` types; a root `tsconfig.json` holding only `files: []` and `references`. Same-turn re-issue of the corrected write is not a new trigger.
