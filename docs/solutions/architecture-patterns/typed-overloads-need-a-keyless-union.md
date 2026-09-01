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
  - a stage-typed chain's bag is invariant, so no single implementation return type satisfies every overload
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

`Cell.layer(spec)` is object-spec sugar over the five phase constructors: `{ read, decide, write }` composes with identity decode/encode, `{ read, decode, decide, encode, write }` is the full form, and a partial spec must not compile — for a variable-held spec, not only an inline literal. The repo regime bans `as` casts, `any`, and `unknown` in signatures, so the usual overload escapes were all closed. Three walls fell out of the type system, each measured by a failed compile, and the shape that passes all three is not obvious from any one of them.

## Guidance

**Wall one: a const-annotated overload set cannot bridge contravariance.** `export const layer: { <…>(spec: ShortSpec): WriteDone<ShortBag>; <…>(spec: LongSpec): WriteDone<LongBag> } = impl` checks `impl` against every overload with generics instantiated to `any`. The write member's first parameter is contravariant: the overload's `(output: Result<Dec, DE>, …)` must be assignable to the impl's member, so the impl's parameter must accept `Result<any, any>` — `unknown` fails (`unknown` is not assignable to `Result<any, any>`), and `never` then fails the body. `any` would pass and is banned.

**Wall two: the stage record is invariant in its bag.** `WriteDone<P>` carries phase records whose `run` parameters read `P` in contravariant positions, so `WriteDone<ShortBag>` and `WriteDone<LongBag>` share no supertype an implementation can return. The short bag pins `decodeError: never`, and under `exactOptionalPropertyTypes` even `any` is not assignable to `never`, so no union return type bridges either.

**Wall three: an identity adapter only typechecks against a constructed bag.** `(raw) => Result.succeed(raw)` is not assignable to `DecodePhase<P>` for a generic `P` — `P['raw']` and `P['decoded']` are unrelated index types — no matter that the short form's contract says they are equal. The adapter typechecks once the bag is _constructed_ with `decoded` literally `Raw`, because the check is then `Raw` against `Raw`.

The shape that passes all three: **function-declaration overloads** (the implementation signature is erased from the published declaration and parameter-checked loosely) whose implementation delegates to a **generic helper** whose parameter is the union of the two precise spec interfaces. Both branches of the helper construct the bag by instantiating its members from the spec's own generic parameters, so the identity adapters check `Raw` against `Raw` with no assertion. The public overloads and the helper share the same spec interfaces, so nothing is declared twice.

The non-obvious second half: **the narrowable member must be keyless.** The helper dispatches on `'decode' in spec && 'encode' in spec`. A union member that declares `decode?: never` — the standard trick for rejecting partial specs — _has_ the key in its declared type, so `in` cannot narrow it away. Split the two jobs: a keyless `Core` interface carries `read`/`decide`/`write`; the public short spec `extends Core` adding `decode?: never`/`encode?: never` (which still rejects partials, variable-held included, because excess-property checking is not what does the work — assignability to `never` is); the helper's union uses the keyless `Core`, where `in` discriminates soundly.

## Why This Matters

Each escape the regime closed would have shipped a lie: a cast computes nothing and admits an illegal bag; an `any` parameter disables the check at exactly the boundary the overloads exist to make precise. The result is a sugar whose rejection behavior is pinned by ability-matcher type tests (`expect(Cell.layer).type.not.toBeCallableWith(partialSpec)`) and whose runtime equivalence to the hand-chained constructors is pinned by a property over generated descriptions — both possible only because the implementation types honestly.

## When to Apply

- An overloaded export in this repo's no-cast/no-`any`/no-`unknown`-annotation regime, whenever the overloads' return types are invariant in a shared bag or their parameters are contravariant.
- Any runtime dispatch over a spec union where one member must _reject_ a key at the type level and another must be _narrowable_ by it — the two shapes cannot be the same interface.

## Examples

The shipped form (skeleton; `SpecCore` is keyless, the public short spec adds the rejections):

```ts
interface SpecCore<C, Raw, RE, Dec, DE, Resp, WE> {
  readonly read: (command: C) => Effect.Effect<Raw, RE, never>
  readonly decide: ((decoded: Raw) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly write: (output: Result.Result<Dec, DE>, raw: Raw) => Effect.Effect<Resp, WE, never>
}
interface ShortSpec<C, Raw, RE, Dec, DE, Resp, WE> extends SpecCore<C, Raw, RE, Dec, DE, Resp, WE> {
  readonly decode?: never
  readonly encode?: never
}
interface LongSpec<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>
  extends Omit<SpecCore<C, Raw, RE, Dec, DE, Resp, WE>, 'decide' | 'write'>
{
  readonly decode: (raw: Raw) => Result.Result<Dcd, DecE>
  readonly decide: ((decoded: Dcd) => Result.Result<Dec, DE>) & WorkflowBrand
  readonly encode: (outcome: Result.Result<Dec, DE>) => Out
  readonly write: (output: Out, raw: Raw) => Effect.Effect<Resp, WE, never>
}

export function layer<C, Raw, RE, Dec, DE, Resp, WE>(
  spec: ShortSpec<C, Raw, RE, Dec, DE, Resp, WE>,
): WriteDone<ShortBag<C, Raw, RE, Dec, DE, Resp, WE>>
export function layer<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>(
  spec: LongSpec<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>,
): WriteDone<LongBag<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>>
export function layer<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>(
  spec: ShortSpec<C, Raw, RE, Dec, DE, Resp, WE> | LongSpec<C, Raw, RE, Dcd, DecE, Dec, DE, Out, Resp, WE>,
) {
  return layerImpl(spec) // generic helper; the short branch builds the bag with decoded ≡ raw
}
```

## Related

- docs/solutions/architecture-patterns/constructor-rule-boundary.md — the earning rule this sugar was judged against; it shipped only because it computes the identity skip without a cast
- docs/solutions/architecture-patterns/workflow-error-channel-gates.md — the decide brand the spec's `decide` member carries
