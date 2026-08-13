import type { Either } from 'effect/Either'

export interface UninhabitedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_IS_NEVER__:
    'this workflow can never succeed; give it a decision variant it can return'
}

export interface UninhabitedError {
  readonly __WORKFLOW_ERROR_CHANNEL_IS_NEVER__:
    'this workflow cannot fail, so it decides nothing; give it an error variant or move it to a *.kernel.ts'
}

// `[T] extends [never]`, not `T extends never`: the tuple wrap stops distribution,
// without which a `never` channel satisfies the conditional vacuously and is never caught.
export type Workflow<Command, Decision, DecisionError> = [Decision] extends [never] ? UninhabitedDecision
  : [DecisionError] extends [never] ? UninhabitedError
  : (command: Command) => Either<Decision, DecisionError>

// The parameter is the plain function type, not `Workflow<C, D, E>`: a conditional type in
// parameter position resolves `D`/`E` to `unknown` and the `never` markers become unreachable,
// so the constructor would enforce nothing. The conditional lives on the return type, which is
// the existing `Workflow` marker; runtime is identity.
//
// The narrowing goes through an assertion signature rather than an `as` cast: every narrowing
// assertion trips `typescript(no-unsafe-type-assertion)`, and a suppression comment would hide
// the one place this file could lie. The assertion is sound rather than merely permitted — with
// both channels inhabited `Workflow<C, D, E>` *is* `(command: C) => Either<D, E>`, and when either
// channel is `never` the return type is a marker interface with no call signature, so the value
// handed back is unobservable through it. Compile-time only; the body is empty by construction.
export const make = <C, D, E>(decide: (command: C) => Either<D, E>): Workflow<C, D, E> => {
  assertWorkflow(decide)
  return decide
}

function assertWorkflow<C, D, E>(
  _decide: (command: C) => Either<D, E>,
): asserts _decide is Workflow<C, D, E> & ((command: C) => Either<D, E>) {}
