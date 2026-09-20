---
title: Workflow decisions must be multi-variant branded tagged unions and errors must be S.TaggedError
applies_when:
  - authoring or changing the decision (success) or error channel of a workflow
  - defining domain outcomes or domain failures for a decision function
  - reviewing decision variants and error classes in *.workflow.ts or *.schema.ts
  - migrating a workflow that returns bare primitives, records, or single-variant classes
tags: [cell-architecture, workflow, tagged-union, tagged-error, family-brand, typeid]
---

# Workflow decisions must be multi-variant branded tagged unions and errors must be S.TaggedError

Workflows must strictly define both their success (decision) and failure (error) channels to reflect real domain choices and discriminable failures (`CONSTITUTION.md` CONST-D2, CONST-D4, `docs/solutions/architecture-patterns/workflow-success-channel-tagged-union.md`, `docs/solutions/architecture-patterns/workflow-error-channel-gates.md`).

## Doctrine & Constraints

### 1. Decision Channel (Success)

- **At least two distinct variants**: A decision chooses between alternatives. A single-outcome function is a calculation, not a decision; if it cannot branch, fold it into a plain helper. A single variant resolves to `SingleVariantDecision` compiler marker.
- **Tagged classes**: Every decision variant must be an `S.TaggedClass` with a valid string discriminant tag. Plain classes or records resolve to `UntaggedDecision`.
- **Shared family brand (TypeId)**: All variants of a decision family must share a single `unique symbol` TypeId (e.g. `const OrderDecisionTypeId: unique symbol = Symbol.for(...)`), attached via `readonly [OrderDecisionTypeId] = OrderDecisionTypeId`. Divergent or missing brands resolve to `UnsharedTypeId`.
- **Never channel forbidden**: A workflow with a `never` decision channel can never succeed and resolves to `UninhabitedDecision`.

### 2. Error Channel (Failure)

- **Errors extend `S.TaggedError`**: Never use `S.TaggedClass` for errors. Errors must extend `S.TaggedError` so they integrate with Effect's `catchTag`/`catchTags` error-handling mechanisms.
- **Inhabited errors**: Workflows that cannot fail decide nothing; `never` error channel resolves to `UninhabitedError`. If a workflow genuinely has zero failure modes, use `Workflow.total`, which explicitly models total decisions with boolean-like alternative choices (`Allow | Block`).
- **Every error variant has a producer**: Do not declare dead error variants that no branch in the decision can emit.
- **No error swallowing**: Never collapse typed errors into `null`, `undefined`, or booleans.

## Calibration Examples

- **wrong**:
  ```ts
  // Single variant class, plain TaggedClass for error, no family TypeId
  export class OrderSuccess extends S.TaggedClass<OrderSuccess>()('OrderSuccess', {}) {}
  export class OrderFailed extends S.TaggedClass<OrderFailed>()('OrderFailed', {}) {} // Wrong: TaggedClass, not TaggedError

  export const decide = Workflow.make(
    OrderInput,
    (input): Result.Result<OrderSuccess, OrderFailed> => /* ... */ // Fails: single variant & untagged error
  )
  ```
- **right**:
  ```ts
  const OrderDecisionTypeId: unique symbol = Symbol.for('@app/OrderDecision')
  type OrderDecisionTypeId = typeof OrderDecisionTypeId

  export class OrderApproved extends S.TaggedClass<OrderApproved>()('Approved', { id: S.String }) {
    readonly [OrderDecisionTypeId] = OrderDecisionTypeId
  }
  export class OrderRejected extends S.TaggedClass<OrderRejected>()('Rejected', { reason: S.String }) {
    readonly [OrderDecisionTypeId] = OrderDecisionTypeId
  }
  export class InvalidOrderState extends S.TaggedError<InvalidOrderState>()('InvalidOrderState', {
    details: S.String,
  }) {}

  export const decide = Workflow.make(
    OrderInput,
    (input): Result.Result<OrderApproved | OrderRejected, InvalidOrderState> => /* ... */
  )
  ```

## Verification & Gate

- `type-checker`: `Workflow.make` uses tuple-wrapped conditional type checks that resolve invalid decision or error channels to descriptive compiler error markers (`SingleVariantDecision`, `UntaggedDecision`, `UnsharedTypeId`, `UntaggedError`, `UninhabitedDecision`, `UninhabitedError`).
- `review`: Reviewer checks that all declared error variants have at least one emitting branch in the workflow body.
