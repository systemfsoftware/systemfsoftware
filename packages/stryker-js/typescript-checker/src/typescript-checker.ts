import { EOL } from 'os'

import type { Checker, CheckResult } from '@stryker-mutator/api/check'
import { CheckStatus } from '@stryker-mutator/api/check'
import type { Mutant, StrykerOptions } from '@stryker-mutator/api/core'
import type { Logger, LoggerFactoryMethod } from '@stryker-mutator/api/logging'
import { commonTokens, Scope, tokens } from '@stryker-mutator/api/plugin'
import type { Injector, PluginContext } from '@stryker-mutator/api/plugin'
import { split, strykerReportBugUrl } from '@stryker-mutator/util'
import { DiagnosticCategory } from 'typescript/unstable/sync'
import type { Diagnostic } from 'typescript/unstable/sync'

import { HybridFileSystem } from './fs/hybrid-file-system.js'
import { createGroups } from './grouping/create-groups.js'
import { TSFileNode } from './grouping/ts-file-node.js'
import * as pluginTokens from './plugin-tokens.js'
import { toPosixFileName } from './tsconfig-helpers.js'
import type { TypescriptCheckerOptionsWithStrykerOptions } from './typescript-checker-options-with-stryker-options.js'
import { TypescriptCompiler } from './typescript-compiler.js'

const typescriptCheckerLoggerFactory = Object.assign(
  (
    loggerFactory: LoggerFactoryMethod,
    target: Function | undefined,
  ): Logger => {
    const targetName = target?.name ?? TypescriptChecker.name
    const category = targetName === TypescriptChecker.name
      ? TypescriptChecker.name
      : `${TypescriptChecker.name}.${targetName}`
    return loggerFactory(category)
  },
  {
    inject: tokens(commonTokens.getLogger, commonTokens.target),
  },
)

export const create = Object.assign(
  (injector: Injector<PluginContext>): TypescriptChecker =>
    injector
      .provideFactory(
        commonTokens.logger,
        typescriptCheckerLoggerFactory,
        Scope.Transient,
      )
      .provideClass(pluginTokens.fs, HybridFileSystem)
      .provideClass(pluginTokens.tsCompiler, TypescriptCompiler)
      .injectClass(TypescriptChecker),
  {
    inject: tokens(commonTokens.injector),
  },
)

export class TypescriptChecker implements Checker {
  public static inject = tokens(
    commonTokens.logger,
    commonTokens.options,
    pluginTokens.tsCompiler,
  )

  private readonly options: TypescriptCheckerOptionsWithStrykerOptions

  constructor(
    private readonly logger: Logger,
    options: StrykerOptions,
    private readonly tsCompiler: TypescriptCompiler,
  ) {
    this.options = options as TypescriptCheckerOptionsWithStrykerOptions
  }

  public async init(): Promise<void> {
    const errors = await this.tsCompiler.init()

    if (errors.length) {
      throw new Error(
        `Typescript error(s) found in dry run compilation: ${this.createErrorText(errors)}`,
      )
    }
  }

  public async check(mutants: Mutant[]): Promise<Record<string, CheckResult>> {
    const result: Record<string, CheckResult> = Object.fromEntries(
      mutants.map((mutant) => [mutant.id, { status: CheckStatus.Passed }]),
    )

    // Check if this is the group with unrelated files and return check status passed if so
    if (!this.tsCompiler.nodes.get(toPosixFileName(mutants[0]!.fileName))) {
      return result
    }

    const mutantErrorRelationMap = await this.checkErrors(
      mutants,
      {},
      this.tsCompiler.nodes,
    )
    for (const [id, errors] of Object.entries(mutantErrorRelationMap)) {
      result[id] = {
        status: CheckStatus.CompileError,
        reason: this.createErrorText(errors),
      }
    }

    return result
  }

  public group(mutants: Mutant[]): Promise<string[][]> {
    if (!this.options.typescriptChecker?.prioritizePerformanceOverAccuracy) {
      return Promise.resolve(mutants.map((m) => [m.id]))
    }
    const { nodes } = this.tsCompiler
    const [mutantsOutsideProject, mutantsInProject] = split(
      mutants,
      (m) => nodes.get(toPosixFileName(m.fileName)) == null,
    )

    const groups = createGroups(mutantsInProject, nodes)
    if (mutantsOutsideProject.length) {
      return Promise.resolve([
        mutantsOutsideProject.map((m) => m.id),
        ...groups,
      ])
    } else {
      return Promise.resolve(groups)
    }
  }

  private async checkErrors(
    mutants: Mutant[],
    errorsMap: Record<string, Diagnostic[]>,
    nodes: Map<string, TSFileNode>,
  ): Promise<Record<string, Diagnostic[]>> {
    const errors = await this.tsCompiler.check(mutants)
    const mutantsThatCouldNotBeTestedInGroups = new Set<Mutant>()

    // If there is only a single mutant the error has to originate from the single mutant
    if (errors.length && mutants.length === 1) {
      errorsMap[mutants[0]!.id] = errors
      return errorsMap
    }

    for (const error of errors) {
      if (!error.fileName) {
        throw new Error(
          `Typescript error: '${error.text}' was reported without a corresponding file. This shouldn't happen. Please open an issue using this link: ${
            strykerReportBugUrl(
              `[BUG]: TypeScript checker reports compile error without a corresponding file: ${error.text}`,
            )
          }`,
        )
      }
      const nodeErrorWasThrownIn = nodes.get(error.fileName)
      if (!nodeErrorWasThrownIn) {
        throw new Error(
          `Typescript error: '${error.text}' was reported in an unrelated file (${error.fileName}). This file is not part of your project, or referenced from your project. This shouldn't happen, please open an issue using this link: ${
            strykerReportBugUrl(
              `[BUG]: TypeScript checker reports compile error in an unrelated file: ${error.text}`,
            )
          }`,
        )
      }
      const mutantsRelatedToError = nodeErrorWasThrownIn.getMutantsWithReferenceToChildrenOrSelf(mutants)

      if (mutantsRelatedToError.length === 0) {
        // In rare cases there are no mutants related to the typescript error
        // Having to test all mutants individually to know which mutant thrown the error
        for (const mutant of mutants) {
          mutantsThatCouldNotBeTestedInGroups.add(mutant)
        }
      } else if (mutantsRelatedToError.length === 1) {
        // There is only one mutant related to the typescript error so we can add it to the errorsRelatedToMutant
        const mutantId = mutantsRelatedToError[0]!.id
        if (errorsMap[mutantId]) {
          errorsMap[mutantId]!.push(error)
        } else {
          errorsMap[mutantId] = [error]
        }
      } else {
        // If there are more than one mutants related to the error we should check them individually
        for (const mutant of mutantsRelatedToError) {
          mutantsThatCouldNotBeTestedInGroups.add(mutant)
        }
      }
    }

    if (mutantsThatCouldNotBeTestedInGroups.size) {
      // Because at this point the filesystem contains all the mutants from the group we need to reset back
      // to the original state of the files to make it possible to test the first mutant
      // if we wouldn't do this the first mutant would not be noticed by the compiler because it was already in the filesystem
      await this.tsCompiler.check([])
    }
    for (const mutant of mutantsThatCouldNotBeTestedInGroups) {
      if (errorsMap[mutant.id]) continue
      await this.checkErrors([mutant], errorsMap, nodes)
    }

    return errorsMap
  }

  private createErrorText(errors: Diagnostic[]): string {
    return errors
      .map((error) => this.formatDiagnostic(error))
      .join(EOL)
  }

  private formatDiagnostic(error: Diagnostic): string {
    const severity = error.category === DiagnosticCategory.Error
      ? 'error'
      : error.category === DiagnosticCategory.Warning
      ? 'warning'
      : error.category === DiagnosticCategory.Suggestion
      ? 'suggestion'
      : 'message'

    let location = ''
    if (error.fileName) {
      const lineAndCharacter = this.tsCompiler.getLineAndCharacterOfPosition(error.fileName, error.pos)
      const line = (lineAndCharacter?.line ?? 0) + 1
      const character = (lineAndCharacter?.character ?? 0) + 1
      location = `${error.fileName}(${line},${character}): `
    }

    return `${location}${severity} TS${error.code}: ${error.text}`
  }
}
