import { NodeFileSystem, NodePath, NodeWorkerRunner } from '@effect/platform-node'
import { Checker, CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { ContributionOf } from '@systemfsoftware/stryker-js/Plugin'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as RpcServer from 'effect/unstable/rpc/RpcServer'
import * as RpcWorker from 'effect/unstable/rpc/RpcWorker'

import { create, loadPlugins } from './Plugins.js'
import { CheckerRpcs } from './WorkerProtocol.js'

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
          ),
        ),
      ),
    ),
  )

const mutantIdsOf = (mutants: readonly Mutant[]): ReadonlyArray<string> => mutants.map((mutant) => mutant.id)

const CheckerHandlers = CheckerRpcs.toLayer(
  Effect.gen(function*() {
    const options = yield* RpcWorker.initialMessage(StrykerOptionsSchema)
    const loaded = yield* loadPlugins(options.plugins, process.cwd())
    let checkers = HashMap.empty<string, Checker['Service']>()
    for (const name of options.checkers) {
      const contribution = yield* create(loaded.pluginsByKind, 'Checker', name)
      const checker = yield* buildChecker(contribution, options)
      yield* checker.init
      checkers = HashMap.set(checkers, name, checker)
    }

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

const MainLayer = RpcServer.layer(CheckerRpcs).pipe(
  Layer.provide(CheckerHandlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(NodeWorkerRunner.layer),
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
