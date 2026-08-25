import { NodeFileSystem } from '@effect/platform-node'
import { NodePath } from '@effect/platform-node'
import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import { Checker } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { RunConfiguration } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { ContributionOf } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import { StrykerError } from '../stryker-error.schema.js'

import { create } from '../plugins/plugin-creator.js'
import { loadPlugins } from '../plugins/plugin-loader.js'
const buildChecker = (
  contribution: ContributionOf<PluginKind.Checker>,
  options: StrykerOptions,
): Effect.Effect<Checker['Service'], never> =>
  Effect.gen(function*() {
    const checker = yield* Checker
    return checker
  }).pipe(
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

const noopLogger: Logger = {
  isTraceEnabled: () => false,
  isDebugEnabled: () => false,
  isInfoEnabled: () => false,
  isWarnEnabled: () => false,
  isErrorEnabled: () => false,
  isFatalEnabled: () => false,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

const makeCheckerWorker = () => {
  class CheckerNotFoundError extends S.TaggedError<CheckerNotFoundError>(
    '~systemfsoftware/stryker-js/mutation-run/CheckerWorker/CheckerNotFoundError',
  )('CheckerNotFoundError', {
    checkerName: S.String,
  }) {
    override get message(): string {
      return `Checker ${this.checkerName} does not exist!`
    }
  }

  let innerCheckers: HashMap.HashMap<string, Checker['Service']> | undefined = undefined
  const runtime = ManagedRuntime.make(Layer.merge(NodeFileSystem.layer, NodePath.layer))

  const init = async (...args: unknown[]): Promise<void> => {
    if (innerCheckers !== undefined) {
      for (const [name, checker] of HashMap.toEntries(innerCheckers)) {
        try {
          await runtime.runPromise(checker.init)
        } catch (error: unknown) {
          throw new StrykerError({
            message: `An error occurred during initialization of the "${name}" checker`,
            cause: error,
          })
        }
      }
      return
    }
    if (args.length === 0) {
      throw new StrykerError({
        message: 'CheckerWorker not initialized: init requires StrykerOptions',
        cause: undefined,
      })
    }
    let options: StrykerOptions
    try {
      options = await runtime.runPromise(S.decodeUnknownEffect(StrykerOptionsSchema)(args[0]))
    } catch (cause: unknown) {
      throw new StrykerError({
        message: 'CheckerWorker init received invalid StrykerOptions',
        cause,
      })
    }
    let pluginsByKind
    try {
      const loaded = await runtime.runPromise(loadPlugins(options.plugins, noopLogger, process.cwd()))
      pluginsByKind = loaded.pluginsByKind
    } catch (cause: unknown) {
      throw new StrykerError({
        message: 'CheckerWorker failed to load plugins',
        cause,
      })
    }
    const built = await runtime.runPromise(
      Effect.gen(function*() {
        let map = HashMap.empty<string, Checker['Service']>()
        for (const name of options.checkers) {
          const contribution = yield* create(pluginsByKind, PluginKind.Checker, name)
          const checker = yield* buildChecker(contribution, options)
          map = HashMap.set(map, name, checker)
        }
        return map
      }),
    )
    innerCheckers = built
    for (const [name, checker] of HashMap.toEntries(built)) {
      try {
        await runtime.runPromise(checker.init)
      } catch (error: unknown) {
        throw new StrykerError({
          message: `An error occurred during initialization of the "${name}" checker`,
          cause: error,
        })
      }
    }
  }

  const check = async (
    checkerName: string,
    mutants: readonly Mutant[],
  ): Promise<Record<string, CheckResult>> => {
    if (innerCheckers === undefined) {
      throw new StrykerError({
        message: 'CheckerWorker not initialized: call init before check',
        cause: undefined,
      })
    }
    const maybeChecker = HashMap.get(innerCheckers, checkerName)
    if (Option.isNone(maybeChecker)) {
      throw new CheckerNotFoundError({ checkerName })
    }
    const checker = maybeChecker.value
    const resultMap = await runtime.runPromise(checker.check([...mutants]))
    return Object.fromEntries(resultMap.entries())
  }

  const group = async (
    checkerName: string,
    mutants: readonly Mutant[],
  ): Promise<readonly (readonly string[])[]> => {
    if (innerCheckers === undefined) {
      throw new StrykerError({
        message: 'CheckerWorker not initialized: call init before group',
        cause: undefined,
      })
    }
    const maybeChecker = HashMap.get(innerCheckers, checkerName)
    if (Option.isNone(maybeChecker)) {
      throw new CheckerNotFoundError({ checkerName })
    }
    const checker = maybeChecker.value
    return runtime.runPromise(checker.group([...mutants]))
  }

  return {
    init,
    check,
    group,
  }
}

export const CheckerWorker = makeCheckerWorker()
