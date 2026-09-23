---
title: A Generic Default in Parameter Position Still Enforces
date: "2026-09-17"
category: architecture-patterns
module: effect-cell-types
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "A branded phase type carries a defaulted channel (such as E = never) and a chain slot takes that branded type as a parameter"
  - "A reviewer claims the default leaves the channel open because the call site never writes it explicitly"
tags:
  - "effect-ts"
  - "typescript-generics"
  - "type-level-enforcement"
  - "sandwich-chain"
  - "pure-phase"
---

# A Generic Default in Parameter Position Still Enforces

A slot taking a generic type with a default (`GenericSlot<In, Out, E = never>`) can leave the third argument unwritten at the parameter. During review, a finding claimed that unwritten position left the refusal channel open, so an error inside the argument would slip through. A direct compile probe refuted it: the call fails with `TS2345`, and writing the third argument explicitly would change only the printed declaration, not acceptance.

## Guidance

Read an omitted generic argument at a parameter as fully applied, not as left open. When the parameter type is `GenericSlot<A, B>` against a declaration `GenericSlot<In, Out, E = never>`, the compiler binds `E` to `never` and checks the argument against it. An argument that can fail does not fit, with or without the explicit third argument.

The probe:

```ts
type SafeSlot<In, Out, E = never> = (input: In) => Result.Result<Out, E>

declare const acceptSlot: <In, Out>(slot: SafeSlot<In, Out>) => void

const badHandler = (input: string): Result.Result<number, Error> => Result.succeed(1)

acceptSlot(badHandler) // TS2345: not assignable to parameter of type 'SafeSlot<string, number, never>'
```

Do not "fix" the slot by spelling the `never` explicitly in order to close a channel the parameter already closes. Prefer the terse form; the explicit form is documentation, not enforcement.

## Why This Matters

The mistake is easy because the sibling trap runs the other way: a conditional type in parameter position collapses to `unknown` and enforces nothing (`constructor-rule-boundary.md` owns that trap). A defaulted parameter looks like the same shape — something unresolved at the parameter — so a reviewer pattern-matches to the known collapse and files a finding. But a default is not an inference-site failure: there is nothing to infer, so the default applies and the check runs. Treating every terse generic position as suspect produces busywork edits that change the printed type while the accepted set never moves, and worse, each such edit teaches the next reader that the terse form was the loophole.

## When to Apply

- When a review claims a defaulted type argument leaves a channel open at a parameter: answer with a compile probe (a failing inhabitant plus the `TS2345` it produces), not with an explicit-argument edit.
- When authoring a branded slot whose refusal channel must stay closed: the two-argument parameter form is sufficient; reach for the explicit third argument only when the printed declaration needs to teach, never to enforce.

## Examples

Before (the alleged hole): `slot<Out>(phase: SafeSlot<In, Out>)` — `E` unwritten, claimed open.

After the probe: the same signature rejects `SafeSlot<In, Out, Error>` with `TS2345 ... not assignable to parameter of type 'SafeSlot<In, Out, never>'`. The spelling `SafeSlot<In, Out, never>` accepts exactly the same set. No edit shipped; the finding was withdrawn.

## Related

- `constructor-rule-boundary.md` — the opposite trap: a conditional in parameter position collapses and enforces nothing. Read the two together: conditionals need an inference site the parameter cannot give; defaults need none.
