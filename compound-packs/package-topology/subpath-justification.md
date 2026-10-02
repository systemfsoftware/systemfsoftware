---
title: A subpath export names one of five justifications; a separate concept is a namespace under the root
applies_when:
  - adding or removing an entry in a package's tsdown.config.ts
  - adding or changing a subpath in a package's exports map
  - deciding whether a module should be importable from its own specifier
  - splitting a package's surface into schema, workflow, types, or utils entries
tags: [package-topology, subpath, exports, entry, tsdown]
---

A subpath is a separate entry into the module graph: importing it evaluates only that entry's imports and needs only that entry's dependencies. A subpath is justified only when importing the root from that place would be wrong or costly. It must name one of these:

1. **Execution context.** The entry runs where the root's code is invalid or wasteful: configuration time (`vitest/config`, whose `defineConfig` loads without the test runtime), server versus client (`@tanstack/react-router/ssr/server`), build time (`@tanstack/react-start/plugin/vite`), or another runtime (`vite/module-runner`).
2. **Dependency closure.** The entry needs a dependency the root does not, usually an optional peer (`@tanstack/react-start/plugin/vite` with `vite` optional).
3. **Side effect on import.** The entry exists to run something when imported (`zod/compile`, `effect`'s JIT `enable`). Isolating it keeps the root free of side effects.
4. **Tool-dictated name.** A tool imports a fixed specifier: `react/jsx-runtime`, `vitest/globals`, `vite/client`.
5. **Deliberate alternate contract.** A different API over the same capability (`zod/mini`), a coexisting major version (`zod/v3`), or a stability tier (`vite/internal`). These publish different symbols, not the same symbols twice.

Not a justification:

- **A separate concept or ADT.** Publish it as a namespace from the root barrel (`export * as Order from './Order.js'`).
- **Bundle splitting.** Bundlers tree-shake ESM entries that declare no side effects. A per-module path is justified only at measured scale, where unbundled consumers (Node, Vitest, a Vite dev server) pay import cost through the root barrel, as `effect` does across thousands of modules.
- **A layered view** (`/schema`, `/workflow`, `/types`, `/utils`) of the root's vocabulary.

No symbol is importable under two specifiers, except through a deliberate alternate contract. Check a justified subpath against the root with the shared identity set S: the brands, schemas, and `Context.Service` tags both entries export or require. When S contains behavior, the subpath is a layered view and merges into the root; when S holds declarations only, those declarations live in one entry and the other imports them.

```ts
// WRONG: one vocabulary, three specifiers
// tsdown.config.ts entry: { index: 'src/mod.ts', schema: 'src/schema/mod.ts', workflow: 'src/workflow/mod.ts' }
import { OrderId } from '@org/ledger'
import { OrderId } from '@org/ledger/schema'

// RIGHT: execution context — config files load without the runtime
// tsdown.config.ts entry: { index: 'src/mod.ts', config: 'src/config.ts' }
import { defineConfig } from '@org/runner/config'
```

Gate: `review`.
