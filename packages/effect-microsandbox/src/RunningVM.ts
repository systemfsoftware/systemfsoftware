import { Context, Effect, HashMap, Stream } from 'effect'
import type { ExecError, SandboxBootError } from './MicroVMError.schema.js'

export interface ExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface LogLine {
  readonly source: string
  readonly text: string
}

export interface RunningVM {
  readonly name: string
  readonly mappedPorts: HashMap.HashMap<number, number>
  readonly exec: (cmd: string, args?: ReadonlyArray<string>) => Effect.Effect<ExecResult, ExecError>
  readonly logs: Stream.Stream<LogLine, SandboxBootError>
  readonly ping: Effect.Effect<boolean>
}

export const RunningVM = Context.Service<RunningVM>('RunningVM')
