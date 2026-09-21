import { Effect, HashMap, Layer, Option, Stream } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as FileSystem from 'effect/FileSystem'
import type * as Scope from 'effect/Scope'
import type { Sandbox } from 'microsandbox'
import { bootMicroVM } from './boot-microvm.cell.js'
import { type AcquiredVM, describeCause } from './boot-sandbox.cell.js'
import { MicroVM } from './MicroVM.js'
import type { ExecResult, LogLine, RunningVM } from './MicroVM.js'
import { ExecError, SandboxBootError } from './MicroVMError.schema.js'
import type { MicroVMError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'

const execOf =
  (sandbox: Sandbox) => (cmd: string, args: ReadonlyArray<string> = []): Effect.Effect<ExecResult, ExecError> => {
    const argv = [cmd, ...args]
    return Effect.map(
      Effect.tryPromise({
        try: () => sandbox.exec(cmd, [...args]),
        catch: (cause) => new ExecError({ argv, reason: describeCause(cause) }),
      }),
      (output): ExecResult => ({ code: output.status.code, stdout: output.stdout(), stderr: output.stderr() }),
    )
  }

const logsOf = (sandbox: Sandbox): Stream.Stream<LogLine, SandboxBootError> =>
  Stream.flatMap(
    Stream.fromEffect(
      Effect.tryPromise({
        try: () => sandbox.logStream({ follow: true }),
        catch: (cause) => new SandboxBootError({ sandboxName: sandbox.name, reason: describeCause(cause) }),
      }),
    ),
    (logStream) =>
      Stream.fromAsyncIterable(logStream, (cause) =>
        new SandboxBootError({ sandboxName: sandbox.name, reason: describeCause(cause) })),
  ).pipe(
    Stream.map((entry): LogLine => ({ source: entry.source, text: entry.text() })),
  )

const runningVMOf = (vm: AcquiredVM): RunningVM => ({
  name: vm.plan.name,
  mappedPorts: HashMap.fromIterable(
    vm.plan.portBindings.map((binding) => [binding.guest, binding.hostPort] as const),
  ),
  exec: execOf(vm.sandbox),
  logs: logsOf(vm.sandbox),
  ping: Effect.map(Effect.option(Effect.promise(() => vm.sandbox.ping())), Option.isSome),
})

const make = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const crypto = yield* Crypto.Crypto
  return {
    start: (spec: MicroVMSpec): Effect.Effect<RunningVM, MicroVMError, Scope.Scope> =>
      Effect.map(
        bootMicroVM.run(spec).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Crypto.Crypto, crypto),
        ),
        runningVMOf,
      ),
  }
})

export const MicroVMLive: Layer.Layer<MicroVM, never, Crypto.Crypto | FileSystem.FileSystem> = Layer.effect(
  MicroVM,
  make,
)
