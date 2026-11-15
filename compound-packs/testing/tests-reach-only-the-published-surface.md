---
title: Tests reach a package only through the entries its consumers import, and nothing is exported for a test
applies_when:
  - a test needs a module the package's public entries do not expose
  - adding an imports map, a subpath or an export so a test can reach a module
  - deciding where a third-party adapter or pure-module property test lives
tags: [testing, exports, imports-map, public-api]
---

Tests under `tests/` import their own package only through the public entries in `package.json` `exports`—never via `#...` imports maps, relative paths into `src/`, or test-only subpaths (`./testing`, `./test-utils`). Helpers come only from `tests/__fixtures__/`.

Never add an imports map, subpath, or export solely so a test can reach an internal module. When an app needs a third-party boundary adapter that must be driven by a contract suite (`port-fakes-share-a-contract-suite.md`), house that adapter in a library package imported by the app (its real consumer) and export it in that package's `exports` (`package-surface` pack: `subpaths-serve-consumers.md`).

A law about a pure module stays in `src/`: an in-source `if (import.meta.vitest)` property block, or a workflow law at `src/**/__tests__/<stem>.workflow.property.test.ts` beside its `<stem>.workflow.ts`. It builds no Feature. (For Storybook stand-in contract suites, see `ui-testing` pack: `stories-get-io-from-stand-ins-beside-the-io-module.md`.)

```typescript
// WRONG
import { HealthBoard } from '#orders/health-board.js'
// RIGHT
import { Orders } from 'orders'
```
