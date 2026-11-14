---
title: Tests reach a package only through the entries its consumers import, and nothing is exported for a test
applies_when:
  - a test needs a module the package's public entries do not expose
  - adding an imports map, a subpath or an export so a test can reach a module
tags: [testing, exports, imports-map, public-api]
---

Tests under `tests/` import their own package only through the public entries in `package.json` `exports`—never via `#...` imports maps, relative paths into `src/`, or test-only subpaths (`./testing`, `./test-utils`). Helpers come only from `tests/__fixtures__/`.

The sole exception is an app's Storybook stand-in contract suite (`tests/<port>.contract.integration.test.ts`), which reaches `src/io/layer.ts` via factory-less `vi.mock` and `vi.importActual` (`port-fakes-share-a-contract-suite.md`). Never add an imports map or export solely for tests; A law about a pure module stays in `src/`: an in-source `if (import.meta.vitest)` property block, or a workflow law as `src/**/__tests__/<stem>.workflow.property.test.ts` beside its `<stem>.workflow.ts` (lint: `no-test-file-in-src`). It builds no Feature.

```typescript
// WRONG
import { HealthBoard } from '#orders/health-board.js'
// RIGHT
import { Orders } from 'orders'
```
