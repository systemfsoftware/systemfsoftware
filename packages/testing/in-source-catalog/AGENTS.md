# AGENTS.md — `@systemfsoftware/in-source-catalog`

> **Location:** `packages/testing/in-source-catalog/` — the in-source laws channel. `catalog.laws` is the only in-source authoring surface in adopting packages.

This package is the channel machinery itself: the authoring arms of `in-source-test-laws-only` do not govern its src, and it adopts `eviction-purity` only. Gate: `pnpm --filter @systemfsoftware/in-source-catalog lint` exits 0.

```yaml
rules:
  - id: IC1
    title: The published-contract gate is a guardrail, not a boundary
    do: treat `contract(...)` as rejecting wide-`string` recomputation at tsc; a literal-typed helper (`join<A extends string, B extends string>(a: A, b: B): \`${A}/${B}\``) passes the brand — the same-session hazard tsc cannot see is caught by review and the quartet
          dont: describe the gate as proving oracle independence; docs and PR text state the two-tier strength exactly as README's Published contracts section does
          harm: an author trusts tsc to catch SUT-derived expected values and ships a tautology the gate was believed to reject
          check: "`pnpm --filter @systemfsoftware/in-source-catalog test:types` exits 0 — test-types/Laws.tst.ts pins both the wide-string rejection and the literal-helper pass"
  - id: IC2
    title: "`region` must quantify — degenerate arbitraries are rejected at registration"
    do: pass only arbitraries whose draws vary; registration samples 8 draws and throws under 2 distinct values
    dont: pass `fc.constant(...)` or an equivalent single-point arbitrary
    harm: a one-point refusal sample reads as quantified region coverage while exercising a single input
    check: "`pnpm --filter @systemfsoftware/in-source-catalog test` exits 0 — a degenerate `region` input throws at registration, so laws fail loud"
  - id: IC3
    title: The sabotage quartet is this package's evidence artifact, re-runnable on demand
    do: after changing the harness workflow, `laws`, or `generators`, run the quartet and commit the refreshed `tests/.quartet/log.md`
    dont: claim the four red-then-green observations from a run whose log is absent from the diff
    harm: the channel's core evidence becomes a claim nobody can reproduce — the same-session-oracle failure this product exists to ban
    check: "`pnpm --filter @systemfsoftware/in-source-catalog quartet` exits 0 and appends a dated section to tests/.quartet/log.md"
```

| Check            | Command                                                       |
| ---------------- | ------------------------------------------------------------- |
| Types            | `pnpm --filter @systemfsoftware/in-source-catalog typecheck`  |
| Test             | `pnpm --filter @systemfsoftware/in-source-catalog test`       |
| Type assertions  | `pnpm --filter @systemfsoftware/in-source-catalog test:types` |
| Lint             | `pnpm --filter @systemfsoftware/in-source-catalog lint`       |
| Quartet evidence | `pnpm --filter @systemfsoftware/in-source-catalog quartet`    |
