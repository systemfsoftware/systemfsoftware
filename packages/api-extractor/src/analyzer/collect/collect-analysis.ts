import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'

import { MessageLog } from '../../collector/message-log.js'
import type { ExtractorError } from '../../errors/index.js'
import type { AnalysisGraph, AnalysisRef } from '../graph/analysis-graph.js'
import type { GraphAnalysis } from '../graph/analyze-graph.js'
import type { AstEntityRef } from '../graph/ast-entity.js'
import type { AstModuleExportInfo } from '../graph/ast-module.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { fetchSymbolMetadataInto } from './api-item-metadata-phase.js'
import type { ApiItemMetadata } from './api-item-metadata.js'
import { type CollectState, entitySymbolIdOf, type WalkState } from './collect-state.js'
import type { CollectorEntity } from './collector-entity.js'
import { CollectorEntityOrder } from './collector-entity.js'
import type { DeclarationMetadata } from './declaration-metadata.js'
import { concatLogs, finalizeEntity, nonExternalSourceFilesOf, sortStrings } from './entity-finalize.js'
import { collectFromSourceFiles, createCollectorEntity, enterEntity } from './entity-walk.js'
import { findPackageDocComment, PackageDocComment } from './package-doc-comment.js'
import type { SymbolMetadata } from './symbol-metadata.js'
import { makeUniqueNames } from './unique-names-phase.js'

export interface CollectedAnalysis {
  readonly entities: Chunk.Chunk<CollectorEntity>
  readonly entityByRef: HashMap.HashMap<AstEntityRef, CollectorEntity>
  readonly entityBySymbolId: HashMap.HashMap<SymbolId, CollectorEntity>
  readonly dtsTypeReferenceDirectives: Chunk.Chunk<string>
  readonly dtsLibReferenceDirectives: Chunk.Chunk<string>
  readonly starExportedExternalModulePaths: ReadonlyArray<string>
  readonly packageDocComment: Option.Option<PackageDocComment>
  readonly symbolMetadata: HashMap.HashMap<SymbolId, SymbolMetadata>
  readonly declarationMetadata: HashMap.HashMap<NodeId, DeclarationMetadata>
  readonly apiItemMetadata: HashMap.HashMap<NodeId, ApiItemMetadata>
  readonly messageLog: MessageLog
}

const topLevelEntityPhase = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  walk: WalkState,
  graph: AnalysisGraph,
  exportInfo: AstModuleExportInfo,
): Effect.Effect<WalkState, ExtractorError> => {
  const zero: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(walk)
  return Effect.flatMap(
    Arr.reduce(
      Chunk.toReadonlyArray(exportInfo.exportedLocalEntities),
      zero,
      (accumulated, entry) =>
        Effect.gen(function*() {
          const current = yield* accumulated
          const nextState = yield* createCollectorEntity(
            ref,
            current.state,
            entry[1],
            Option.some(entry[0]),
            Option.none(),
          )
          const seeded: WalkState = { ...current, state: nextState }
          return seeded
        }),
    ),
    (afterCreation) => {
      const zeroAfter: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(afterCreation)
      return Arr.reduce(
        Chunk.toReadonlyArray(exportInfo.exportedLocalEntities),
        zeroAfter,
        (accumulated, entry) =>
          Effect.gen(function*() {
            const current = yield* accumulated
            const walked = yield* enterEntity(ref, parser, current, entry[1])
            return yield* Match.value(entry[1]).pipe(
              Match.tag('AstSymbolRef', (symbolRef): Effect.Effect<WalkState, ExtractorError> =>
                Effect.map(
                  fetchSymbolMetadataInto(ref, parser, walked.state, symbolRef.symbolId),
                  (nextState) => ({ ...walked, state: nextState }),
                )),
              Match.orElse(() => Effect.succeed(walked)),
            )
          }),
      )
    },
  )
}

const packageDocPhase = (
  graph: AnalysisGraph,
): readonly [MessageLog, Option.Option<PackageDocComment>] =>
  Option.match(graph.workingPackage, {
    onNone: () => [MessageLog.make({ diagnostics: graph.messageLog.diagnostics }), Option.none()],
    onSome: (workingPackage) => {
      const baseLog = MessageLog.make({ diagnostics: graph.messageLog.diagnostics })
      const found = findPackageDocComment(workingPackage.entryPointSourceFile, baseLog)
      return [
        found[0],
        Option.map(found[1], (textRange) => {
          const parser = new tsdoc.TSDocParser(graph.tsdocConfiguration)
          const parserContext = parser.parseRange(
            tsdoc.TextRange.fromStringRange(workingPackage.entryPointSourceFile.text, textRange.pos, textRange.end),
          )
          return new PackageDocComment({ parserContext, docComment: parserContext.docComment })
        }),
      ]
    },
  })

export const collectAnalysis = (
  graphAnalysis: GraphAnalysis,
): Effect.Effect<CollectedAnalysis, ExtractorError> =>
  Effect.flatMap(Ref.get(graphAnalysis.ref), (graph) =>
    Effect.gen(function*() {
      const [packageDocLog, packageDocComment] = packageDocPhase(graph)
      const parser = new tsdoc.TSDocParser(graph.tsdocConfiguration)
      const emptyState: CollectState = {
        log: MessageLog.make({ diagnostics: graph.messageLog.diagnostics }),
        entityByRef: HashMap.empty(),
        entities: Chunk.empty(),
        entityBySymbolId: HashMap.empty(),
        dtsTypeReferenceDirectives: HashSet.empty(),
        dtsLibReferenceDirectives: HashSet.empty(),
        symbolMetadataDone: HashSet.empty(),
        symbolMetadata: HashMap.empty(),
        declarationMetadata: HashMap.empty(),
        apiItemMetadata: HashMap.empty(),
      }
      const walked = yield* topLevelEntityPhase(
        graphAnalysis.ref,
        parser,
        { state: emptyState, seen: HashSet.empty() },
        graph,
        graphAnalysis.exportInfo,
      )
      const directivesState = collectFromSourceFiles(
        walked.state,
        nonExternalSourceFilesOf(graph, graphAnalysis.exportInfo),
        true,
      )
      const namedState = yield* makeUniqueNames(graph, directivesState)
      const finalGraph = yield* Ref.get(graphAnalysis.ref)
      const zeroRecords: Effect.Effect<ReadonlyArray<CollectorEntity>, ExtractorError> = Effect.succeed([])
      const entityRecords = yield* Arr.reduce(
        Chunk.toReadonlyArray(namedState.entities),
        zeroRecords,
        (accumulated, entityRef) =>
          Effect.flatMap(accumulated, (current) =>
            Effect.map(finalizeEntity(finalGraph, namedState, entityRef), (record) => [...current, record])),
      )
      const sortedEntities = Arr.sort(entityRecords, CollectorEntityOrder)
      const entityByRef = Arr.reduce(
        sortedEntities,
        HashMap.empty<AstEntityRef, CollectorEntity>(),
        (map, record) =>
          HashMap.set(map, record.astEntity, record),
      )
      const entityBySymbolId = Arr.reduce(
        sortedEntities,
        HashMap.empty<SymbolId, CollectorEntity>(),
        (map, record) =>
          Option.match(entitySymbolIdOf(record.astEntity), {
            onSome: (symbolId) => HashMap.set(map, symbolId, record),
            onNone: () => map,
          }),
      )
      return {
        entities: Chunk.fromIterable(sortedEntities),
        entityByRef,
        entityBySymbolId,
        dtsTypeReferenceDirectives: sortStrings(namedState.dtsTypeReferenceDirectives),
        dtsLibReferenceDirectives: sortStrings(namedState.dtsLibReferenceDirectives),
        starExportedExternalModulePaths: graphAnalysis.starExportedExternalModulePaths,
        packageDocComment,
        symbolMetadata: namedState.symbolMetadata,
        declarationMetadata: namedState.declarationMetadata,
        apiItemMetadata: namedState.apiItemMetadata,
        messageLog: concatLogs(packageDocLog, finalGraph.messageLog, namedState.log),
      }
    }))
