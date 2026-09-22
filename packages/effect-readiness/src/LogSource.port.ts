import { Context, type Effect } from 'effect'
import type { LogSourceError } from './ReadinessError.schema.js'

export class LogSource extends Context.Service<LogSource, {
  readonly entries: Effect.Effect<ReadonlyArray<string>, LogSourceError>
}>()('@systemfsoftware/effect-readiness/LogSource') {}
