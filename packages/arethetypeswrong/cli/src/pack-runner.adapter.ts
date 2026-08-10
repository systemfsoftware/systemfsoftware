import * as PlatformCommand from '@effect/platform/Command'
import { CommandExecutor } from '@effect/platform/CommandExecutor'
import { Context, Effect, Layer, Schema } from 'effect'

export class PackRunnerFailed extends Schema.TaggedError<PackRunnerFailed>()('PackRunnerFailed', {
  message: Schema.String,
}) {}

export interface PackResult {
  readonly tarballPath: string
}

export interface PackRunnerService {
  readonly pack: (cwd: string) => Effect.Effect<PackResult, PackRunnerFailed, CommandExecutor>
}

export class PackRunner extends Context.Tag('@systemfsoftware/arethetypeswrong-cli/pack-runner.adapter/PackRunner')<
  PackRunner,
  PackRunnerService
>() {}

export const PackRunnerLive: Layer.Layer<PackRunner, never, CommandExecutor> = Layer.succeed(
  PackRunner,
  {
    pack: (cwd) =>
      Effect.gen(function*() {
        const cmd = PlatformCommand.make('npm', 'pack').pipe(PlatformCommand.workingDirectory(cwd))
        const output = yield* PlatformCommand.string(cmd).pipe(
          Effect.mapError((e) => new PackRunnerFailed({ message: `npm pack failed in ${cwd}: ${String(e)}` })),
        )
        const tarballName = output.trim().split('\n').pop() ?? ''
        if (!tarballName) {
          return yield* Effect.fail(new PackRunnerFailed({ message: 'npm pack produced no tarball name' }))
        }
        return { tarballPath: tarballName }
      }),
  },
)
