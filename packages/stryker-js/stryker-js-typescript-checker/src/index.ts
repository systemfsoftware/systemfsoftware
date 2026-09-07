import rawSchemaJson from '../schema/typescript-checker-options.json' with { type: 'json' }

import { Cell } from '@systemfsoftware/effect-cell-types'
import { Checker, CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { declarePlugin, PluginBuildError, RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { Result } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as S from 'effect/Schema'
import type { Diagnostic } from 'typescript/unstable/sync'

import type { CheckMutantsDecision } from './check-mutants.workflow.js'
import { checkCell } from './Checker.js'
import { CheckMutantsCommand, TypeScriptCheckerSection } from './Checker.schema.js'
import type { TSFileNode } from './Compiler.js'
import { createGroups, makeHybridFileSystem, makeTypescriptCompiler, TypeScriptCompiler } from './Compiler.js'

const getPrioritize = (options: StrykerOptions): boolean => {
  const section = Result.match(S.decodeUnknownResult(TypeScriptCheckerSection)(options['typescriptChecker'] ?? {}), {
    onFailure: () => ({ prioritizePerformanceOverAccuracy: undefined }),
    onSuccess: (decoded) => decoded,
  })
  return section.prioritizePerformanceOverAccuracy ?? false
}

const normalizeFileName = (fileName: string): string => fileName.replace(/\\/g, '/')

const partitionMutantsForGrouping = (
  mutants: readonly Mutant[],
  nodes: MutableHashMap.MutableHashMap<string, TSFileNode>,
  prioritizePerformanceOverAccuracy: boolean,
): { inside: readonly Mutant[]; outside: readonly Mutant[] } => {
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

const CheckerLive = Layer.effect(
  Checker,
  Effect.gen(function*() {
    const options = yield* RunConfiguration
    const fsService = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const fs = yield* makeHybridFileSystem(fsService)
    const compiler = makeTypescriptCompiler(options, fs, fsService, pathService)

    const formatDiagnostic = (error: Diagnostic): Effect.Effect<string> =>
      Effect.gen(function*() {
        const lineAndCharacter = yield* compiler
          .getLineAndCharacterOfPosition(error.fileName ?? '', error.pos)
          .pipe(Effect.orElseSucceed(() => undefined))
        const line = (lineAndCharacter?.line ?? 0) + 1
        const character = (lineAndCharacter?.character ?? 0) + 1
        const fileName = error.fileName ?? ''
        let location = ''
        if (fileName !== '') {
          location = `${fileName}(${line},${character}): `
        }
        return `${location}${error.code}: ${error.text}`
      })

    const errors = yield* compiler.init.pipe(
      Effect.mapError((cause) => new PluginBuildError({ name: 'typescript', cause })),
    )
    if (errors.length > 0) {
      const parts = yield* Effect.forEach(errors, formatDiagnostic)
      return yield* new PluginBuildError({
        name: 'typescript',
        cause: new Error(`Typescript error(s) found in dry run compilation: ${parts.join('\n')}`),
      })
    }

    const checkOnce = Cell.provide(checkCell, Layer.succeed(TypeScriptCompiler, compiler))

    const check = (mutants: readonly Mutant[]) =>
      Effect.gen(function*() {
        const applyOnce = (group: readonly Mutant[]) =>
          Cell.run(checkOnce, new CheckMutantsCommand({ mutants: [...group] }))
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
      })

    const group = (mutants: readonly Mutant[]) =>
      Effect.gen(function*() {
        const nodes = yield* compiler.nodes.pipe(
          Effect.mapError(
            (cause) =>
              new CheckerFailed({
                checkerName: 'typescript',
                mutantIds: mutants.map((m) => m.id),
                cause: errorToString(cause),
              }),
          ),
        )
        const { inside, outside } = partitionMutantsForGrouping(mutants, nodes, getPrioritize(options))
        if (inside.length === 0) {
          return mutants.map((m) => [m.id])
        }
        const groups = createGroups([...inside], nodes)
        if (outside.length > 0) {
          const outsideGroup = outside.map((m) => m.id)
          return [outsideGroup, ...groups]
        }
        return groups
      })

    return Checker.of({ check, group })
  }),
)

export const strykerPlugins = [declarePlugin('Checker', 'typescript', CheckerLive)]

const rawSchema: unknown = rawSchemaJson
if (!S.is(S.Record(S.String, S.Unknown))(rawSchema)) {
  throw new Error('Invalid typescript-checker schema file')
}
export const strykerValidationSchema: Record<string, unknown> = rawSchema
