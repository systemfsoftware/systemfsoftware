---
title: A ported library's cyclic module graph breaks at one wrapper record
date: "2026-09-25"
category: architecture-patterns
module: effect-playwright
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "Porting a third-party library whose modules construct each other (A builds B, B builds A) into a package on the unrelaxed oxlint preset"
  - "oxlint import(no-cycle) reports cycles between modules that wrap each other's objects"
  - "Tempted to line-disable import/no-cycle on every module of a port"
related_components:
  - packages/oxlint-presets
  - packages/effect-playwright/src/wrappers.ts
tags:
  - port
  - import-cycle
  - dependency-injection
  - effect-ts
  - oxlint
---

# A ported library's cyclic module graph breaks at one wrapper record

## Context

Upstream `Jobflow-io/effect-playwright` (0.8.0-2) wraps Playwright objects that point at each other. A page gives you its frames and its browser context, a context gives you its pages, and a request gives you its frame. Every wrapper module therefore imports the `makeX` constructors of its siblings: browser → browser-context → page → frame → locator → common → page. The repo preset makes `import/no-cycle` an error, and the port hit it on every one of these modules.

The first attempt put a line-scoped `// oxlint-disable-next-line import/no-cycle` on each cyclic import. That leaves the cycle in place and turns one design fact into a disable on every module.

## Guidance

Move all value-level edges into one module that no wrapper imports as a value. Every wrapper then imports its siblings **only as types**.

1. Each wrapper module exports a builder that takes the core object plus a `Wrappers` record (for example `buildPage(page, wrap)`). Inside, sibling construction goes through the record (`wrap.frame(coreFrame)`) instead of importing `makeFrame`.
2. The module that defines the `wrappers` record is the only one that imports the builders as values. It assembles the record, with each member closing over the record itself:
   ```ts
   export const wrappers: Wrappers = {
     page: (page) => buildPage(page, wrappers),
     frame: (frame) => buildFrame(frame, wrappers),
     // ...
   }
   ```
   It also exports the unchanged public `makeX = (core) => buildX(core, wrappers)` names, so the consumer surface stays the same as upstream.
3. Wrapper modules import their siblings' types (`Frame`, `Page`) and the `Wrappers` type with `import type` only. A probe measured on 2026-09-25 (two files that `import type` each other) produced no `import/no-cycle` finding. Only value edges count, and the only value edges left run from the record's module down to the builders.

Two other preset rules shape the builders:

- `effecttsgo/missing-pipeable-signature` rejects an exported two-argument function. Each `buildX` is exported as a `dual(2, …)` overload set, even though only the data-first form is ever called. Collapsing it back to a plain two-argument function brings the lint error back. (Same rule, same fix: `docs/solutions/architecture-patterns/blueprint-type-index-reads.md`, `docs/solutions/architecture-patterns/closed-literal-label-sets.md`.)
- api-extractor's `ae-forgotten-export` requires every type that appears in a public signature (event maps, `PatchedEvents`, evaluate-function aliases) to be exported from the barrel, including types that upstream kept `@internal`.

The result: the package source has 0 oxlint findings and no `import/no-cycle` disable, and the api-extractor reports list upstream's export names.

## Architectural Invariants

- **One value sink per cycle.** In a set of mutually-constructing modules, exactly one module holds value imports of the constructors. Every other edge is `import type`. A value import of a sibling builder anywhere else brings the cycle back.
- **Public names do not move.** The consumer-facing `makeX(core)` stays single-argument and is defined next to the record. The injected `buildX(core, wrap)` is never re-exported from a barrel.
- **Smell to grep for:** `oxlint-disable-next-line import/no-cycle` in a port's source means the value edges were never collected into one place.

## Applicability

Use this when a port's modules construct each other. It does not apply to cycles that exist only because two modules name each other's types. Those are already legal, and adding a record for them is dead weight. The record is worth it only when there are value-level constructors to move.
