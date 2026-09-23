---
title: Decisions inside the sandwich must be pure Workflow values with cyclomatic complexity 1
applies_when:
  - authoring a domain decision or business workflow
  - passing a decider to Sandwich.decide
  - reviewing logic inside *.workflow.ts
tags: [cell, workflow, pure-core, cyclomatic-complexity, match-exhaustive]
---

The `decide` phase of a sandwich must receive a `Workflow` instantiated with `Workflow.make`. For decisions that cannot fail, declare `error: Schema.Never`. The slot requires the nominal `WorkflowBrand`; passing an unwrapped anonymous function fails type-checking.

A workflow is a total, single-path expression: Cyclomatic Complexity = 1. Branching must be expressed as exhaustive dispatch over a closed tagged union (`Match.value(cmd).pipe(...)` terminating in `Match.exhaustive`). Iteration must be expressed as `map`, `filter`, or `fold`, never imperative loops.

Control flow keywords (`if`, `else`, `switch`, ternary `?:`, `for`, `while`) are forbidden in decision bodies. Decisions must not perform I/O, read clocks (`Date.now`), call random generators, or yield Effect services. If a decision needs current time, the time must be gathered in `read` and passed in the command schema.

```ts
// WRONG: imperative control flow with complexity > 1, bare unbranded function
export const decideDiscount = (cmd: OrderCmd) => {
  if (cmd.isVip) {
    return cmd.total > 100 ? Result.succeed(new High()) : Result.succeed(new Low())
  }
  return Result.succeed(new None())
}

// RIGHT: Workflow.make with schemas, complexity = 1 via Match.exhaustive
export const decideDiscount = Workflow.make({
  command: OrderCommand,
  decision: DiscountDecision,
  error: Schema.Never,
  decide: (cmd): Result.Result<High | Low | None, never> =>
    Match.value(cmd.tier).pipe(
      Match.tag('VIP', () =>
        Match.value(cmd.isOverThreshold).pipe(
          Match.when(true, () => Result.succeed(new High())),
          Match.when(false, () => Result.succeed(new Low())),
          Match.exhaustive,
        )),
      Match.tag('Standard', () => Result.succeed(new None())),
      Match.exhaustive,
    ),
})
```

Gate: `type-checker` — the chain's `decide` method accepts only a `WorkflowBrand`-branded workflow, so a bare function fails compilation.
Lint: `oxlint` bans control flow keywords (`if`, `switch`, `for`, `while`) in `*.workflow.ts`.
