import { type Checker, type CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import { type Mutant, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { commonTokens, PluginKind, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { StrykerError } from '@systemfsoftware/stryker-js-util'

import { injectionTokens, PluginCreator } from '../plugins/index.js'

import { type CheckerResource } from './checker-resource.js'

export class CheckerWorker implements CheckerResource {
  private readonly innerCheckers: Map<string, Checker>

  public static inject = tokens(commonTokens.options, injectionTokens.pluginCreator)
  constructor(options: StrykerOptions, pluginCreator: PluginCreator) {
    this.innerCheckers = new Map(
      options.checkers.map((name) => [
        name,
        pluginCreator.create(PluginKind.Checker, name),
      ]),
    )
  }
  public async init(): Promise<void> {
    for (const [name, checker] of this.innerCheckers.entries()) {
      try {
        await checker.init()
      } catch (error: unknown) {
        throw new StrykerError(
          `An error occurred during initialization of the "${name}" checker`,
          error,
        )
      }
    }
  }
  public async check(
    checkerName: string,
    mutants: Mutant[],
  ): Promise<Record<string, CheckResult>> {
    return this.perform(checkerName, (checker) => checker.check(mutants))
  }

  public async group(
    checkerName: string,
    mutants: Mutant[],
  ): Promise<string[][]> {
    return this.perform(
      checkerName,
      (checker) =>
        checker.group?.(mutants) ??
          // Group one by one by default
          mutants.map(({ id }) => [id]),
    )
  }

  private perform<T>(checkerName: string, act: (checker: Checker) => T) {
    const checker = this.innerCheckers.get(checkerName)
    if (checker) {
      return act(checker)
    } else {
      throw new Error(`Checker ${checkerName} does not exist!`)
    }
  }
}
