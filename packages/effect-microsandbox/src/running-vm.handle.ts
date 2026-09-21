import { Effect, Option, Predicate, Stream } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type { Sandbox } from 'microsandbox'
import { ExecError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import type { PortBinding } from './render-sandbox-plan.workflow.js'

export const TypeId = Symbol.for('~systemfsoftware/microvm/RunningVM')
export type TypeId = typeof TypeId

export const isRunningVM = (u: unknown): u is RunningVM => Predicate.hasProperty(u, TypeId)

export interface ExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface LogLine {
  readonly source: string
  readonly text: string
}

/**
 * Nominal runtime handle representing an active microVM instance.
 *
 * Conforming to Effect handle conventions (Socket, Fiber, Ref), the handle is a
 * minimal protocol record holding identity, network port bindings, and the raw
 * sandbox driver reference. Operations (exec, port, url, logs, ping, use) are
 * dual pipeable module functions.
 */
export interface RunningVM extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly name: string
  readonly portBindings: ReadonlyArray<PortBinding>
  readonly sandbox: Sandbox
}

export const make = (options: {
  readonly name: string
  readonly portBindings: ReadonlyArray<PortBinding>
  readonly sandbox: Sandbox
}): RunningVM => ({
  [TypeId]: TypeId,
  ...Prototype,
  ...options,
})

export const port: {
  (guestPort: number): (self: RunningVM) => Effect.Effect<number, PortAllocationError>
  (self: RunningVM, guestPort: number): Effect.Effect<number, PortAllocationError>
} = dual(
  2,
  (self: RunningVM, guestPort: number): Effect.Effect<number, PortAllocationError> => {
    const binding = self.portBindings.find((b) => b.guest === guestPort)
    return binding !== undefined
      ? Effect.succeed(binding.hostPort)
      : Effect.fail(
        new PortAllocationError({
          guestPort,
          cause: `Guest port ${guestPort} is not mapped to any host port on sandbox ${self.name}`,
        }),
      )
  },
)

const prefixSlash = (path: string): string => (path.startsWith('/') ? path : `/${path}`)
const normalizePath = (path: string | undefined): string => (path !== undefined ? prefixSlash(path) : '')
export const url: {
  (guestPort: number, path?: string): (self: RunningVM) => Effect.Effect<string, PortAllocationError>
  (self: RunningVM, guestPort: number, path?: string): Effect.Effect<string, PortAllocationError>
} = dual(
  (args) => isRunningVM(args[0]),
  (self: RunningVM, guestPort: number, path?: string): Effect.Effect<string, PortAllocationError> =>
    Effect.map(port(self, guestPort), (hostPort) => `http://127.0.0.1:${hostPort}${normalizePath(path)}`),
)
export const exec: {
  (cmd: string, args?: ReadonlyArray<string>): (self: RunningVM) => Effect.Effect<ExecResult, ExecError>
  (self: RunningVM, cmd: string, args?: ReadonlyArray<string>): Effect.Effect<ExecResult, ExecError>
} = dual(
  (args) => isRunningVM(args[0]),
  (self: RunningVM, cmd: string, args: ReadonlyArray<string> = []): Effect.Effect<ExecResult, ExecError> => {
    const argv = [cmd, ...args]
    return Effect.map(
      Effect.tryPromise({
        try: () => self.sandbox.exec(cmd, [...args]),
        catch: (cause) => new ExecError({ argv, cause }),
      }),
      (output): ExecResult => ({ code: output.status.code, stdout: output.stdout(), stderr: output.stderr() }),
    )
  },
)

export const logs = (self: RunningVM): Stream.Stream<LogLine, SandboxBootError> =>
  Stream.flatMap(
    Stream.fromEffect(
      Effect.tryPromise({
        try: () => self.sandbox.logStream({ follow: true }),
        catch: (cause) => new SandboxBootError({ sandboxName: self.name, cause }),
      }),
    ),
    (logStream) =>
      Stream.fromAsyncIterable(logStream, (cause) => new SandboxBootError({ sandboxName: self.name, cause })),
  ).pipe(
    Stream.map((entry): LogLine => ({ source: entry.source, text: entry.text() })),
  )

export const ping = (self: RunningVM): Effect.Effect<boolean> =>
  Effect.map(Effect.option(Effect.promise(() => self.sandbox.ping())), Option.isSome)

export const use: {
  <A>(f: (sandbox: Sandbox) => Promise<A>): (self: RunningVM) => Effect.Effect<A, SandboxBootError>
  <A>(self: RunningVM, f: (sandbox: Sandbox) => Promise<A>): Effect.Effect<A, SandboxBootError>
} = dual(
  2,
  <A>(self: RunningVM, f: (sandbox: Sandbox) => Promise<A>): Effect.Effect<A, SandboxBootError> =>
    Effect.tryPromise({
      try: () => f(self.sandbox),
      catch: (cause) => new SandboxBootError({ sandboxName: self.name, cause }),
    }),
)
