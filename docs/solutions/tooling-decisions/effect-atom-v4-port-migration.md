---
title: Porting effect-atom onto the effect v4 release candidate
date: "2026-08-14"
module: systemfsoftware
problem_type: tooling_decision
component: packages/atom/effect-atom
severity: medium
applies_when:
  - A vendored fork depends on a library whose next major has shipped
  - Choosing between staying on the current major and adopting a release candidate
root_cause: dependency_major_change
resolution_type: dependency_migration
tags:
  - effect-ts
  - effect-atom
  - migration
  - catalog
---

# Porting effect-atom onto the effect v4 release candidate

## Candidates

1. **Stay on `effect@^3.22`** — zero migration cost now, but strands the fork on a major the upstream (`repos/effect`) is deprecating.
2. **Port to the v4 RC** (`effect@4.0.0-rc.112`) — the vendored tree `repos/effect/packages/atom/` already carries the upstream v4 port, so the migration is a port of upstream work, not a re-invention.
3. **Wait for v4 final** — avoids RC churn but blocks all v4 work on an unbounded release date.

## Deciding criterion

The packages are pre-1.0 ALPHA (REPO-R1: API stability is never a design constraint), and the vendored `repos/effect` tree already contains the upstream v4 port of `effect-atom` itself — the migration is aligning with upstream, not inventing a new design. Staying on 3.x would leave the fork on a deprecated major with no upstream to track. Waiting for v4 final buys nothing the RC does not already provide, since the RC is the published target and the vendored tree tracks `main`.

## Reversing observation

Every package resolves effect v4 through the default catalog, so there is no atom-specific pin left to reverse; undoing v4 now means undoing the workspace-wide migration, which is the intended end state of the staged port.
