import { Context, type Effect, type HashMap, type Stream } from 'effect'
import type { ExecError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'

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
  readonly port: (guestPort: number) => Effect.Effect<number, PortAllocationError>
  readonly url: (guestPort: number, path?: string) => Effect.Effect<string, PortAllocationError>
  readonly exec: (cmd: string, args?: ReadonlyArray<string>) => Effect.Effect<ExecResult, ExecError>
  readonly logs: Stream.Stream<LogLine, SandboxBootError>
  readonly ping: Effect.Effect<boolean>
}

export const RunningVM = Context.Service<RunningVM>('RunningVM')
