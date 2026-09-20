---
title: Every workflow must be instantiated through Workflow.make with a Schema class command value
applies_when:
  - authoring or changing a workflow decision file
  - creating or passing a decision to Cell.decide or Sandwich.decide
  - defining the input command contract for a domain decision
  - typing the parameters and return shape of a decision function
tags: [cell-architecture, workflow, make-boundary, schema-class, nominal-brand]
---

# Every workflow must be instantiated through Workflow.make with a Schema class command value

In Cell Architecture, workflows represent pure domain decisions (`Command in -> Result<Decision, Error> out`). To guarantee that a decision is valid, nominal, and properly bounded, it must be constructed using `Workflow.make` (or `Workflow.total`) from `@systemfsoftware/effect-cell-types` (`CONCEPTS.md` Cell, `docs/solutions/architecture-patterns/make-boundary-owns-a-decision.md`).

## Doctrine & Constraints

- **Nominal Brand Required**: `Workflow.make` stamps the decision with a nominal `WorkflowTypeId` brand. Shell decider slots (`Cell.decide`, `Sandwich.decide`) require this brand. A bare anonymous function `(command: Command) => Result<Decision, Error>` is rejected by the compiler at the call site that attempts to run it.
- **Command is a Schema Class Value**: The first argument to `Workflow.make` must be a real `Schema.Class` or `Schema.TaggedClass` constructor value (e.g. `Workflow.make(SubmitOrderCommand, (cmd) => ...)`), never an interface, plain TypeScript type, object literal, or primitive.
  - A plain interface is refused by `tsc` with `TS2693: 'Cmd' only refers to a type, but is being used as a value here`.
  - A plain class or struct is refused with missing schema identifier properties.
- **No Unwrapped Lambdas**: Never export or pass bare functions to decision slots. The `Workflow.make` boundary is also the boundary that mutation testing and boundary-purity lint rules use to isolate the pure core.

## Calibration Examples

- **wrong**:
  ```ts
  // Bare function with plain interface: no nominal brand, unvalidated command type
  interface SubmitOrder {
    readonly orderId: string
  }
  export const decideOrder = (cmd: SubmitOrder): Result.Result<OrderDecision, OrderError> => {
    // ...
  }
  // Passing to Sandwich.decide(decideOrder) fails compilation: missing WorkflowBrand
  ```
- **right**:
  ```ts
  import { Workflow } from '@systemfsoftware/effect-cell-types'
  import * as S from 'effect/Schema'

  export class SubmitOrderCommand extends S.TaggedClass<SubmitOrderCommand>()('SubmitOrderCommand', {
    orderId: S.String,
  }) {}

  export const decideOrder = Workflow.make(
    SubmitOrderCommand,
    (cmd) => Match.value(cmd).pipe(/* ... */),
  )
  ```

## Verification & Gate

- `type-checker`: `tsc` rejects bare functions passed to `Cell.decide` with `'WorkflowBrand' is missing`, and rejects interface types passed as the command value with `TS2693`.
- `lint`: `@systemfsoftware/oxlint-plugin-effect-workflow` enforces purity and boundary rules inside all `Workflow.make` argument bodies.
