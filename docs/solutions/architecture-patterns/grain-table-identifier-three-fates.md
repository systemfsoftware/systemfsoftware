---
title: One identifier can carry an operation, a doctrine anchor, and a lint key - each needs its own fate
date: 2026-09-12
category: architecture-patterns
module: effect-cell-types, oxlint-plugin fleet
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "A lint rule keys on an exported function whose operation is ambiguous between composition, interpretation, and work"
  - "A doctrine row states a cardinality (once per process, once per edge) that a static rule is asked to enforce"
  - "A marker or helper is inherited from earlier work and assumed to still fire"
tags: [lint-rules, placement, arrow-application, managed-runtime, dead-markers, grain-table]
---

# One identifier can carry an operation, a doctrine anchor, and a lint key - each needs its own fate

Decision: `Cell.run` the exported alias is deleted, the doctrine row it anchored is deleted,
`cell.run(input)` arrow application is unrestricted, and placement lint keys only on statically
decidable shapes (the grain table). Measured on the cell/workflow arc of 2026-09-11/12, which
shipped the identifier-keyed rule, killed it, and shipped its replacement inside one branch.

## The argument

1. `Cell.run(self, input)` is `self.run(input)` - arrow application. `R` stays open and flows to
   the enclosing `Effect`. That is composition, the doctrine's sanctioned work form.
2. A rule keyed on the identifier therefore bans lawful work wherever it looks: the supervisor's
   per-crash restart cells, the checker's per-round cells, the runner's per-run cells. The reductio
   is the library itself - `Cell.andThen` calls the inner cell's `run`, so the identifier-keyed rule
   flags the library that defines the combinators.
3. The operations people actually mean by "run placement" are two others: wiring closure
   (`ManagedRuntime.make`, `Layer.provide`/`merge`, `Cell.provide`) and interpretation
   (`runtime.runPromise`/`runFork`, `Layer.launch`). Those have cardinality (once per process;
   once per outside interaction) and placement (root module; SF2 edge) semantics.
4. Of those properties, only the shapes are statically decidable: a tracked wiring call inside a
   function body (wiring rebuilt per call), and construction evaluated at module scope instead of
   inside a lazy memoized bootstrap. Cardinality and edge-ness are runtime properties; a static rule
   approximating them degenerates into an allowlist. They stay review-gated.

## What shipped

- The alias deleted (`dual(2, (self, input) => self.run(input))` was a pure rename - the repo's own
  `ts-no-tiny-functions` class); every call site became arrow application with position untouched.
- `runtime-construction-placement` (oxlint-plugin-effect-entrypoint): two verdicts at `error` -
  wiring-per-call, and eager module-scope construction. Lawful: the module-scope lazy memoized
  bootstrap (`const getRuntime = () => (runtime ??= ManagedRuntime.make(AppLive))`), module-scope
  layer graphs, `.tst.ts` type probes (they run nowhere), and every arrow application.
- Provision outside a declared composition root does NOT ship until package metadata can declare
  roots; then it lands at `error` with an explicit dated baseline that shrinks monotonically.
  An unshipped rule is honest; an advisory rule is a lie with paperwork.

## The companion lesson: measure inherited markers

The same arc found `UnsharedTypeId` dead - the shipped `SharedTypeId` predicate sat in key-remapping
position and collapsed to `string | number | symbol`, so the marker resolved `unknown` for every
union and never fired. It was inherited, documented, and never once observed. The repair keys on
symbol-keyed family brands over the union itself; the repair's own prediction (a shared symbol key
with a non-symbol value stays shared) was then disproven by measurement and pinned as truth.
Inherited is not firing. Pin markers with exact-equality assertions and read the resolved type.

## Prevention

- Before keying a rule on an identifier, ask what the operation does with `R`: closes it (launch),
  eliminates it early (wiring), or leaves it open (work). Key on the grain, and only where the
  shape is statically decidable.
- Reject two names for one operation as a compliance path - renaming until grep is clean moves the
  token, not the invariant.
- Every inherited marker/helper a rule depends on gets a fires/does-not-fire measurement in its
  delivery unit, recorded as permanent pins.
