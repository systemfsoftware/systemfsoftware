import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import { Checker } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { RunConfiguration } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { SandboxDirectory } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { ContributionOf } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { StrykerError } from '@systemfsoftware/stryker-js-util'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'

import { PluginCreator } from '../plugins/index.js'
import { PluginNotFoundError } from '../plugins/plugin-loader.schema.js'

export class CheckerWorker {
  private readonly innerCheckers: HashMap.HashMap<string, Checker['Service']>

  constructor(checkers: HashMap.HashMap<string, Checker['Service']>) {
    this.innerCheckers = checkers
  }

  static make(
    options: StrykerOptions,
    pluginCreator: PluginCreator,
  ): Effect.Effect<CheckerWorker, PluginNotFoundError> {
    return Effect.gen(function*() {
      let map = HashMap.empty<string, Checker['Service']>()
      for (const name of options.checkers) {
        const contribution = yield* pluginCreator.create(PluginKind.Checker, name)
        const checker = yield* buildChecker(contribution, options)
        map = HashMap.set(map, name, checker)
      }
      return new CheckerWorker(map)
    })
  }

  async init(): Promise<void> {
    for (const [name, checker] of HashMap.toEntries(this.innerCheckers)) {
      try {
        await Effect.runPromise(checker.init)
      } catch (error: unknown) {
        throw new StrykerError(
          `An error occurred during initialization of the "${name}" checker`,
          error,
        )
      }
    }
  }

  async check(
    checkerName: string,
    mutants: readonly Mutant[],
  ): Promise<Record<string, CheckResult>> {
    const maybeChecker = HashMap.get(this.innerCheckers, checkerName)
    if (Option.isNone(maybeChecker)) {
      throw new Error(`Checker ${checkerName} does not exist!`)
    }
    const checker = maybeChecker.value
    const resultMap = await Effect.runPromise(checker.check([...mutants]))
    return Object.fromEntries(resultMap.entries())
  }

  async group(
    checkerName: string,
    mutants: readonly Mutant[],
  ): Promise<readonly (readonly string[])[]> {
    const maybeChecker = HashMap.get(this.innerCheckers, checkerName)
    if (Option.isNone(maybeChecker)) {
      throw new Error(`Checker ${checkerName} does not exist!`)
    }
    const checker = maybeChecker.value
    return Effect.runPromise(checker.group([...mutants]))
  }
}
const buildChecker = (
  contribution: ContributionOf<PluginKind.Checker>,
  options: StrykerOptions,
): Effect.Effect<Checker['Service'], never> =>
  Effect.gen(function*() {
    const checker = yield* Checker
    return checker
  }).pipe(
    Effect.provide(contribution.layer),
    Effect.provideService(RunConfiguration, options),
    Effect.provideService(SandboxDirectory, process.cwd()),
  )
