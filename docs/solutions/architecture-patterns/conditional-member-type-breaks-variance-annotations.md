---
title: "A conditional member type breaks a variance annotation on its own interface"
date: 2026-09-01
category: architecture-patterns
module: "effect-cell-types"
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "typing a branded wrapper so a generic parameter hides from hover when it equals never"
  - "deciding between a conditional type alias and a plain member on a variance-annotated interface"
  - "a combinator set needs the parameter to stay covariant"
tags:
  - typescript
  - variance
  - conditional-types
  - hover-ergonomics
---

# A conditional member type breaks a variance annotation on its own interface

## Context

The Cell spine wanted `Run<I, A, E, R>` to hide a `never`-valued service channel from hover: `type Run<I, A, E, R> = [never] extends [R] ? (input: I) => Effect<A, E> : (input: I) => Effect<A, E, R>`, with `interface Cell<in I, out A, out E = never, out R = never> { readonly run: Run<I, A, E, R> }`. The same trick appeared in the original end-game sketch (R4), so it looked settled.

## Guidance

The conditional member and the `out R` annotation cannot coexist. TypeScript computes the interface's variance from its members: a deferred conditional in a property position makes `R` invariant, and `tsc` rejects the annotation itself — `TS2636: Type 'Cell<I, A, E, sub-R>' is not assignable to type 'Cell<I, A, E, super-R>' as implied by variance annotation` — pointing at the member declaration, not at any call site. Dropping the annotation restores compilation but leaves `R` computationally invariant, and the combinator set (andThen, zip, provide with `Exclude<R, ROut>`) needs covariance to stay ergonomic.

Measured probe (this worktree, tsc strict + exactOptionalPropertyTypes): `interface CellI<in I, out A, out E, out R> { readonly run: Run<I, A, E, R> }` fails TS2636 on the member; the plain-function member with a separate alias passes every assignability case including the R-covariance one.

The resolution keeps covariance and still gives consumers a name for the function shape: `readonly run: (input: I) => Effect.Effect<A, E, R>` on the interface, and `export type Run<I, A, E, R> = Cell<I, A, E, R>['run']` for signature positions. When a variance annotation and a conditional member conflict, the semantic property (variance) wins over the cosmetic one (hover); state the deviation next to the plan requirement it supersedes.

## Applicability

Applies to any interface that annotates a parameter `out`/`in out` while a member's type is a distributive conditional over that parameter. Does not apply when the conditional resolves eagerly at every use site (fully concrete instantiations) — then only the annotation-vs-computed-variance check bites, and `in out` would silence TS2636 while keeping the strictness, which is usually worse than the plain member.
