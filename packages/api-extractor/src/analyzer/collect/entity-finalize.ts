import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import * as ts from 'typescript'

import type { MessageLog } from '../../collector/message-log.js'
import type { ExtractorError } from '../../errors/index.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstEntityRef } from '../graph/ast-entity.js'
import { isExternalModule } from '../graph/ast-module.js'
import type { AstModuleExportInfo } from '../graph/ast-module.js'
import type { NodeId } from '../TypeScriptInternals.js'
import { requireEntityDraft } from './collect-lookups.js'
import { type CollectState, type EntityDraft, viewsOf } from './collect-state.js'
import { CollectorEntity, consumableOf, exportedOf, singleExportNameOf } from './collector-entity.js'

export const nonExternalSourceFilesOf = dual<
  (exportInfo: AstModuleExportInfo) => (graph: AnalysisGraph) => ReadonlyArray<ts.SourceFile>,
  (graph: AnalysisGraph, exportInfo: AstModuleExportInfo) => ReadonlyArray<ts.SourceFile>
>(2, (graph: AnalysisGraph, exportInfo: AstModuleExportInfo): ReadonlyArray<ts.SourceFile> => {
  const zero: { readonly files: ReadonlyArray<ts.SourceFile>; readonly seen: HashSet.HashSet<string> } = {
    files: [],
    seen: HashSet.empty(),
  }
  return Arr.reduce(
    Chunk.toReadonlyArray(exportInfo.visitedAstModules),
    zero,
    (accumulated, moduleSymbolId) =>
      Option.match(HashMap.get(graph.modules, moduleSymbolId), {
        onNone: () => accumulated,
        onSome: (astModule) =>
          Match.value(astModule.pipe(isExternalModule)).pipe(
            Match.when(true, () => accumulated),
            Match.when(false, () =>
              Option.match(HashMap.get(graph.declarationValues, astModule.sourceFileId), {
                onNone: () => accumulated,
                onSome: (node) =>
                  Option.match(Option.filter(Option.some(node), ts.isSourceFile), {
                    onNone: () => accumulated,
                    onSome: (sourceFile) =>
                      Match.value(HashSet.has(accumulated.seen, sourceFile.fileName)).pipe(
                        Match.when(true, () => accumulated),
                        Match.when(false, () => ({
                          files: [...accumulated.files, sourceFile],
                          seen: HashSet.add(accumulated.seen, sourceFile.fileName),
                        })),
                        Match.exhaustive,
                      ),
                  }),
              })),
            Match.exhaustive,
          ),
      }),
  ).files
})

export const sortStrings = (values: HashSet.HashSet<string>): Chunk.Chunk<string> =>
  Chunk.fromIterable(Arr.sort(Chunk.toReadonlyArray(Chunk.fromIterable(values)), Order.String))

const symbolInlineExportOf = (view: EntityDraft): boolean =>
  Option.match(singleExportNameOf(view), {
    onNone: () => false,
    onSome: (singleExportName) =>
      Match.value(singleExportName === 'default').pipe(
        Match.when(true, () => false),
        Match.when(false, () =>
          Option.match(view.nameForEmit, {
            onNone: () => true,
            onSome: (nameForEmit) => nameForEmit === singleExportName,
          })),
        Match.exhaustive,
      ),
  })

const shouldInlineExportOf = (
  graph: AnalysisGraph,
  view: EntityDraft,
  entityRef: AstEntityRef,
): boolean =>
  Match.value(entityRef).pipe(
    Match.tag('AstSymbolRef', () => symbolInlineExportOf(view)),
    Match.tag('AstImportRef', () => false),
    Match.tag('AstNamespaceImportRef', (namespaceRef) =>
      Option.getOrElse(
        Option.map(HashMap.get(graph.namespaceImports, namespaceRef.symbolId), (record) => record.isExport),
        () => false,
      )),
    Match.exhaustive,
  )

export const finalizeEntity = dual<
  (
    state: CollectState,
    entityRef: AstEntityRef,
  ) => (graph: AnalysisGraph) => Effect.Effect<CollectorEntity, ExtractorError>,
  (
    graph: AnalysisGraph,
    state: CollectState,
    entityRef: AstEntityRef,
  ) => Effect.Effect<CollectorEntity, ExtractorError>
>(3, (
  graph: AnalysisGraph,
  state: CollectState,
  entityRef: AstEntityRef,
): Effect.Effect<CollectorEntity, ExtractorError> =>
  Effect.map(requireEntityDraft(state, entityRef), (view) =>
    new CollectorEntity({
      astEntity: entityRef,
      localName: view.localName,
      nameForEmit: view.nameForEmit,
      exportedNames: view.exportedNames,
      localExportNamesByParent: view.localExportNamesByParent,
      exported: exportedOf(view),
      consumable: consumableOf(viewsOf(state), entityRef),
      shouldInlineExport: shouldInlineExportOf(graph, view, entityRef),
    })))

const offsetAssociations = (
  log: MessageLog,
  offset: number,
): HashMap.HashMap<NodeId, Chunk.Chunk<number>> =>
  HashMap.fromIterable(
    Arr.map(
      Chunk.toReadonlyArray(Chunk.fromIterable(log.associationByDeclaration)),
      (entry): readonly [NodeId, Chunk.Chunk<number>] => [
        entry[0],
        Chunk.map(entry[1], (index) => index + offset),
      ],
    ),
  )

const mergeAssociations = (
  maps: ReadonlyArray<HashMap.HashMap<NodeId, Chunk.Chunk<number>>>,
): HashMap.HashMap<NodeId, Chunk.Chunk<number>> =>
  Arr.reduce(maps, HashMap.empty<NodeId, Chunk.Chunk<number>>(), (accumulated, map) =>
    Arr.reduce(
      Chunk.toReadonlyArray(Chunk.fromIterable(map)),
      accumulated,
      (inner, entry) =>
        HashMap.modifyAt(inner, entry[0], (existingOption) =>
          Option.match(existingOption, {
            onNone: () => Option.some(entry[1]),
            onSome: (existing) => Option.some(Chunk.appendAll(existing, entry[1])),
          })),
    ))

export const concatLogs = dual<
  (second: MessageLog, third: MessageLog) => (first: MessageLog) => MessageLog,
  (first: MessageLog, second: MessageLog, third: MessageLog) => MessageLog
>(3, (first: MessageLog, second: MessageLog, third: MessageLog): MessageLog => ({
  diagnostics: first.diagnostics,
  messages: Chunk.appendAll(Chunk.appendAll(first.messages, second.messages), third.messages),
  associationByDeclaration: mergeAssociations([
    offsetAssociations(first, 0),
    offsetAssociations(second, Chunk.size(first.messages)),
    offsetAssociations(third, Chunk.size(first.messages) + Chunk.size(second.messages)),
  ]),
  handled: HashSet.empty(),
}))
