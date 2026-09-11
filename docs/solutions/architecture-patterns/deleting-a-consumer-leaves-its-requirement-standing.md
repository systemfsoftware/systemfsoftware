---
title: Deleting a Feature's Only Consumer Leaves Its Service Requirement Standing
date: "2026-09-10"
category: architecture-patterns
module: systemfsoftware
problem_type: architecture_pattern
component: tooling
severity: medium
symptoms:
  - "A command's R channel names services its handler never yields"
  - "A module import survives only because one type annotation still names it"
  - "Removing a layer breaks a path that appeared to be the deleted feature's"
root_cause: "missing_workflow_step"
resolution_type: "code_fix"
related_components:
  - "api_layer"
tags:
  - "effect"
  - "command"
  - "service-requirement"
  - "deletion"
  - "strangler"
  - "type-channel"
---

# Deleting a Feature's Only Consumer Leaves Its Service Requirement Standing

Removing a feature removes its handler, but not the _requirement_ that handler introduced. In a
typed effect system the requirement is a value in the return type — an `R` (environment) channel
member — and it outlives its consumer silently because the composition root keeps providing it.
The delete looks complete: the flag, the branch, the request variant, the tests, the docs are all
gone, and the build is green.

## Problem

The stryker CLI package (`@systemfsoftware/stryker-js-cli`)'s only runtime reader of a sibling
package's manifest was the `--llms` manifest emitter. It resolved a specifier, read a file, and
parsed it, so it carried `FileSystem.FileSystem | Path.Path` in its `R` channel. That requirement
was written into the root command's `Command` type annotation, where the comment justified the
annotation by the emitter's own call site: the handler called the emitter, the emitter referenced
the command being built, and the circular inference forced an explicit type.

Deleting the feature deleted the call site — and with it, the stated reason for the annotation —
while leaving the annotation's environment parameter untouched. `FileSystem.FileSystem` survived in
exactly two places: the import, and that one type. The module compiled, lint passed, the full
contract lane passed. Nothing failed.

That instance is history: the `--llms` emitter and the requirement it stranded have since been
deleted, so this tree currently carries no live instance of the pattern. The mechanism below is what
the instance measured, and the price it still puts on the next deletion of this shape.

## Mechanism

1. **The requirement is nominal, not structural.** A handler that yields nothing from the
   environment still _declares_ what it may ask for. `Effect.gen` infers `R` from what the body
   yields, but an explicit `Command.Command<..., R>` annotation overrides the inference. The
   annotation is the declaration; the body is not consulted again.
2. **The provision makes the stale requirement unobservable.** A composition root that merges every
   layer (`Layer.mergeAll`) builds each member whether or not a consumer exists. The stale
   requirement stays satisfied, so no missing-service error can ever fire on it.
3. **The two failure directions are asymmetric and both silent.**
   - Leave the requirement standing, then add a real read of that service to the handler: it
     type-checks _and_ resolves, so a genuinely needed provision and an accidental one look
     identical.
   - Delete the layer believing nothing needs it: a _different_ consumer breaks — the run path,
     which reads the same service through its own provider — and the failure appears to be about
     the deletion when it is about the leftover declaration.
4. **The residual is proportional to the deleted consumer's effects, not its size.** A feature whose
   handler touched only pure data leaves no requirement. One that read the filesystem, spawned a
   process, read a clock, or opened a socket leaves a channel member, a layer, or a whole port.

## Invariants

**Sweep the requirement with the consumer.** A deletion is not complete when the code is gone; it is
complete when nothing the code demanded is still demanded. The check is derivable without running
anything: after deleting a handler, re-derive the environment from the body and compare it to the
declared type. Where they disagree, the declaration is the leftover.

```ts
// Wrong: the annotation remembers what the body forgot.
const root: Command.Command<'tool', {}, {}, CliError, FileSystem | Path> = Command.make(
  'tool',
  {},
  (config) =>
    Effect.gen(function*() {
      return yield* failShowHelp()
    }),
)

// Right: the declared environment is what the body actually yields.
const root: Command.Command<'tool', {}, {}, CliError, never> = Command.make(
  'tool',
  {},
  (config) =>
    Effect.gen(function*() {
      return yield* failShowHelp()
    }),
)
```

**A comment that names the deleted call site is part of the deletion.** The annotation's stated
justification was its own self-reference. When the call site goes, the justification goes — either
rewritten to the reason that still holds, or deleted with the annotation. A surviving comment that
names a deleted symbol is a false instruction to the next editor, who cannot tell whether the
annotation is safe to remove.

**An unreachable dispatch fallback becomes an exhaustiveness proof.** A match over a union that has
collapsed to one variant keeps its trailing fallback (`Match.orElse(() => Effect.die(...))`). The
fallback cannot execute, and its message names a multiplicity the type no longer has. Replacing it
with `Match.exhaustive` converts a dead runtime branch into a compile-time guarantee: re-adding a
variant fails the build instead of silently becoming an internal-error defect. Note the tradeoff —
the framework's non-exhaustive defect replaces the authored message, so the guarantee moves from
runtime text to build-time failure. Prefer the build-time failure.

**A guard's decoder must be able to reject the vocabulary it guards.** A contract lane that decodes
stream lines with a rest-permissive schema and asserts `observedKinds.filter(k => expected.includes(k))`
is structurally incapable of failing on an _added_ kind — the extra line decodes cleanly and the
filter drops it. Pin the exact observable instead (`terminalLine.kind === 'verdict'`); a membership
filter asserts "at least this", never "exactly this".

## Anti-Pattern Code Smell

- An explicit effect-type annotation whose `R` names a service that no `yield*` in the body resolves.
  Grep for the service name and confirm every hit is a provision or an unrelated consumer, never the
  handler under review.
- An import surviving solely to appear in one type parameter position.
- `Match.orElse(() => Effect.die('<message that names a variant count>'))` on a single-variant union.
- A stream/contract assertion of the form `kinds.filter(k => EXPECTED.includes(k))`.

## Verification

Two-sided, and both sides are cheap:

1. **Declared-vs-derived environment.** Narrow the annotation's `R` to `never` and typecheck. Success
   proves the requirement was stranded; a failure names the consumer that still needs it. Delete the
   now-unused import in the same step — the compiler is the detector.
2. **Delete-the-layer probe.** Only after step 1 proves nothing declares the service, ask whether the
   layer is still needed by another path. Answer it by reading the remaining consumers, not by
   deleting the layer and seeing what breaks: the run path in that instance read the same service
   through its own provider, so the layer stayed.

For the guard-shaped residual, the falsification is a paste-back: restore the removed vocabulary
(a stray terminal kind) and confirm the lane goes red. A lane that stays green under its own
removed case is the defect, not the proof. Prefer a contract-lane assertion on the exact observable
over any count or filter.

Cross-reference: `an-exported-schema-costs-its-obligation-tree.md` covers the same shape one level
up — an exported schema costs its whole obligation tree even when nothing decodes it. Both are
reachability: what a declaration makes _live_ costs something whether or not anyone uses it.
