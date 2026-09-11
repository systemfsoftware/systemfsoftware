---
title: A typed overload implementation needs a keyless union member, not a wider one
date: 2026-09-01
category: architecture-patterns
module: effect-cell-types
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - a public function needs overloads whose implementation must typecheck under a repo regime that bans casts, `any`, and `unknown` annotations
  - an implementation signature must accept several spec shapes and dispatch between them at runtime
  - the two overloads' return types differ in their error channel, so no implementation return type satisfies both
tags:
  - typescript
  - function-overloads
  - type-inference
  - effect-ts
  - cell-taxonomy
  - zero-cast
---

# A typed overload implementation needs a keyless union member, not a wider one

## Context

`Cell.layer(spec)` is object-spec sugar over the five-phase sandwich: `{ read, decide, write }` composes with identity decode/encode, `{ read, decode, decide, encode, write }` is the full form, and a partial spec must not compile — for a variable-held spec, not only an inline literal. The repo regime bans `as` casts, `any`, and `unknown` in signatures, so the usual overload escapes were all closed. Three walls fell out of the type system, each measured by a failed compile, and the shape that passes all three is not obvious from any one of them.

## Guidance

**Wall one: a const-annotated overload set cannot bridge contravariance.** `export const layer: { <…>(spec: LayerShortSpec): Cell<I, Resp, RE | WE, RR | WR>; <…>(spec: LayerLongSpec): Cell<I, Resp, RE | DecE | WE, RR | WR> } = impl` checks `impl` against every overload with generics instantiated to `any`. The write member's first parameter is contravariant: the overload's `(output: Result<Dec, DE>, …)` must be assignable to the impl's member, so the impl's parameter must accept `Result<any, any>` — `unknown` fails (`unknown` is not assignable to `Result<any, any>`), and `never` then fails the body. `any` would pass and is banned.

**Wall two: the overloads' return types differ in the error channel.** `Cell` is covariant in `E`, and the implementation can only produce the wider one — the union of read, decode, and write failures. The short overload promises `Cell<I, Resp, RE | WE, RR | WR>`, which admits no decode failure, and the implementation's `Cell<I, Resp, RE | DecE | WE, RR | WR>` is not assignable to it, so no return type the implementation can honestly declare satisfies both.

**Wall three: an identity adapter does not typecheck against the long spec.** `(raw) => Result.succeed(raw)` is not assignable to `LayerLongSpec`'s `decode` member for a generic `Dcd` — `Raw` and `Dcd` are unrelated type parameters — no matter that the short form's contract says they are equal. That is why the short path is not the long path with the identity decode: the helper's short branch calls `spec.decide(raw)` on the keyless `LayerCore`, where `decide` reads `Raw` directly and no adapter is typed at all.

The shape that passes all three: **function-declaration overloads** (the implementation signature is erased from the published declaration and parameter-checked loosely) whose implementation delegates to a **generic helper** — `layerRunner` — whose parameter is the union of the two precise spec interfaces. The helper's long branch runs decode → decide → encode; its short branch calls `spec.decide(raw)` through the keyless `LayerCore`, so no assertion and no identity adapter are ever written. The public overloads and the helper share the same spec interfaces, so nothing is declared twice.

The non-obvious second half: **the narrowable member must be keyless.** The helper dispatches on `'decode' in spec && 'encode' in spec`. A union member that declares `decode?: never` — the standard trick for rejecting partial specs — _has_ the key in its declared type, so `in` cannot narrow it away. Split the two jobs: a keyless `LayerCore` interface carries `read`/`decide`/`write`; the public short spec `extends LayerCore` adding `decode?: never`/`encode?: never` (which still rejects partials, variable-held included, because excess-property checking is not what does the work — assignability to `never` is); the helper's union uses the keyless `LayerCore`, where `in` discriminates soundly.

## Why This Matters

Each escape the regime closed would have shipped a lie: a cast computes nothing and admits an illegal spec; an `any` parameter disables the check at exactly the boundary the overloads exist to make precise. The result is a sugar whose rejection behavior is pinned by ability-matcher type tests (`expect(Cell.layer).type.not.toBeCallableWith(partialSpec)`) and whose runtime behavior is pinned end to end by `packages/effect-cell-types/tests/interpreter.integration.test.ts` — both possible only because the implementation types honestly.

## When to Apply

- An overloaded export in this repo's no-cast/no-`any`/no-`unknown`-annotation regime, whenever the overloads' return types differ in their error channel or their parameters are contravariant.
- Any runtime dispatch over a spec union where one member must _reject_ a key at the type level and another must be _narrowable_ by it — the two shapes cannot be the same interface.

## Examples

The shipped form (skeleton; `LayerCore` is keyless, the public short spec adds the rejections):

```ts
interface LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR> {
  readonly read: (command: I) => Effect.Effect<Raw, RE, RR>
  readonly decide: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly write: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, WR>
}
interface LayerShortSpec<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>
  extends LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>
{
  readonly decode?: never
  readonly encode?: never
}
interface LayerLongSpec<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>
  extends Omit<LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>, 'decide' | 'write'>
{
  readonly decode: (raw: Raw) => Result.Result<Dcd, DecE>
  readonly decide: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly encode: (outcome: Result.Result<Dec, DE>) => Out
  readonly write: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, WR>
}

export function layer<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>(
  spec: LayerShortSpec<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>,
): Cell<I, Resp, RE | WE, RR | WR>
export function layer<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>(
  spec: LayerLongSpec<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>,
): Cell<I, Resp, RE | DecE | WE, RR | WR>
export function layer<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>(
  spec:
    | LayerCore<I, Raw, RE, RR, Dec, DE, Resp, WE, WR>
    | LayerLongSpec<I, Raw, RE, RR, Dcd, DecE, Dec, DE, Out, Resp, WE, WR>,
): Cell<I, Resp, RE | DecE | WE, RR | WR> {
  return make(layerRunner(spec)) // generic helper; the short branch calls decide on raw directly
}
```

## Related

- docs/solutions/architecture-patterns/constructor-rule-boundary.md — the earning rule this sugar was judged against; it shipped only because it computes the identity skip without a cast
- docs/solutions/architecture-patterns/workflow-error-channel-gates.md — the decide brand the spec's `decide` member carries
