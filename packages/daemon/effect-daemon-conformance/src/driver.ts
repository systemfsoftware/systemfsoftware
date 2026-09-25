import type { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import type { Context, Effect, Scope } from 'effect'
import type { ChildScript, ChildStep } from './ChildScript.schema.js'
import type { ChildId } from './Trace.schema.js'

/** The channel that advances one child's steps, reaching the child and never the supervisor's mailbox (KTD14). */
export interface ChildControl {
  /**
   * Hands one step to the incarnation the kernel ordered for it. A driver whose channel is
   * per incarnation addresses by that generation; a driver whose incarnation stops its own
   * consumer when the kernel stops it may ignore the generation.
   */
  readonly advance: (step: ChildStep, generation: number) => Effect.Effect<void>
}

/** One child role launched before the supervisor starts: its program and the control that drives it. */
export interface LaunchedChild<Program> {
  readonly program: Program
  readonly control: ChildControl
}

/** The service a driver provides for one program type. */
export type MediumPortOf<Program, StartError, R> = Context.Service<
  Supervisor.Medium.MediumPortShape<Program, StartError, R>,
  Supervisor.Medium.MediumPortShape<Program, StartError, R>
>

export interface ScenarioBudget {
  readonly millis: number
  readonly startTimeoutMillis: number
  /** The liveness tick the scenarios run with; a medium slower than the kernel's default tick must widen it. */
  readonly livenessTickMillis?: number | undefined
}

/**
 * What a medium author supplies to `Conformance.prove`: the medium port, the
 * declaration it claims, and how a `ChildScript` becomes one of its programs
 * together with the channel that drives that program.
 */
export interface ConformanceDriver<Program, StartError = never, R = never> {
  readonly name: string
  readonly declaration: Supervisor.Medium.MediumDeclaration
  readonly scenario?: ScenarioBudget
  readonly port: MediumPortOf<Program, StartError, Scope.Scope | R>
  readonly launch: (
    childId: ChildId,
    script: ChildScript,
  ) => Effect.Effect<LaunchedChild<Program>, never, Scope.Scope | R>
}
