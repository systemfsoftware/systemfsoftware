import { Context, Effect, Layer } from 'effect'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'

import { PackRunnerFailed } from './PackRunner.schema.js'

export interface PackResult {
  readonly tarballPath: string
}

export interface PackRunnerService {
  readonly pack: (cwd: string) => Effect.Effect<PackResult, PackRunnerFailed, ChildProcessSpawner>
}

export class PackRunner extends Context.Service<PackRunner, PackRunnerService>()(
  '@systemfsoftware/arethetypeswrong-cli/pack-runner.adapter/PackRunner',
) {}

export const PackRunnerLive: Layer.Layer<PackRunner, never, ChildProcessSpawner> = Layer.succeed(
  PackRunner,
  {
    pack: (cwd) =>
      Effect.gen(function*() {
        const spawner = yield* ChildProcessSpawner
        // `--ignore-scripts`: packing here acquires the artifact for analysis, it
        // does not deploy it. Running the target's pack hooks would execute
        // arbitrary lifecycle scripts (`prepack`, `prepare`) and rebuild `dist`
        // mid-analysis — in the turbo gate that clean-and-rebuild window races
        // every concurrent task reading `dist` (a dependent's `tsc`, the contract
        // lane's precondition) and is indistinguishable from a broken build.
        // Analysis must not mutate the tree it reads.
        const cmd = ChildProcess.make('npm', ['pack', '--ignore-scripts']).pipe(ChildProcess.setCwd(cwd))
        const output = yield* spawner.string(cmd).pipe(
          Effect.mapError((e) => new PackRunnerFailed({ message: `npm pack failed in ${cwd}`, cause: e })),
        )
        const tarballName = output.trim().split('\n').pop() ?? ''
        if (!tarballName) {
          return yield* Effect.fail(new PackRunnerFailed({ message: 'npm pack produced no tarball name' }))
        }
        return { tarballPath: tarballName }
      }),
  },
)
