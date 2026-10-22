---
title: Two applications that talk share a contracts library of schemas and RPC groups; neither imports the other
applies_when:
  - an SPA calls a Worker, or one Worker calls another
  - defining request and response shapes used on both sides of a boundary
  - an application needs a type from another application
tags: [composition, contracts, rpc, schema, boundary]
---

The shapes that cross an application boundary live in a contracts library: Schema types, tagged errors, and RPC groups (for first-party calls). Both applications depend on it, and neither depends on the other. A contracts library contains no implementations and imports only `effect` and other contracts.

Calls between two applications go through one declared contract, never through hand-built requests decoded on each side. A contract changes in one place and both sides fail to compile when they disagree. Whether a user-land consumer gets the contract as RPC, a capability or HTTP is a separate decision. This rule only says where the shapes live.

Gate (fact-gated): `repo-checks composition-graph` (no application-to-application edge) and `repo-checks composition-contracts`, which fails a contracts library that imports a non-contracts package or references a value member of effect's `Layer` module. The reference is resolved through the type checker's alias chain, so `import { Layer as L }`, `import * as Layer from 'effect/Layer'`, a destructured `const { succeed } = Layer`, a bare `Layer.succeed` that is never called, and a barrel that re-exports `Layer` (named or `export *`) are all found; when `effect` is not installed the check falls back to the module each import names.
