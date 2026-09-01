import { NodeFileSystem, NodePath, NodeSocketServer } from '@effect/platform-node'
import { Checker, CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { ContributionOf } from '@systemfsoftware/stryker-js/Plugin'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import { Schema as S } from 'effect'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'
import * as RpcServer from 'effect/unstable/rpc/RpcServer'

import { CheckerRpcs, create, loadPlugins } from '@systemfsoftware/stryker-js-engine/worker'
import { nodeModuleLayer } from '../platform/node.js'

const buildChecker = (
  contribution: ContributionOf<'Checker'>,
  options: StrykerOptions,
): Effect.Effect<Checker['Service'], never, never> =>
  Checker.pipe(
    Effect.provide(
      contribution.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(RunConfiguration, options),
            Layer.succeed(SandboxDirectory, process.cwd()),
            NodeFileSystem.layer,
            NodePath.layer,
            nodeModuleLayer,
          ),
        ),
      ),
    ),
  )

const mutantIdsOf = (mutants: readonly Mutant[]): ReadonlyArray<string> => mutants.map((mutant) => mutant.id)

const readWorkerOptions = Effect.gen(function*() {
  const workerDir = process.env['STRYKER_WORKER_DIR'] ?? (yield* Effect.die(new Error('STRYKER_WORKER_DIR is not set')))
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const raw = yield* fs.readFileString(path.join(workerDir, 'options.json'))
  return yield* S.decodeUnknownEffect(S.fromJsonString(S.toCodecJson(StrykerOptionsSchema)))(raw)
})

const CheckerHandlers = CheckerRpcs.toLayer(
  Effect.gen(function*() {
    const options = yield* readWorkerOptions
    const loaded = yield* loadPlugins(options.plugins, process.cwd())
    const checkers = HashMap.fromIterable(
      yield* Effect.forEach(
        options.checkers,
        (name) =>
          Effect.gen(function*() {
            const contribution = yield* create(loaded.pluginsByKind, 'Checker', name)
            const checker = yield* buildChecker(contribution, options)
            yield* checker.init
            return [name, checker] as const
          }),
        { concurrency: 'unbounded', discard: false },
      ),
    )

    const resolve = (
      checkerName: string,
      mutants: readonly Mutant[],
    ): Effect.Effect<Checker['Service'], CheckerFailed> =>
      Option.match(HashMap.get(checkers, checkerName), {
        onNone: () =>
          Effect.fail(
            new CheckerFailed({
              cause: `Checker ${checkerName} does not exist`,
              checkerName,
              mutantIds: mutantIdsOf(mutants),
            }),
          ),
        onSome: (checker: Checker['Service']) => Effect.succeed(checker),
      })

    return {
      check: ({ checkerName, mutants }: { readonly checkerName: string; readonly mutants: readonly Mutant[] }) =>
        resolve(checkerName, mutants).pipe(
          Effect.flatMap((checker) => checker.check([...mutants])),
          Effect.map((resultMap) => Object.fromEntries(resultMap)),
        ),

      group: ({ checkerName, mutants }: { readonly checkerName: string; readonly mutants: readonly Mutant[] }) =>
        resolve(checkerName, mutants).pipe(
          Effect.flatMap((checker) => checker.group([...mutants])),
        ),
    }
  }),
).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))

const socketPath = process.env['STRYKER_SOCKET']
if (socketPath === undefined) {
  process.stderr.write('checker worker stopped: STRYKER_SOCKET is not set\n')
  process.exit(1)
}

const MainLayer = RpcServer.layer(CheckerRpcs).pipe(
  Layer.provide(CheckerHandlers),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeSocketServer.layer({ path: socketPath })),
  Layer.provide(nodeModuleLayer),
)

Effect.runFork(
  Layer.launch(MainLayer).pipe(
    Effect.tapCause((cause) =>
      Effect.sync(() => {
        process.stderr.write(`checker worker stopped: ${Cause.pretty(cause)}\n`)
        process.exitCode = 1
      })
    ),
  ),
)
