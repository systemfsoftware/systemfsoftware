import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import { type ExtractorMessageProperties, MessageLog } from '../../collector/message-log.js'
import { astDeclarationOfId, nodeValueOf } from '../graph/analysis-graph.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import type { AstEntityRef } from '../graph/ast-entity.js'
import type { AstModuleExportInfo } from '../graph/ast-module.js'
import type { AstNamespaceImport } from '../graph/ast-namespace-import.js'
import { resolveDeclarationReference } from '../graph/ast-reference-resolver.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { ApiItemMetadata } from './api-item-metadata.js'
import type { CollectedAnalysis } from './collect-analysis.js'
import type { CollectorEntity } from './collector-entity.js'
import type { DeclarationMetadata } from './declaration-metadata.js'
import type { SymbolMetadata } from './symbol-metadata.js'

export const symbolOf = (graph: AnalysisGraph, symbolId: SymbolId): Option.Option<AstSymbol> =>
  HashMap.get(graph.symbols, symbolId)

export const declarationOf = (graph: AnalysisGraph, declarationId: NodeId): Option.Option<AstDeclaration> =>
  astDeclarationOfId(graph, declarationId)

export const nodeOf = (graph: AnalysisGraph, declarationId: NodeId): Option.Option<ts.Node> =>
  nodeValueOf(graph, declarationId)

export const nodeKindOf = (graph: AnalysisGraph, declarationId: NodeId): Option.Option<ts.SyntaxKind> =>
  Option.map(nodeOf(graph, declarationId), (node) => node.kind)

export const childrenOf = (graph: AnalysisGraph, declarationId: NodeId): Chunk.Chunk<NodeId> =>
  Option.getOrElse(HashMap.get(graph.childrenByDeclaration, declarationId), () => Chunk.empty())

export const referencedEntitiesOf = (graph: AnalysisGraph, declarationId: NodeId): Chunk.Chunk<AstEntityRef> =>
  Option.getOrElse(HashMap.get(graph.referencedByDeclaration, declarationId), () => Chunk.empty())

export const namespaceImportOf = (
  graph: AnalysisGraph,
  symbolId: SymbolId,
): Option.Option<AstNamespaceImport> => HashMap.get(graph.namespaceImports, symbolId)

export const moduleExportInfoOf = (
  graph: AnalysisGraph,
  moduleSymbolId: SymbolId,
): Option.Option<AstModuleExportInfo> => HashMap.get(graph.moduleExportInfo, moduleSymbolId)

export const symbolMetadataOf = (
  collected: CollectedAnalysis,
  symbolId: SymbolId,
): Option.Option<SymbolMetadata> => HashMap.get(collected.symbolMetadata, symbolId)

export const apiItemMetadataOf = (
  collected: CollectedAnalysis,
  declarationId: NodeId,
): Option.Option<ApiItemMetadata> => HashMap.get(collected.apiItemMetadata, declarationId)

export const declarationMetadataOf = (
  collected: CollectedAnalysis,
  declarationId: NodeId,
): Option.Option<DeclarationMetadata> => HashMap.get(collected.declarationMetadata, declarationId)

export const entityOfRef = (
  collected: CollectedAnalysis,
  entityRef: AstEntityRef,
): Option.Option<CollectorEntity> => HashMap.get(collected.entityByRef, entityRef)

export const entityOfSymbolId = (
  collected: CollectedAnalysis,
  symbolId: SymbolId,
): Option.Option<CollectorEntity> => HashMap.get(collected.entityBySymbolId, symbolId)

export const isAncillaryOf = (collected: CollectedAnalysis, declarationId: NodeId): boolean =>
  Option.getOrElse(
    Option.map(declarationMetadataOf(collected, declarationId), (metadata) => metadata.isAncillary),
    () => false,
  )

export const localNameOfSymbolId = (graph: AnalysisGraph, symbolId: SymbolId): string =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.localName),
    () => '',
  )

export const localNameOfDeclarationId = (graph: AnalysisGraph, declarationId: NodeId): string =>
  Option.getOrElse(
    Option.map(declarationOf(graph, declarationId), (astDeclaration) =>
      localNameOfSymbolId(graph, astDeclaration.astSymbolId)),
    () =>
      '',
  )

export const localNameOfRef = (graph: AnalysisGraph, entityRef: AstEntityRef): Option.Option<string> =>
  Match.value(entityRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => Option.map(symbolOf(graph, symbolRef.symbolId), (s) => s.localName)),
    Match.tag('AstImportRef', (importRef) => Option.map(HashMap.get(graph.imports, importRef.key), (i) => i.localName)),
    Match.tag(
      'AstNamespaceImportRef',
      (namespaceRef) => Option.map(namespaceImportOf(graph, namespaceRef.symbolId), (record) => record.localName),
    ),
    Match.exhaustive,
  )

export const isExternalSymbol = (graph: AnalysisGraph, symbolId: SymbolId): boolean =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.isExternal),
    () => false,
  )

export const parentSymbolIdOf = (graph: AnalysisGraph, symbolId: SymbolId): Option.Option<SymbolId> =>
  Option.flatMap(symbolOf(graph, symbolId), (astSymbol) => astSymbol.parentAstSymbolId)

export const rootSymbolIdOf = (graph: AnalysisGraph, symbolId: SymbolId): SymbolId =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.rootAstSymbolId),
    () => symbolId,
  )

export const declarationIdsOfSymbol = (graph: AnalysisGraph, symbolId: SymbolId): Chunk.Chunk<NodeId> =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.declarationIds),
    () => Chunk.empty(),
  )

export const declarationsOfIds = (
  graph: AnalysisGraph,
  declarationIds: Chunk.Chunk<NodeId>,
): Chunk.Chunk<AstDeclaration> =>
  Chunk.fromIterable(
    Arr.filterMap(Chunk.toReadonlyArray(declarationIds), (declarationId) =>
      Result.fromOption(declarationOf(graph, declarationId), () => undefined)),
  )

export const declarationsPreOrder = (
  graph: AnalysisGraph,
  declarationIds: Chunk.Chunk<NodeId>,
): Chunk.Chunk<AstDeclaration> =>
  Arr.reduce(
    Chunk.toReadonlyArray(declarationIds),
    Chunk.empty<AstDeclaration>(),
    (accumulated, declarationId) => Chunk.appendAll(accumulated, declarationPreOrder(graph, declarationId)),
  )

const declarationPreOrder = (graph: AnalysisGraph, declarationId: NodeId): Chunk.Chunk<AstDeclaration> =>
  Option.match(declarationOf(graph, declarationId), {
    onNone: () => Chunk.empty(),
    onSome: (astDeclaration) =>
      Chunk.appendAll(Chunk.of(astDeclaration), declarationChildrenPreOrder(graph, declarationId)),
  })

const declarationChildrenPreOrder = (graph: AnalysisGraph, declarationId: NodeId): Chunk.Chunk<AstDeclaration> =>
  Arr.reduce(
    Chunk.toReadonlyArray(childrenOf(graph, declarationId)),
    Chunk.empty<AstDeclaration>(),
    (accumulated, childId) => Chunk.appendAll(accumulated, declarationPreOrder(graph, childId)),
  )

export const updateApiItemMetadata = (
  collected: CollectedAnalysis,
  declarationId: NodeId,
  update: (metadata: ApiItemMetadata) => ApiItemMetadata,
): CollectedAnalysis =>
  Option.match(HashMap.get(collected.apiItemMetadata, declarationId), {
    onNone: () => collected,
    onSome: (current) => {
      const updated = update(current)
      return {
        ...collected,
        apiItemMetadata: HashMap.map(collected.apiItemMetadata, (value) =>
          Match.value(Object.is(value, current)).pipe(
            Match.when(true, () => updated),
            Match.when(false, () => value),
            Match.exhaustive,
          )),
      }
    },
  })

export const issueForDeclaration = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  declarationId: NodeId,
  properties?: ExtractorMessageProperties,
): CollectedAnalysis =>
  Option.match(nodeOf(graph, declarationId), {
    onNone: () => collected,
    onSome: (node) => ({
      ...collected,
      messageLog: MessageLog.addAnalyzerIssue(
        collected.messageLog,
        messageId,
        messageText,
        node.getSourceFile(),
        node.getStart(),
        Option.some(declarationId),
        properties,
      ),
    }),
  })

export const issueForSymbol = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  symbolId: SymbolId,
  properties?: ExtractorMessageProperties,
): CollectedAnalysis =>
  Option.match(Arr.head(Chunk.toReadonlyArray(declarationIdsOfSymbol(graph, symbolId))), {
    onNone: () => collected,
    onSome: (declarationId) => issueForDeclaration(collected, graph, messageId, messageText, declarationId, properties),
  })

export const resolveReferenceIn = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationReference: tsdoc.DocDeclarationReference,
): Result.Result<AstDeclaration, string> =>
  resolveDeclarationReference(
    graph,
    { isAncillary: (declarationId) => isAncillaryOf(collected, declarationId) },
    declarationReference,
  )

export const workingPackageNameOf = (graph: AnalysisGraph): string =>
  Option.getOrElse(Option.map(graph.workingPackage, (workingPackage) => workingPackage.name), () => '')

export const includeForgottenExports = (graph: AnalysisGraph): boolean =>
  Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.apiReport.includeForgottenExports), () => false) ||
  Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.docModel.includeForgottenExports), () => false)

export const isWarned = (warned: HashSet.HashSet<AstEntityRef>, entityRef: AstEntityRef): boolean =>
  HashSet.has(warned, entityRef)
