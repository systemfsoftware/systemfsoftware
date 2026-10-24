import { Effect, Layer, Stream } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import { Pnpm, type PnpmInvocation } from './pnpm.service.js'

const commandOf = (invocation: PnpmInvocation): ChildProcess.Command =>
  ChildProcess.make('pnpm', [...invocation.args], {
    cwd: invocation.cwd,
    env: { ...invocation.env },
    extendEnv: false,
  })

export const layer: Layer.Layer<Pnpm, never, ChildProcessSpawner.ChildProcessSpawner> = Layer.effect(
  Pnpm,
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return Pnpm.of({
      run: (invocation) =>
        Effect.scoped(
          Effect.gen(function*() {
            const handle = yield* spawner.spawn(commandOf(invocation))
            const [output, exitCode] = yield* Effect.all(
              [Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode],
              { concurrency: 2 },
            )
            return { exitCode: Number(exitCode), output }
          }),
        ),
    })
  }),
)
