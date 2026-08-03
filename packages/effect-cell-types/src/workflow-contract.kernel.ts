import type { Either } from 'effect/Either'
import type { UninhabitedDecision, UninhabitedError, Workflow } from './workflow.kernel.js'

type Holds<Claim extends true> = Claim

type Identical<Left, Right> = (<G>() => G extends Left ? 1 : 2) extends (<G>() => G extends Right ? 1 : 2) ? true
  : false

declare const Command: unique symbol
declare const Decision: unique symbol
declare const Alternative: unique symbol
declare const Failure: unique symbol

type Cmd = { readonly [Command]: true }
type Dec = { readonly [Decision]: true }
type Alt = { readonly [Alternative]: true }
type Err = { readonly [Failure]: true }

export type InhabitedWorkflowIsCallable = Holds<
  Identical<Workflow<Cmd, Dec, Err>, (command: Cmd) => Either<Dec, Err>>
>

export type DecisionUnionSurvivesDistribution = Holds<
  Identical<Workflow<Cmd, Dec | Alt, Err>, (command: Cmd) => Either<Dec | Alt, Err>>
>

export type NeverDecisionIsRejected = Holds<
  Identical<Workflow<Cmd, never, Err>, UninhabitedDecision>
>

export type NeverErrorIsRejected = Holds<
  Identical<Workflow<Cmd, Dec, never>, UninhabitedError>
>
