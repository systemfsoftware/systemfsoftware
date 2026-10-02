import { Chunk, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

import type { ExtractorError } from '../../errors/index.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstEntityRef } from '../graph/ast-entity.js'
import { requireEntityDraft } from './collect-lookups.js'
import {
  type CollectState,
  type EntityDraft,
  invariantDefect,
  type UniqueNamesApplied,
  withEntityView,
} from './collect-state.js'
import { singleExportNameOf } from './collector-entity.js'

const idealNameForEmitOf = (view: EntityDraft): string =>
  firstSegmentOf(
    Option.getOrElse(
      Option.filter(singleExportNameOf(view), (name) => name !== 'default'),
      () => view.localName,
    ),
  )

const firstSegmentOf = (name: string): string =>
  Match.value(name.includes('.')).pipe(
    Match.when(true, () => Option.getOrElse(Arr.head(name.split('.')), () => name)),
    Match.when(false, () => name),
    Match.exhaustive,
  )

const isTakenName = (candidate: string, usedNames: HashSet.HashSet<string>): boolean =>
  candidate === 'default' || HashSet.has(usedNames, candidate)

const isReservedName = (
  candidate: string,
  usedNames: HashSet.HashSet<string>,
  hasGlobalName: (name: string) => boolean,
): boolean => isTakenName(candidate, usedNames) || hasGlobalName(candidate)

const candidateNameOf = (ideal: string, suffix: number): string =>
  Match.value(suffix === 1).pipe(
    Match.when(true, () => ideal),
    Match.when(false, () => ideal.concat('_').concat(String(suffix))),
    Match.exhaustive,
  )

const uniqueNameOf = (
  ideal: string,
  suffix: number,
  usedNames: HashSet.HashSet<string>,
  hasGlobalName: (name: string) => boolean,
): string =>
  Match.value(isReservedName(candidateNameOf(ideal, suffix), usedNames, hasGlobalName)).pipe(
    Match.when(true, () => uniqueNameOf(ideal, suffix + 1, usedNames, hasGlobalName)),
    Match.when(false, () => candidateNameOf(ideal, suffix)),
    Match.exhaustive,
  )

const assignNameForEmit = (
  graph: AnalysisGraph,
  state: CollectState,
  usedNames: HashSet.HashSet<string>,
  entityRef: AstEntityRef,
): Effect.Effect<UniqueNamesApplied, ExtractorError> =>
  Effect.flatMap(requireEntityDraft(state, entityRef), (view) => {
    const hasGlobalName = (name: string): boolean => graph.globalVariableAnalyzer.hasGlobalName(name)
    const ideal = idealNameForEmitOf(view)
    const eligible = Match.value(Chunk.toReadonlyArray(view.exportedNames).includes(ideal)).pipe(
      Match.when(true, () => !hasGlobalName(ideal) && ideal !== 'default'),
      Match.when(false, () => false),
      Match.exhaustive,
    )
    return Match.value(eligible).pipe(
      Match.when(true, () => {
        const applied: UniqueNamesApplied = {
          state: withEntityView(state, entityRef, { ...view, nameForEmit: Option.some(ideal) }),
          usedNames,
        }
        return Effect.succeed(applied)
      }),
      Match.when(false, () => {
        const nameForEmit = uniqueNameOf(ideal, 1, usedNames, hasGlobalName)
        const applied: UniqueNamesApplied = {
          state: withEntityView(state, entityRef, { ...view, nameForEmit: Option.some(nameForEmit) }),
          usedNames: HashSet.add(usedNames, nameForEmit),
        }
        return Effect.succeed(applied)
      }),
      Match.exhaustive,
    )
  })

const collectExportName = (
  usedNames: HashSet.HashSet<string>,
  exportName: string,
): Effect.Effect<HashSet.HashSet<string>, ExtractorError> =>
  Match.value(HashSet.has(usedNames, exportName)).pipe(
    Match.when(true, () =>
      Effect.die(invariantDefect('A package cannot have two exports with the name "'.concat(exportName, '"')))),
    Match.when(false, () =>
      Effect.succeed(HashSet.add(usedNames, exportName))),
    Match.exhaustive,
  )

export const makeUniqueNames = dual<
  (state: CollectState) => (graph: AnalysisGraph) => Effect.Effect<CollectState, ExtractorError>,
  (graph: AnalysisGraph, state: CollectState) => Effect.Effect<CollectState, ExtractorError>
>(2, (graph: AnalysisGraph, state: CollectState): Effect.Effect<CollectState, ExtractorError> => {
  const zeroNames: Effect.Effect<HashSet.HashSet<string>, ExtractorError> = Effect.succeed(HashSet.empty())
  return Effect.flatMap(
    Arr.reduce(
      Chunk.toReadonlyArray(state.entities),
      zeroNames,
      (accumulated, entityRef) =>
        Effect.flatMap(accumulated, (usedNames) =>
          Effect.flatMap(requireEntityDraft(state, entityRef), (view) => {
            const zeroUsed: Effect.Effect<HashSet.HashSet<string>, ExtractorError> = Effect.succeed(usedNames)
            return Arr.reduce(
              Chunk.toReadonlyArray(view.exportedNames),
              zeroUsed,
              (accumulatedNames, exportName) =>
                Effect.flatMap(accumulatedNames, (current) => collectExportName(current, exportName)),
            )
          })),
    ),
    (usedNames) => {
      const zeroState: Effect.Effect<UniqueNamesApplied, ExtractorError> = Effect.succeed({ state, usedNames })
      return Effect.map(
        Arr.reduce(
          Chunk.toReadonlyArray(state.entities),
          zeroState,
          (accumulated, entityRef) =>
            Effect.flatMap(
              accumulated,
              (current) => assignNameForEmit(graph, current.state, current.usedNames, entityRef),
            ),
        ),
        (named) => named.state,
      )
    },
  )
})
