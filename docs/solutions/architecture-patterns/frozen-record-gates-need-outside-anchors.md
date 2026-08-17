---
title: A drift gate over a frozen record must check both sides
date: 2026-08-17
category: architecture-patterns
problem_type: knowledge_issue
component: packages/rightsize/scripts/parity-enumerate.mjs
tags: [parity, drift-gates, frozen-surface, testcontainers]
---

# A drift gate over a frozen record must check both sides

## Context

`@systemfsoftware/rightsize` replaces testcontainers outright. The replaced
library's public surface (213 members) is committed as data — a frozen matrix
generated once from its `.d.ts` — because the dependency no longer exists in
the lockfile. `parity:check` runs in build and compares the committed matrix
against a re-render of `MAPPING + FROZEN_SURFACE`.

The first version of that gate was self-certifying (CHK1's exact shape): it
read only fields its own author had written. `loadSurface = installed ??
FROZEN_SURFACE` — with testcontainers uninstalled, `installed` is always
undefined, so the check compared the committed file against a re-render of
itself. A renamed-away rightsize symbol, or a mapping row citing a
deleted `src/` path, both stayed green.

## Guidance

A gate that owns both sides of its comparison certifies nothing. When the
subject is a frozen record (the dependency is gone, the record is the spec),
the gate needs an anchor outside the record on every side that can drift:

1. **The rightsize side must be recomputed from the artifact consumers get.**
   We parse the committed api-extractor rollups (`etc/*.api.md`) — declarations,
   re-exports, and interface members — into a name set. Every `present` mapping
   row's backticked rightsize symbol must exist in that set. Renaming
   `getMappedPort` now fails the gate with the row that cites it.
2. **Every cited path must exist on disk.** Each backticked `src/…` span in a
   row's `rs`/`note` is resolved against the working tree. The suffix-taxonomy
   rename wave silently stranded ~30 dead citations; this gate makes a repeat
   impossible.
3. **Advertised values must be real runtime exports.** The modules subpath once
   declared `export const ContainerSpec` (an api-rollup artifact of a type-only
   re-export) while the runtime bundle exported no such value — an ESM link
   crash for any consumer. A vitest test now imports the built entry and
   asserts every rollup-declared value exists on it.
4. **The docstring must say what the record is.** "This workspace still
   installs testcontainers" was false; the frozen surface is now documented as
   the W8 record, so the next reader does not re-derive the vacuous check.

Keep the checks as tests, not prose: they live in
`src/__tests__/parity-gates.test.ts` and run with the ordinary suite.

## Applicability

Use this shape whenever a gate guards a frozen/copied record rather than a
live dependency: vendored-API parity tables, snapshot specs of removed
upstreams, migration manifests. The failure mode it prevents is precise: the
gate stays green while the thing it vouches for drifts, because both sides of
its comparison came from the same pen. Do not use it where the live dependency
still exists — then checking against the installed package is the stronger
anchor and the frozen copy is redundant.
