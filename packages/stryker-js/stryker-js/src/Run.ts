import type * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Queue from 'effect/Queue'

import {
  Heartbeat,
  HelpRendered,
  ManifestRendered,
  MutantTested,
  PhaseEntered,
  PlanKnown,
  RunEvent,
  RunFailed,
  RunStarted,
  VerdictReached,
} from './Run.schema.js'

export class RunEvents extends Context.Service<RunEvents, Queue.Queue<RunEvent, Cause.Done>>()(
  '~@systemfsoftware/stryker-js/RunEvents',
) {}

export interface RunIdentityShape {
  readonly runId: string
  readonly basePath: string
  readonly frameworkVersion: string
}

export class RunIdentity extends Context.Service<RunIdentity, RunIdentityShape>()(
  '~@systemfsoftware/stryker-js/RunIdentity',
) {}

export {
  Heartbeat,
  HelpRendered,
  ManifestRendered,
  MutantTested,
  PhaseEntered,
  PlanKnown,
  RunEvent,
  RunFailed,
  RunStarted,
  VerdictReached,
}
export type { RunEvent as RunEventType }
export { ModeSignal, MutantStatus, OutputMode, RunPhase } from './Run.schema.js'
export type { Location, Position, RunTerminalEvent } from './Run.schema.js'
