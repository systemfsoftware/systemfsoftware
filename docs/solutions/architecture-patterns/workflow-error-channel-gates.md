---
title: Workflow Error Channel Gates (architect-workflow)
module: omp-claude-compat
component: hook-verdict.workflow.ts
tags: [effect-ts, constitution, workflow, tagged-error, match-exhaustive]
problem_type: architecture-pattern
track: knowledge
applies_when:
  symptoms:
    - A `*.workflow.ts` file returns `Either<Decision, never>` and was accepted as a workflow
    - A workflow's error variant extends `S.TaggedClass` instead of `S.TaggedError`
    - `Match.value(primitive).pipe(Match.when, Match.orElse)` is used where `Match.exhaustive` would suffice
  root_cause: workflow implementation drift from the nine non-negotiable gates in the architect-workflow skill (G3, G9, plus the error-channel rule)
  resolution_type: pattern-alignment
---

# Workflow Error Channel Gates (architect-workflow)

## Context

`omp/packages/omp-claude-compat/src/hook-verdict.workflow.ts` was written as `Either<HookDecision, never>` — a "total" decision shape where every domain outcome lands in the `Right` channel.

The original code also routed JSON parse errors through `Either.match(parseHookOutput(...), { onLeft: () => null, onRight: ... })` — collapsing a typed error into `null` and then dispatching as if no error existed. The mutator cannot kill what the type system refuses to name.

## Guidance

Apply the three gates that govern the error channel of a workflow:

**Gate A — error variants extend `S.TaggedError`, never `S.TaggedClass`.** A `TaggedClass` is data; a `TaggedError` is an error. The convention exists because errors flow through Effect's `catchTag` / `catchTags` machinery and need an `_tag` discriminator plus the schema metadata that `TaggedError` provides. Use the same pattern as `packages/effect-daemon-spec/src/leader-lock.schema.ts`:

```ts
// RIGHT
export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {}

// WRONG — Tag is right, but the class is a TaggedClass, not a TaggedError
export class MalformedJson extends S.TaggedClass<MalformedJson>()('MalformedJson', {
  raw: S.String,
}) {}
```

**Gate B — primitive dispatch over open shapes uses `Match.value` with terminal `orElse`; closed unions use `Match.tag` + `Match.exhaustive`.** A primitive (number, string) is an open shape — `Match.value(result.code).pipe(Match.when(2, ...), Match.when(0, ...), Match.orElse(...))` is legal because the primitive has infinitely many values. A closed tagged union (e.g. `ExitBlock | ExitParse | ExitOther`) is not — dispatch must terminate with `Match.exhaustive` so adding a variant forces a compile error.

The hook-verdict workflow has BOTH shapes layered: `result.code` (primitive → `orElse` is legal) dispatches into one of three `ExitKind` variants (closed → `Match.exhaustive` is required). The `ExitKind` union exists specifically to give `Match.exhaustive` a closed shape to bite on. Without it, the dispatch is unfalsifiable — `Match.orElse` on a primitive swallows any new exit code silently.

**Gate C — error variants are produced by some step; every variant has at least one producer.** `HookVerdictError` is the only error type because there is exactly one failure mode the workflow can detect: the hook exited `0` but its stdout was not parseable as the expected JSON shape. If you find yourself unable to list which step produces a given variant, the variant is dead and should be removed.

## Why This Matters

The skill `architect-workflow` enforces Constitution §I.1 (Purity) and §I.3 (Each Error Its Own Variant) by structural gates. A workflow with `never` in the error channel can still typecheck and still pass `pnpm check` — the violation is invisible to the compiler and to the test suite. The next contributor who adds a real failure mode will either smuggle it into a `Warning` (silently collapsing two distinct failures) or add it as a `boolean` field on a decision (violating §I.3). The mistake reproduces because nothing in the build chain catches it.

The 100% mutation gate is the other failure mode this prevents: a workflow that swallows `Either.left` to `null` is unfalsifiable. The mutator changes the parse path to always succeed and the test still passes because the workflow never branched on the failure in the first place.

## When to Apply

- Every `*.workflow.ts` file under `omp/packages/*/src/` and `packages/*/src/`
- During code review: if the signature is `Either<X, never>`, push back — total workflows are `Allow | Block` with no other named variants, and most "total" workflows are actually hiding a failure mode
- When a workflow dispatches on a primitive and reaches for `Match.exhaustive`: derive a closed tagged union first, then dispatch

## Examples

**Before** — workflow with `never` error channel and silent parse-failure collapse:

```ts
export const interpretHookResult = (
  result: HookResult,
  event: string,
): Either.Either<HookDecision, never> =>
  Either.right(
    Match.value(classifyExit(result.code)).pipe(
      Match.tag('ExitTwo', () => new Block({ ... })),
      Match.tag('NonZeroNonTwo', () => /* Allow or Warning */),
      Match.tag('ExitZero', () =>
        decideFromParsed(
          Either.match(parseHookOutput(result.stdout), {
            onLeft: () => null,   // <-- failure swallowed
            onRight: (p) => p,
          }),
          event,
        )),
      Match.exhaustive,
    ),
  )
```

**After** — workflow with a real error variant, dispatch through a closed `ExitKind` union, `S.TaggedError` for the error:

```ts
export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {}

class ExitBlock extends S.TaggedClass<ExitBlock>()('ExitBlock', {}) {}
class ExitParse extends S.TaggedClass<ExitParse>()('ExitParse', {}) {}
class ExitOther extends S.TaggedClass<ExitOther>()('ExitOther', {}) {}

const ExitKind = S.Union(ExitBlock, ExitParse, ExitOther)

export const interpretHookResult = (
  result: HookResult,
  event: string,
): Either.Either<HookDecision, HookVerdictError> =>
  Match.value(classifyExit(result.code)).pipe(
    Match.tag('ExitBlock', () => Either.right(new Block({ reason: blockReason(result.stderr, event) }))),
    Match.tag('ExitParse', () =>
      Either.match(parseHookOutput(result.stdout), {
        onLeft: () => Either.left(new HookVerdictError({ raw: result.stdout })),
        onRight: (parsed) => Either.right(decideFromParsed(parsed, event)),
      })),
    Match.tag('ExitOther', () => Either.right(decideFromNonStandardExit(result.stderr))),
    Match.exhaustive,
  )
```

**Executor side** — the executor must handle the new error variant. `Either.merge` no longer works because `Left` is now reachable:

```ts
const verdict = interpretHookResult(result, event)
const decision = Either.match(verdict, {
  onLeft: (err) =>
    Match.value(err).pipe(
      Match.tag('HookVerdictError', (e) =>
        new Warning({ message: `Hook exited 0 but produced invalid JSON: ${e.raw.slice(0, 200)}` })),
      Match.exhaustive,
    ),
  onRight: (d) => d,
})
```

## Verification

- `grep -n 'Either<.*, never>' omp/packages/*/src/*.workflow.ts packages/*/src/*.workflow.ts` returns only files where the workflow genuinely has zero failure modes (rare; `Allow | Block` total decisions).
- `grep -n 'extends S.TaggedClass' omp/packages/*/src/*.workflow.ts packages/*/src/*.workflow.ts` returns only decision/command classes, never error classes. Error classes must use `S.TaggedError`.
- Property tests (where they exist) assert the error channel: `Either.isLeft(...)` cases prove the failure variant is reachable, not just theoretically defined.

## See Also

- `skill://architect-workflow` — the source of the nine non-negotiable gates
- `CONSTITUTION.md` §I.3 (Each Error Its Own Variant) and §III.3 (Mutation Is the Measure)
- `packages/effect-daemon-spec/src/leader-lock.schema.ts` — reference usage of `S.TaggedError` in the monorepo
