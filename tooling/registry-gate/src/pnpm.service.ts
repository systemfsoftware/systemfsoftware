import { Context, type Effect } from 'effect'
import type * as PlatformError from 'effect/PlatformError'
import type { ProcessRun } from './ProcessRun.schema.js'

export interface PnpmInvocation {
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
}

export class Pnpm extends Context.Service<Pnpm, {
  readonly run: (invocation: PnpmInvocation) => Effect.Effect<ProcessRun, PlatformError.PlatformError>
}>()('@systemfsoftware/registry-gate/Pnpm') {}
