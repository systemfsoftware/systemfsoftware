import { Context, Effect, HashMap, Stream } from 'effect'
import type * as Scope from 'effect/Scope'
import type { ExecError, MicroVMError, SandboxBootError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'

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

export class MicroVM extends Context.Service<MicroVM, {
  readonly start: (spec: MicroVMSpec) => Effect.Effect<RunningVM, MicroVMError, Scope.Scope>
}>()('MicroVM') {}
