/**
 * Checker — capability that validates mutants against the TypeScript compiler.
 *
 * Bridges the checker plugin protocol (`@systemfsoftware/stryker-js/Checker`)
 * to the compiler service and the pure `checkMutants` workflow. Diagnostics
 * are classified without I/O; the file graph is sourced from the compiler.
 */
import { EOL } from 'os'

import { Cell } from '@systemfsoftware/effect-cell-types'
import { Checker } from '@systemfsoftware/stryker-js/Checker'
import { CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { Predicate, Result } from 'effect'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import { DiagnosticCategory } from 'typescript/unstable/sync'
import type { Diagnostic } from 'typescript/unstable/sync'
import { CheckMutantsCommand } from './Checker.schema.js'
import {
  checkMutants,
  CheckMutantsInput,
  DiagnosticInUnrelatedFileError,
  DiagnosticWithoutFileError,
} from './Checker.workflow.js'
import type { TSFileNode } from './Compiler.js'
import { createGroups } from './Compiler.js'
import type { TypeScriptCompiler } from './Compiler.js'

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

// ── diagnostics classification (pure) ────────────────────────────────────

export interface Classification {
  readonly definitive: MutableHashMap.MutableHashMap<string, readonly Diagnostic[]>
  readonly needsRetest: readonly Mutant[]
}

type ClassifyError = DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError

/**
 * Pure decision: given diagnostics and the file graph, decide which mutants
 * are definitely responsible and which need an individual re-check.
 */
export function classifyDiagnostics(
  diagnostics: readonly Diagnostic[],
  mutants: readonly Mutant[],
  nodes: ReadonlyMap<string, TSFileNode>,
): Result.Result<Classification, ClassifyError> {
  const definitive = MutableHashMap.empty<string, Diagnostic[]>()
  const needsRetest = MutableHashMap.empty<string, Mutant>()
  if (diagnostics.length > 0 && mutants.length === 1) {
    const only = mutants[0]
    if (only !== undefined) {
      MutableHashMap.set(definitive, only.id, [...diagnostics])
      return Result.succeed({ definitive, needsRetest: [] })
    }
  }

  for (const diagnostic of diagnostics) {
    const text = diagnostic.text
    let fileName: string | undefined
    if (Predicate.hasProperty(diagnostic, 'fileName')) {
      const candidate = diagnostic.fileName
      if (typeof candidate === 'string') {
        fileName = candidate
      }
    }
    if (fileName === undefined || fileName === '') {
      return Result.fail(new DiagnosticWithoutFileError({ text }))
    }
    const normalized = normalizeFileName(fileName)
    const node = nodes.get(normalized) ?? nodes.get(fileName)
    if (node === undefined) {
      return Result.fail(new DiagnosticInUnrelatedFileError({ text, fileName }))
    }
    const related = getMutantsWithReferenceToChildrenOrSelf(node, [...mutants])
    if (related.length === 0) {
      for (const m of mutants) {
        MutableHashMap.set(needsRetest, m.id, m)
      }
    } else if (related.length === 1) {
      const only = related[0]
      if (only !== undefined) {
        const existing = MutableHashMap.get(definitive, only.id)
        if (Option.isSome(existing)) {
          existing.value.push(diagnostic)
        } else {
          MutableHashMap.set(definitive, only.id, [diagnostic])
        }
      }
    } else {
      for (const m of related) {
        MutableHashMap.set(needsRetest, m.id, m)
      }
    }
  }

  const filteredRetest = [...MutableHashMap.values(needsRetest)].filter((m) => !MutableHashMap.has(definitive, m.id))
  return Result.succeed({ definitive, needsRetest: filteredRetest })
}

function getMutantsWithReferenceToChildrenOrSelf(
  node: TSFileNode,
  mutants: Mutant[],
  nodesChecked: string[] = [],
): Mutant[] {
  if (nodesChecked.includes(node.fileName)) {
    return []
  }
  nodesChecked.push(node.fileName)
  const relatedMutants = mutants.filter((m) => normalizeFileName(m.fileName) === node.fileName)
  const childResult = node.children.flatMap((c) => getMutantsWithReferenceToChildrenOrSelf(c, mutants, nodesChecked))
  return [...relatedMutants, ...childResult]
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

interface CheckPhases extends Cell.Phases {
  readonly command: CheckMutantsCommand
  readonly raw: CheckMutantsInput
  readonly decoded: CheckMutantsInput
  readonly decision: Readonly<
    Record<string, { readonly status: 'passed' } | { readonly status: 'compileError'; readonly reason: string }>
  >
  readonly decisionError: DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError
  readonly output: Result.Result<
    Readonly<
      Record<string, { readonly status: 'passed' } | { readonly status: 'compileError'; readonly reason: string }>
    >,
    DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError
  >
  readonly response: HashMap.HashMap<string, CheckResult>
  readonly decodeError: never
  readonly readError: CheckerFailed
  readonly writeError: CheckerFailed
}

const makeCheckDescription = (compiler: TypeScriptCompiler['Service']): Cell.WriteDone<CheckPhases> =>
  pipe(
    Cell.read<CheckPhases>((command) =>
      Effect.gen(function*() {
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
      })
    ),
    Cell.decode<CheckPhases>((raw) => Result.succeed(raw)),
    Cell.decide<CheckPhases>(checkMutants),
    Cell.encode<CheckPhases>((outcome) => outcome),
    Cell.write<CheckPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: (failure) =>
          Effect.fail(
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: [],
              cause: errorToString(failure),
            }),
          ),
        onSuccess: (record) => {
          let map = HashMap.empty<string, CheckResult>()
          for (const [id, value] of Object.entries(record)) {
            if (value.status === 'passed') {
              map = HashMap.set(map, id, { status: 'passed' })
            } else {
              map = HashMap.set(map, id, { status: 'compileError', reason: value.reason })
            }
          }
          return Effect.succeed(map)
        },
      })
    ),
  )

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
      return parts.join(EOL)
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
        const command = new CheckMutantsCommand({ mutants: [...mutants] })
        const description = makeCheckDescription(compiler)
        return yield* Cell.apply(description, command)
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
