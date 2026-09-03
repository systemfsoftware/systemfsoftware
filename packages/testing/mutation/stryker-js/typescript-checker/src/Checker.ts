/**
 * Checker — capability that validates mutants against the TypeScript compiler.
 *
 * Bridges the checker plugin protocol (`@systemfsoftware/stryker-js/Checker`)
 * to the compiler service and the pure `checkMutants` workflow. Diagnostics
 * are classified without I/O; the file graph is sourced from the compiler.
 */

import { Cell } from '@systemfsoftware/effect-cell-types'
import { Checker } from '@systemfsoftware/stryker-js/Checker'
import { CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { Predicate, Result } from 'effect'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import { DiagnosticCategory } from 'typescript/unstable/sync'
import type { Diagnostic } from 'typescript/unstable/sync'
import { CheckMutantsCommand } from './Checker.schema.js'
import {
  checkMutants,
  type CheckMutantsDecision,
  CheckMutantsInput,
  DiagnosticInUnrelatedFileError,
  DiagnosticWithoutFileError,
} from './Checker.workflow.js'
import type { TSFileNode } from './Compiler.js'
import { createGroups, TypeScriptCompiler } from './Compiler.js'

const normalizeFileName = (fileName: string): string => fileName.replace(/\\/g, '/')

// ── plugin options ───────────────────────────────────────────────────────

export interface TypescriptCheckerPluginOptions {
  typescriptChecker?: {
    prioritizePerformanceOverAccuracy?: boolean
  }
}

export interface TypescriptCheckerOptionsWithStrykerOptions extends TypescriptCheckerPluginOptions, StrykerOptions {}

// ── declaration source mapping ───────────────────────────────────────────

const findSourceMapRegex = /\/\/# sourceMappingURL=(.+)$/m

export function getSourceMappingURL(content: string): string | undefined {
  findSourceMapRegex.lastIndex = 0
  return findSourceMapRegex.exec(content)?.[1]
}

/**
 * Pure grouping decision: separates mutants inside the project graph from
 * those outside it, honouring `prioritizePerformanceOverAccuracy`.
 */
export function partitionMutantsForGrouping(
  mutants: readonly Mutant[],
  nodes: MutableHashMap.MutableHashMap<string, TSFileNode>,
  prioritizePerformanceOverAccuracy: boolean,
): { inside: readonly Mutant[]; outside: readonly Mutant[] } {
  if (!prioritizePerformanceOverAccuracy) {
    return { inside: [], outside: [...mutants] }
  }
  const outside: Mutant[] = []
  const inside: Mutant[] = []
  for (const m of mutants) {
    if (Option.isNone(MutableHashMap.get(nodes, normalizeFileName(m.fileName)))) {
      outside.push(m)
    } else {
      inside.push(m)
    }
  }
  return { inside, outside }
}

// ── checker wiring ───────────────────────────────────────────────────────

interface CheckerDeps {
  readonly options: unknown
  readonly compiler: TypeScriptCompiler['Service']
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
  if (typeof val === 'boolean') {
    return val
  }
  return false
}

const checkCell = Cell.layer({
  read: (command: CheckMutantsCommand) =>
    Effect.gen(function*() {
      const compiler = yield* TypeScriptCompiler
      const nodesHm = yield* compiler.nodes.pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: command.mutants.map((m) => m.id),
              cause: errorToString(cause),
            }),
        ),
      )
      const nodes: Record<string, TSFileNode> = {}
      for (const [k, v] of nodesHm) {
        nodes[k] = v
      }
      const diagnostics = yield* compiler.check([...command.mutants]).pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: command.mutants.map((m) => m.id),
              cause: errorToString(cause),
            }),
        ),
      )
      return new CheckMutantsInput({
        mutants: [...command.mutants],
        diagnostics: [...diagnostics],
        nodes,
      })
    }),
  decode: (raw: CheckMutantsInput) => Result.succeed(raw),
  decide: checkMutants,
  encode: (outcome: Result.Result<CheckMutantsDecision, DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError>) =>
    outcome,
  write: (outcome: Result.Result<CheckMutantsDecision, DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError>) =>
    Result.match(outcome, {
      onFailure: (failure) =>
        Effect.fail(
          new CheckerFailed({
            checkerName: 'typescript',
            mutantIds: [],
            cause: errorToString(failure),
          }),
        ),
      onSuccess: (decision) => Effect.succeed(decision),
    }),
})

export function makeCheckerService({ options, compiler }: CheckerDeps): Checker['Service'] {
  const formatDiagnostic = (error: Diagnostic): Effect.Effect<string, never> =>
    Effect.gen(function*() {
      let severity: string
      if (error.category === DiagnosticCategory.Error) {
        severity = 'error'
      } else if (error.category === DiagnosticCategory.Warning) {
        severity = 'warning'
      } else if (error.category === DiagnosticCategory.Suggestion) {
        severity = 'suggestion'
      } else {
        severity = 'message'
      }
      let location = ''
      const unknownError: unknown = error
      if (
        typeof unknownError === 'object' &&
        unknownError !== null &&
        'fileName' in unknownError &&
        typeof unknownError.fileName === 'string'
      ) {
        const fileName: string = unknownError.fileName
        const lineAndCharacter = yield* compiler.getLineAndCharacterOfPosition(fileName, error.pos).pipe(
          Effect.orElseSucceed(() => undefined),
        )
        const line = (lineAndCharacter?.line ?? 0) + 1
        const character = (lineAndCharacter?.character ?? 0) + 1
        location = `${fileName}(${line},${character}): `
      } else if (error.fileName !== undefined && error.fileName !== '') {
        const lineAndCharacter = yield* compiler.getLineAndCharacterOfPosition(error.fileName, error.pos).pipe(
          Effect.orElseSucceed(() => undefined),
        )
        const line = (lineAndCharacter?.line ?? 0) + 1
        const character = (lineAndCharacter?.character ?? 0) + 1
        location = `${error.fileName}(${line},${character}): `
      }
      return `${location}${severity} TS${error.code}: ${error.text}`
    })

  const createErrorText = (errors: readonly Diagnostic[]): Effect.Effect<string, never> =>
    Effect.gen(function*() {
      const parts = yield* Effect.forEach(errors, formatDiagnostic)
      return parts.join('\n')
    })

  return {
    init: Effect.gen(function*() {
      const errors = yield* compiler.init.pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: [],
              cause: errorToString(cause),
            }),
        ),
      )
      if (errors.length > 0) {
        const text = yield* createErrorText(errors)
        return yield* new CheckerFailed({
          checkerName: 'typescript',
          mutantIds: [],
          cause: errorToString(new Error(`Typescript error(s) found in dry run compilation: ${text}`)),
        })
      }
    }),

    check: (mutants) =>
      Effect.gen(function*() {
        const applyOnce = (group: readonly Mutant[]) =>
          Cell.run(checkCell, new CheckMutantsCommand({ mutants: [...group] })).pipe(
            Effect.provideService(TypeScriptCompiler, compiler),
          )
        const first = yield* applyOnce(mutants)
        let map = HashMap.empty<string, CheckResult>()
        const mergeResults = (results: CheckMutantsDecision['results']) => {
          for (const [id, value] of Object.entries(results)) {
            if (value.status === 'passed') {
              map = HashMap.set(map, id, { status: 'passed' })
            } else {
              map = HashMap.set(map, id, { status: 'compileError', reason: value.reason })
            }
          }
        }
        mergeResults(first.results)
        yield* Match.value(first).pipe(
          Match.tag('CheckFinished', () => Effect.void),
          Match.tag('RetestRequired', (retest) =>
            Effect.gen(function*() {
              yield* applyOnce([])
              const originals: Record<string, Mutant> = {}
              for (const m of mutants) {
                originals[m.id] = m
              }
              for (const pending of retest.needsRetest) {
                const original = originals[pending.id]
                if (original === undefined) {
                  continue
                }
                const one = yield* applyOnce([original])
                mergeResults(one.results)
              }
            })),
          Match.exhaustive,
        )
        return map
      }),

    group: (mutants) =>
      Effect.gen(function*() {
        const nodesHm = yield* compiler.nodes.pipe(
          Effect.mapError(
            (cause) =>
              new CheckerFailed({
                checkerName: 'typescript',
                mutantIds: mutants.map((m) => m.id),
                cause: errorToString(cause),
              }),
          ),
        )
        const nodes = nodesHm
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
