---
title: How discern refuses open, infinite, and empty label sets at the constructor
date: 2026-09-24
category: architecture-patterns
module: discern
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - a public constructor takes a label set (record keys or array items) that later label checks narrow against
  - a review proposes deleting the `Label extends string ?` wrapper in `Unbounded` as a dead branch
  - an internal caller has labels known only at runtime and must bypass a public literal-set guard
  - oxlint missing-pipeable-signature refuses an exported two-argument internal helper
tags:
  - discern
  - type-level-guard
  - literal-union
  - distributive-conditional
  - tstyche
  - pipeable-dual
---

# How discern refuses open, infinite, and empty label sets at the constructor

## Context

`classify`, `rate`, and their `Discern.on(schema)` twins build decisions whose later checks (`.is`, `.atLeast`, `Discern.case`, `Discern.exhaustive`) refuse a wrong label only while the label type is a finite literal union. Once a `string`-typed `criteria` got through, every downstream check accepted any string without an error. The guard is the pair of module-private types `Unbounded` and `Finite` beside `ClassifyOptions` in discern's decision blueprint. A comment-lint hook deletes explanatory comments on internal types, so this note is the only record of why the guard has its current shape.

## Guidance

- **Test each member, not the union.** `Unbounded<Label> = Label extends string ? (Record<never, never> extends Record<Label, never> ? true : false) : never`. The outer `Label extends string ?` is not dead code: it distributes the check across the union, so `` 'a' | `${number}px` `` evaluates to `boolean` and `true extends Unbounded<Label>` refuses it. If you drop the wrapper, the record check runs against the whole union. `'a'` makes that record have a required key, so `{}` is not assignable, the check returns `false`, and the mixed set compiles.
- **`string extends Label` is not enough.** It lets template labels (`` `tone-${string}` ``), mixed unions, and `{}` through. An infinite member is one whose `Record` becomes an index signature, which `{}` satisfies. A finite literal key is required, so `{}` does not satisfy it. The technique is type-fest's `IsStringLiteral` (`source/is-string-literal.d.ts`).
- **Refuse the empty set separately.** Check `[Label] extends [never]` first; `criteria: {}` and `criteria: []` both infer `never`.
- **Guard only the public signatures.** A refused set resolves to `Options & { readonly criteria: never }`, and an accepted one resolves to plain `Options`. So the public functions forward to the unguarded `classifyFor`/`rateFor` without a cast, which keeps discern's source free of casts and `@ts-expect-error`.
- **Runtime labels use a curried internal constructor.** `Procedure.registry` calls `openClassifyOn(schema)(options)`, which the `Discern` namespace does not re-export. It takes one argument per call because oxlint `missing-pipeable-signature` refuses an exported two-argument function without a dual.

## Why This Works

Invariant: a label set is admitted only when it is non-empty and no member of the union admits infinitely many strings. That is the one condition under which the narrowing checks downstream can refuse a wrong label. Two simplify reviewers on this change proposed deleting the distributive wrapper as a dead `never` branch. The `pixelCriteria` refusal law in discern's type tests would have caught it. Without that law, the mixed-union hole reopens silently, and every downstream label check compiles against labels that were never declared.

## When to Apply

- Any constructor whose type parameter later narrows label checks: add the same guard and the four refusal cases (`string`, pure template, mixed union, empty) for every public signature, scoped and unscoped.

## Examples

The gate is `pnpm --filter @systemfsoftware/discern test:types`. The laws under `describe('the label sets a classification or rating is built from')` pair each `not.toBeCallableWith` refusal with a positive control, across both `Change.*` (scoped) and `Discern.*` (unscoped).

## Related

- `docs/solutions/architecture-patterns/blueprint-type-index-reads.md`: the `missing-pipeable-signature` rule and the Blueprint signature constraints.
- `docs/plans/2026-09-24-1938-feat-closed-discern-label-sets-plan.md`: KTD1–KTD3, including the refuted `string extends Label` alternative.
