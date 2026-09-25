---
title: How blueprint operations read their type index without losing generics or tripping TS2589
date: 2026-09-24
category: architecture-patterns
module: effect-cell-types
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - declaring a Blueprint operation whose params or out read this['Index'] or this['Args']
  - a blueprint member disappears, or tstyche reports S & Constraint where S was expected, in code generic over the index
  - tstyche reports TS2589 on a blueprint whose index carries a union of kinds while plain tsc is clean
  - oxlint missing-pipeable-signature refuses a dual the kind derived
tags:
  - effect-ts
  - blueprint
  - type-level-transition
  - hkt
  - ts2589
  - tstyche
  - pipeable-dual
---

# How blueprint operations read their type index without losing generics or tripping TS2589

## Problem

`Blueprint.make<Spec, Index>()(TypeId).operations<Ops>()` declares each operation once. The declaration is an interface whose `params` and `out` read `this['Index']` and `this['Args']`, the `TypeLambda` encoding from `effect/HKT`. From that one interface the kind derives the method, the data-first dual, and the data-last dual.

Moving discern's `DecisionNode`, `Matcher`, `Procedure`, and `Registry` onto the kind failed in four separate ways. Each failure passes at the definition and breaks somewhere else: in generic callers, under a different compiler version, or in the effect language-service linter. The final code shows only the fix, and each fix reads like a style choice.

## Failure Modes

1. **Deferred conditional reads.** A read of the form `X extends Bound ? X['Field'] : never` stays deferred when `X` is a type parameter, including an object type with generic members. Every member typed through such a read becomes unusable in generic helpers, for example `buildRegistry` over `Procedure<S['Type'], …>`.
2. **Widened intersection reads.** `(X & Bound)['Field']` resolves, but it produces `Field & Bound['Field']`. Against an object bound such as `Schema.Constraint`, a caller gets `S & Constraint` where it expected `S`, and the tstyche `.toBe<S>()` identity check fails.
3. **Presence filtering collapses under a generic index.** A mapped-type key filter that drops a member whose type is `never` for the index cannot decide anything when the index is generic. It drops every key, so the members `input`, `eligible`, and `run` vanish from `Procedure` helpers.
4. **Union-kind depth.** One `DecisionNode` definition whose operations depended on `D extends Classify | Rate | Probability` hit TS2589 ("Type instantiation is excessively deep") under TypeScript 6.0.3, the compiler tstyche and the language service run. TypeScript 7.0.2, which the package's `tsc` resolves to, stayed clean. So `typecheck` passed while `test:types` failed. (Measured 2026-09-24.)
5. **Linter refuses the derived dual.** `missing-pipeable-signature` does not accept the kind's rest-parameter `Blueprint.DataFirst` as the data-first twin of a data-last signature with at least two parameters.

## Architectural Invariants

- **Read index fields by structural `infer`.** Write `X extends { readonly Field: infer A extends C } ? A : never`. It resolves under generic `X` and keeps exact identity. The intersection read is acceptable only when the bound's field is `unknown` or a primitive.

  ```ts
  type MembersOf<X> = X extends { readonly Members: infer M extends AnyProcedureRecord } ? M : never
  ```

- **Presence depends on the index only when a member says so.** A member is filtered only when it also extends `Blueprint.Conditional`. Every other member is present for every index, including a generic one. Mark an operation `Conditional` only when some index really lacks it, such as `above` on a labels-scale question.
- **One definition per kind in a union index.** When an index field is a union of kinds, build one `Blueprint.make` definition per kind. All of them share one `TypeId`, and base operations are spread in, so each kind's methods compute against a concrete kind. Discern's `Nodes`, `Classifies`, `Probabilities`, and `Rates` follow this rule.
- **Keep the linter-facing dual annotated.** Where the derived dual trips `missing-pipeable-signature`, export an annotated overload set built with `dual(...)` over the same implementation the kind's method uses. Discern's `when`, `case`, and the decision-node functions (`is`, `above`, `atLeast`, …) follow this rule.

## Verification

- Run `test:types`, not only `typecheck`. Only the former runs the TS 6.0.3 compiler that exposes the TS2589 depth failure (measured 2026-09-24). For a standalone reproduction, run the 6.0.3 `tsc` from the pnpm store against a tsconfig without project `references`.
- Sabotage the presence rule in both directions. When every member counts as `Conditional`, the generic-index law in the cell-types kinds type test fails. When no member counts as `Conditional`, the scale-specific law fails as well.
- For every blueprint operation with a result that depends on its arguments, pin the method, the function, and the `pipe` form to one type. Then change the transition and confirm those three-form laws fail.

## Code Smells

- `X extends SomeIndex ? X['F'] : never` inside a blueprint module.
- `(X & SomeIndex)['F']` where `SomeIndex['F']` is an object or schema type.
- A `Conditional` marker on an operation that every index supports.
- One blueprint definition whose operation types branch on a union-typed kind field.

## Related

- `docs/solutions/architecture-patterns/constructor-rule-boundary.md`: which properties a type-level constructor can own.
- The `pipeable-dual-parity` rule in the cell-architecture compound pack: the three-form parity these transitions implement.
