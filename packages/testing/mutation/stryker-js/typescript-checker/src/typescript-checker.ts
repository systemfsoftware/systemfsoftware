import { EOL } from 'os'

import { Checker } from '@systemfsoftware/stryker-js-plugin-api/check'
import { CheckerFailed } from '@systemfsoftware/stryker-js-plugin-api/check'
import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { strykerReportBugUrl } from '@systemfsoftware/stryker-js-util'
import { Predicate, Result } from 'effect'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import { DiagnosticCategory } from 'typescript/unstable/sync'
import type { Diagnostic } from 'typescript/unstable/sync'

import { createGroups } from './grouping/create-groups.js'
import type { TSFileNode } from './grouping/ts-file-node.js'
import { classifyDiagnostics, partitionMutantsForGrouping } from './kernel/check-kernel.js'
import { createDiagnosticsMap, createResultMap } from './kernel/result-helpers.js'
import { HybridFileSystem } from './project/hybrid-file-system.js'
import { toPosixFileName } from './tsconfig-helpers.js'
import { TypescriptCompiler } from './typescript-compiler.js'

interface CheckerDeps {
  readonly options: unknown
  readonly compiler: TypescriptCompiler
}

function getPrioritize(options: unknown): boolean {
  if (!Predicate.hasProperty(options, 'typescriptChecker')) {
    return false
  }
  const tc = options['typescriptChecker']
  if (typeof tc !== 'object' || tc === null) {
    return false
  }
  if (!Predicate.hasProperty(tc, 'prioritizePerformanceOverAccuracy')) {
    return false
  }
  const val = tc['prioritizePerformanceOverAccuracy']
  return typeof val === 'boolean' ? val : false
}

export function makeCheckerService({ options, compiler }: CheckerDeps): Checker['Service'] {
  const formatDiagnostic = (error: Diagnostic): string => {
    const severity = error.category === DiagnosticCategory.Error
      ? 'error'
      : error.category === DiagnosticCategory.Warning
      ? 'warning'
      : error.category === DiagnosticCategory.Suggestion
      ? 'suggestion'
      : 'message'

    let location = ''
    if (error.fileName) {
      const lineAndCharacter = compiler.getLineAndCharacterOfPosition(error.fileName, error.pos)
      const line = (lineAndCharacter?.line ?? 0) + 1
      const character = (lineAndCharacter?.character ?? 0) + 1
      location = `${error.fileName}(${line},${character}): `
    }

    return `${location}${severity} TS${error.code}: ${error.text}`
  }

  const createErrorText = (errors: readonly Diagnostic[]): string =>
    errors.map((error) => formatDiagnostic(error)).join(EOL)

  const checkErrors = (
    mutants: readonly Mutant[],
    errorsMap: Map<string, Diagnostic[]>,
    nodes: ReadonlyMap<string, TSFileNode>,
  ): Effect.Effect<void, CheckerFailed> =>
    Effect.gen(function*() {
      const diagnostics = yield* Effect.tryPromise({
        try: () => compiler.check([...mutants]),
        catch: (cause) =>
          new CheckerFailed({
            checkerName: 'typescript',
            mutantIds: mutants.map((m) => m.id),
            cause,
          }),
      })

      const classified = classifyDiagnostics(diagnostics, mutants, nodes)
      if (Result.isFailure(classified)) {
        const failure = classified.failure
        const message = Match.value(failure).pipe(
          Match.tag('DiagnosticWithoutFileError', (f) =>
            `Typescript error: '${f.text}' was reported without a corresponding file. This shouldn't happen. Please open an issue using this link: ${
              strykerReportBugUrl(
                `[BUG]: TypeScript checker reports compile error without a corresponding file: ${f.text}`,
              )
            }`),
          Match.tag('DiagnosticInUnrelatedFileError', (f) =>
            `Typescript error: '${f.text}' was reported in an unrelated file (${f.fileName}). This file is not part of your project, or referenced from your project. This shouldn't happen, please open an issue using this link: ${
              strykerReportBugUrl(
                `[BUG]: TypeScript checker reports compile error in an unrelated file: ${f.text}`,
              )
            }`),
          Match.exhaustive,
        )
        return yield* new CheckerFailed({
          checkerName: 'typescript',
          mutantIds: mutants.map((m) =>
            m.id
          ),
          cause: new Error(message),
        })
      }

      const { definitive, needsRetest } = classified.success

      for (const [id, errors] of definitive.entries()) {
        const existing = errorsMap.get(id)
        if (existing) {
          existing.push(...errors)
        } else {
          errorsMap.set(id, [...errors])
        }
      }

      if (needsRetest.length > 0) {
        yield* Effect.tryPromise({
          try: () =>
            compiler.check([]),
          catch: (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: needsRetest.map((m) =>
                m.id
              ),
              cause,
            }),
        })

        for (const mutant of needsRetest) {
          if (errorsMap.has(mutant.id)) {
            continue
          }
          yield* checkErrors([mutant], errorsMap, nodes)
        }
      }
    })

  return {
    init: Effect.gen(function*() {
      yield* Effect.logDebug('typescript checker init')
      const errors = yield* Effect.tryPromise({
        try: () => compiler.init(),
        catch: (cause) =>
          new CheckerFailed({
            checkerName: 'typescript',
            mutantIds: [],
            cause,
          }),
      })
      if (errors.length > 0) {
        return yield* new CheckerFailed({
          checkerName: 'typescript',
          mutantIds: [],
          cause: new Error(
            `Typescript error(s) found in dry run compilation: ${createErrorText(errors)}`,
          ),
        })
      }
    }),

    check: (mutants) =>
      Effect.gen(function*() {
        yield* Effect.logDebug('typescript checker check', { count: mutants.length })
        const result = createResultMap()
        for (const mutant of mutants) {
          result.set(mutant.id, { status: CheckStatus.Passed })
        }

        const firstMutant = mutants[0]
        if (!firstMutant || !compiler.nodes.get(toPosixFileName(firstMutant.fileName))) {
          return result
        }

        const errorsMap = createDiagnosticsMap()
        yield* checkErrors(mutants, errorsMap, compiler.nodes)

        for (const [id, errors] of errorsMap.entries()) {
          result.set(id, {
            status: CheckStatus.CompileError,
            reason: createErrorText(errors),
          })
        }

        return result
      }),

    group: (mutants) => {
      const prioritize = getPrioritize(options)
      const { inside, outside } = partitionMutantsForGrouping(
        mutants,
        compiler.nodes,
        prioritize,
      )

      if (inside.length === 0) {
        return Effect.succeed(mutants.map((m) => [m.id]))
      }

      const groups = createGroups([...inside], compiler.nodes)
      if (outside.length > 0) {
        const outsideGroup = outside.map((m) => m.id)
        return Effect.succeed([outsideGroup, ...groups])
      }
      return Effect.succeed(groups)
    },
  }
}

// Backwards-compatible factory used by legacy tests that construct the checker
// via `new TypescriptChecker(...)`. Prefer the declared plugin layer.
export class TypescriptChecker {
  private readonly service: Checker['Service']

  constructor(
    _logger: unknown,
    options: unknown,
    compiler?: TypescriptCompiler,
  ) {
    const fs = new HybridFileSystem()
    const comp = compiler ?? new TypescriptCompiler(options, fs)
    this.service = makeCheckerService({
      options,
      compiler: comp,
    })
  }

  public init(): Promise<void> {
    return Effect.runPromise(this.service.init)
  }

  public check(mutants: Mutant[]): Promise<Record<string, CheckResult>> {
    return Effect.runPromise(
      this.service.check(mutants).pipe(
        Effect.map((m) => Object.fromEntries(m.entries())),
      ),
    )
  }

  public group(mutants: Mutant[]): Promise<string[][]> {
    return Effect.runPromise(
      this.service.group(mutants).pipe(
        Effect.map((groups) => groups.map((g) => [...g])),
      ),
    )
  }
}
