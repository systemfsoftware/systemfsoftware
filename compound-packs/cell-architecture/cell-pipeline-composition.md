---
title: Cell pipelines must compose via typed Sandwich continuation chains or Cell Do-notation
applies_when:
  - composing multiple operations, steps, or transformations into an end-to-end cell
  - authoring a pipeline that connects readers, decoders, workflows, encoders, and writers
  - chaining operations where intermediate outputs feed subsequent steps
  - reviewing pipeline assembly in services or executors
tags: [cell-architecture, cell-pipeline, sandwich-chain, do-notation, composition]
---

# Cell pipelines must compose via typed Sandwich continuation chains or Cell Do-notation

Cells in Cell Architecture are first-class, pipeable values representing encapsulated operations. When building composite pipelines or multi-step executions, cells must compose using the sanctioned algebraic combinators provided by `@systemfsoftware/effect-cell-types` (`Sandwich` chain, `Cell` arrows, and `Cell.Do` notation) rather than imperative spaghetti (`packages/effect-cell-types/README.md`).

## Doctrine & Constraints

- **Continuation Chain for Single Sandwiches**: Build an operation using `Sandwich.read(...)` and its fluent continuation methods (`.decode(...)`, `.decide(...)`, `.encode(...)`, `.write(...)`). Each step exposes only lawful next steps, preventing phase inversion at compile time.
- **Cell Do-Notation for Accumulating Scope**: When multiple distinct cells need to execute in sequence while passing accumulated context forward, use `Cell.Do`, `Cell.bind`, and `Cell.let`. This provides a declarative, immutable pipeline that mirrors `Effect.gen` but operates on pure cell descriptors.
- **Register Split**:
  - The shell writes imperative `Effect.gen` for orchestration and runtime lifecycle.
  - The pure decision core stays pipeable functional expressions.
  - Cell compositions use `Cell` combinators (`map`, `andThen`, `zip`, `Cell.Do`).
- **Decide Refusals are Outcomes**: In a `Sandwich` pipeline, a decision refusal (`Result.fail(DomainError)`) is an _outcome_, not a pipeline abort. It travels to `encode` and `write` so the writer can render and persist domain rejection events. Only decode/read infrastructure errors short-circuit the cell.

## Calibration Examples

- **wrong**:
  ```ts
  // Manual imperative variable threading without typed phase guarantees
  export const processUser = async (id: string) => {
    const raw = await fetchUser(id)
    const user = parseUser(raw)
    const decision = decidePromotion(user)
    let rendered = ''
    if (decision._tag === 'Promoted') {
      rendered = formatPromotion(decision)
    } else {
      rendered = formatRejection(decision)
    }
    await saveUser(rendered, raw)
  }
  ```
- **right**:
  ```ts
  import { Sandwich } from '@systemfsoftware/effect-cell-types'

  export const processUserCell = Sandwich.read((id: string) => fetchUserEffect(id))
    .decode(Sandwich.pure((raw) => decodeUser(raw)))
    .decide(decidePromotionWorkflow)
    .encode(Sandwich.pure((outcome) => Result.succeed(formatOutcome(outcome))))
    .write((rendered, raw) => saveUserEffect(rendered, raw))
  ```

## Verification & Gate

- `type-checker`: `Sandwich` enforces that `decode` cannot be called after `write`, and `write` cannot precede `decide`. Out-of-order calls fail to compile.
- `review`: Reviewer ensures pipelines use `Sandwich` or `Cell.Do` instead of manual async/await sequencing for standard domain operations.
