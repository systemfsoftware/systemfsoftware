import { EOL } from 'os'

import { Checker } from '@systemfsoftware/stryker-js-plugin-api/check'
import { CheckerFailed } from '@systemfsoftware/stryker-js-plugin-api/check'
import { CheckStatus } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { normalizeFileName, strykerReportBugUrl } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Predicate, Result } from 'effect'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import { DiagnosticCategory } from 'typescript/unstable/sync'
import type { Diagnostic } from 'typescript/unstable/sync'

import { createGroups } from './grouping/create-groups.js'
import type { TSFileNode } from './grouping/ts-file-node.js'
import { classifyDiagnostics, partitionMutantsForGrouping } from './kernel/check-kernel.js'
import type { TypeScriptCompiler } from './typescript-compiler.js'

interface CheckerDeps {
  readonly options: unknown
  readonly compiler: TypeScriptCompiler['Service']
}

const emptyCheckResultMap = (): Map<string, CheckResult> => new Map()
const emptyDiagnosticMap = (): Map<string, Diagnostic[]> => new Map()

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
  const formatDiagnostic = (error: Diagnostic): Effect.Effect<string, never> =>
    Effect.gen(function*() {
      const severity = error.category === DiagnosticCategory.Error
        ? 'error'
        : error.category === DiagnosticCategory.Warning
        ? 'warning'
        : error.category === DiagnosticCategory.Suggestion
        ? 'suggestion'
        : 'message'

      let location = ''
      if (error.fileName) {
        const lineAndCharacter = yield* compiler
          .getLineAndCharacterOfPosition(error.fileName, error.pos)
          .pipe(Effect.orElseSucceed(() => undefined))
        const line = (lineAndCharacter?.line ?? 0) + 1
        const character = (lineAndCharacter?.character ?? 0) + 1
        location = `${error.fileName}(${line},${character}): `
      }

      return `${location}${severity} TS${error.code}: ${error.text}`
    })

  const createErrorText = (errors: readonly Diagnostic[]): Effect.Effect<string, never> =>
    Effect.gen(function*() {
      const parts = yield* Effect.forEach(errors, formatDiagnostic)
      return parts.join(EOL)
    })

  const checkErrors = (
    mutants: readonly Mutant[],
    errorsMap: Map<string, Diagnostic[]>,
    nodes: ReadonlyMap<string, TSFileNode>,
  ): Effect.Effect<void, CheckerFailed> =>
    Effect.gen(function*() {
      const diagnostics = yield* compiler.check([...mutants]).pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: mutants.map((m) => m.id),
              cause,
            }),
        ),
      )

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
        yield* compiler.check([]).pipe(
          Effect.mapError(
            (cause) =>
              new CheckerFailed({
                checkerName: 'typescript',
                mutantIds: needsRetest.map((m) =>
                  m.id
                ),
                cause,
              }),
          ),
        )

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
      const errors = yield* compiler.init.pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: [],
              cause,
            }),
        ),
      )
      if (errors.length > 0) {
        const text = yield* createErrorText(errors)
        return yield* new CheckerFailed({
          checkerName: 'typescript',
          mutantIds: [],
          cause: new Error(`Typescript error(s) found in dry run compilation: ${text}`),
        })
      }
    }),

    check: (mutants) =>
      Effect.gen(function*() {
        const nodes = yield* compiler.nodes.pipe(
          Effect.mapError(
            (cause) =>
              new CheckerFailed({
                checkerName: 'typescript',
                mutantIds: mutants.map((m) => m.id),
                cause,
              }),
          ),
        )
        const result = emptyCheckResultMap()
        for (const mutant of mutants) {
          result.set(mutant.id, { status: CheckStatus.Passed })
        }
        const firstMutant = mutants[0]
        if (!firstMutant || !nodes.get(normalizeFileName(firstMutant.fileName))) {
          return result
        }
        const errorsMap = emptyDiagnosticMap()
        yield* checkErrors(mutants, errorsMap, nodes)

        for (const [id, errors] of errorsMap.entries()) {
          const text = yield* createErrorText(errors)
          result.set(id, {
            status: CheckStatus.CompileError,
            reason: text,
          })
        }

        return result
      }),

    group: (mutants) =>
      Effect.gen(function*() {
        const nodes = yield* compiler.nodes.pipe(
          Effect.mapError(
            (cause) =>
              new CheckerFailed({
                checkerName: 'typescript',
                mutantIds: mutants.map((m) => m.id),
                cause,
              }),
          ),
        )
        const prioritize = getPrioritize(options)
        const { inside, outside } = partitionMutantsForGrouping(mutants, nodes, prioritize)

        if (inside.length === 0) {
          return mutants.map((m) => [m.id])
        }

        const groups = createGroups([...inside], nodes)
        if (outside.length > 0) {
          const outsideGroup = outside.map((m) => m.id)
          return [outsideGroup, ...groups]
        }
        return groups
      }),
  }
}
