---
description: Enforce TypeScript project references for root/tooling configs and forbid @types/node in main tsconfig.json
condition: '("types"\s*:\s*\[[^\]]*"(@types\/)?node"[^\]]*\]|"include"\s*:\s*\[[^\]]*\b(tsdown|vitest|vite|eslint|oxlint|playwright|storybook|dprint|scripts)\b)'
scope:
  - "tool:edit(**/tsconfig.json)"
  - "tool:write(**/tsconfig.json)"
  - "tool:edit(**/tsconfig.build.json)"
  - "tool:write(**/tsconfig.build.json)"
  - "tool:edit(**/tsconfig.src.json)"
  - "tool:write(**/tsconfig.src.json)"
interruptMode: 'tool-only'
---

1. **Tooling & Root files:** Root-level tooling files (e.g. `tsdown.config.ts`, `vitest.config.ts`, `vite.config.ts`, scripts, configs) outside `src` / `test` / `tests` / `__tests__` must NOT be included in the primary package `tsconfig.json`. They must be isolated in a dedicated project configuration (e.g. `tsconfig.node.json`) referenced via TypeScript project references (`references: [{ "path": "./tsconfig.node.json" }]`).
2. **Node Types Boundary:** `"node"` or `"@types/node"` must not appear in `compilerOptions.types` in the main library `tsconfig.json`. Node types belong exclusively in the referenced tooling config (e.g. `tsconfig.node.json`).
