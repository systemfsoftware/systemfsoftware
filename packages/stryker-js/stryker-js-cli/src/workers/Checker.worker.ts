import { NodeFileSystem, NodePath, NodeSocketServer } from '@effect/platform-node'
import { errorToString } from '@systemfsoftware/stryker-js'
import type { Checker, CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { PluginInit, StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type { PluginContribution } from '@systemfsoftware/stryker-js/Plugin'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'
import * as RpcServer from 'effect/unstable/rpc/RpcServer'

import { nodeModuleLayer } from '../platform/node.js'
import { CheckerRpcs, create, decodeWorkerOptions, loadPlugins } from '../run/worker-wiring.js'
import { launchWorker, workerSocketPath } from './worker-runtime.js'

const NO_INIT: PluginInit = {}

const buildChecker = (contribution: PluginContribution<'Checker'>, options: StrykerOptions): Checker =>
  contribution.make(options, NO_INIT)

const checkerFailed = (
  checkerName: string,
  mutants: readonly Mutant[],
  cause: string,
): CheckerFailed => ({
  _tag: 'CheckerFailed',
  cause,
  checkerName,
  mutantIds: mutants.map((mutant) => mutant.id),
})

const readWorkerOptions = Effect.gen(function*() {
  const workerDir = process.env['STRYKER_WORKER_DIR'] ?? (yield* Effect.die(new Error('STRYKER_WORKER_DIR is not set')))
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const raw = yield* fs.readFileString(path.join(workerDir, 'options.json'))
  return yield* decodeWorkerOptions(raw)
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
            const checker = buildChecker(contribution, options)
            yield* Effect.tryPromise({
              try: async () => checker.init?.(),
              catch: (cause) => checkerFailed(name, [], errorToString(cause)),
            })
            return [name, checker] as const
          }),
        { concurrency: 'unbounded', discard: false },
      ),
    )

    const resolve = (
      checkerName: string,
      mutants: readonly Mutant[],
    ): Effect.Effect<Checker, CheckerFailed> =>
      Option.match(HashMap.get(checkers, checkerName), {
        onNone: () => Effect.fail(checkerFailed(checkerName, mutants, `Checker ${checkerName} does not exist`)),
        onSome: (checker: Checker) => Effect.succeed(checker),
      })

    return {
      check: ({ checkerName, mutants }: { readonly checkerName: string; readonly mutants: readonly Mutant[] }) =>
        resolve(checkerName, mutants).pipe(
          Effect.flatMap((checker) =>
            Option.match(Option.fromUndefinedOr(checker.check), {
              onNone: () =>
                Effect.fail(
                  checkerFailed(checkerName, mutants, `Checker ${checkerName} does not expose a check function`),
                ),
              onSome: (check) =>
                Effect.tryPromise({
                  try: async () => await check([...mutants]),
                  catch: (cause) => checkerFailed(checkerName, mutants, errorToString(cause)),
                }),
            })
          ),
        ),

      group: ({ checkerName, mutants }: { readonly checkerName: string; readonly mutants: readonly Mutant[] }) =>
        resolve(checkerName, mutants).pipe(
          Effect.flatMap((checker) =>
            Option.match(Option.fromUndefinedOr(checker.group), {
              onNone: () =>
                Effect.fail(
                  checkerFailed(checkerName, mutants, `Checker ${checkerName} does not expose a group function`),
                ),
              onSome: (group) =>
                Effect.tryPromise({
                  try: async () => await group([...mutants]),
                  catch: (cause) => checkerFailed(checkerName, mutants, errorToString(cause)),
                }),
            })
          ),
        ),
    }
  }),
).pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))

const MainLayer = RpcServer.layer(CheckerRpcs).pipe(
  Layer.provide(CheckerHandlers),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeSocketServer.layer({ path: workerSocketPath('checker worker') })),
  Layer.provide(nodeModuleLayer),
)

launchWorker(MainLayer, 'checker worker')
