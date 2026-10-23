---
title: Two applications that talk share a contracts library of schemas, tagged errors and RPC groups; neither imports the other
applies_when:
  - an SPA calls a Worker, or one Worker calls another
  - defining the request and response shapes used on both sides of a boundary
  - an application needs a type that another application defines
tags: [composition, contracts, rpc, schema, boundary, applications]
---

## Rule

The shapes that cross an application boundary live in a contracts library: `Schema` types, tagged errors, and RPC groups. Both applications depend on it; neither depends on the other. A contracts library is marked `"role": "contracts"` in `package.json` (the manifest keys are listed in (pack: composition, three-unit-kinds.md)), contains no implementation, imports only `effect` and other contracts libraries, and defines no Layer.

Calls between two applications go through one declared contract, never through requests built by hand and decoded separately on each side. The contract changes in one place, and both sides fail to compile when they disagree.

## Why

Without a shared contract, the second application either imports the first (an edge into an application, which collapses the two into one deployable: (pack: composition, dependency-direction.md)) or re-declares the shapes, which drift silently until production decodes fail. younna-ai's libraries imported schema types from Workers (`@younna/workspace/schema/agent-db`, `@younna/app-builder/builder.schema`) because no contracts library held them ((pack: composition, evidence/FINDINGS.md) Cycle 006, finding 5).

## Evidence

- Rat Stack: one Schema contract per capability (input, output, failure, metadata), projected to HTTP, CLI and MCP from the same definition: "do not write separate business logic for each interface" ((pack: composition, evidence/FINDINGS.md) Cycle 005, finding 10).
- (pack: composition, evidence/PACK.md) Part 3, row 6: applications compose through a shared library, never by path.

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```ts
// WRONG: apps/web/src/billing.ts
import type { Invoice } from '@younna/platform/billing/store.schema' // a Worker's internals

// RIGHT: packages/billing-contracts/src/mod.ts  ("role": "contracts")
export * as BillingRpc from './BillingRpc.ts' // RpcGroup + Schema + TaggedError, no Layer
// apps/web and workers/platform both import '@younna/billing-contracts'
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-contracts` (`scripts/tools/repo-checks/composition.ts`, `checkCompositionContracts`) fails a `"role": "contracts"` library that imports a workspace library that is not contracts, or references a value member of effect's `Layer` module. The reference is resolved through the type checker's alias chain (renames, `import * as Layer from 'effect/Layer'`, destructuring, bare references, barrels and `export *`), falling back to the module an import names only when `effect` is not installed. `repo-checks composition-graph` fails the application-to-application edge.

Gate: none yet for third-party imports in a contracts library. `composition-contracts` checks only workspace imports and `Layer` members (`composition.ts:504-530`), so a contracts library that imports `zod` or `react` passes. The gate would read each value import's resolved package from the compiler's import graph and fail anything other than `effect` or a `"role": "contracts"` unit.
