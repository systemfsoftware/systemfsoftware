import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
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

export const symbolOf = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => Option.Option<AstSymbol>,
  (graph: AnalysisGraph, symbolId: SymbolId) => Option.Option<AstSymbol>
>(2, (graph: AnalysisGraph, symbolId: SymbolId): Option.Option<AstSymbol> => HashMap.get(graph.symbols, symbolId))

export const declarationOf = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => Option.Option<AstDeclaration>,
  (graph: AnalysisGraph, declarationId: NodeId) => Option.Option<AstDeclaration>
>(
  2,
  (graph: AnalysisGraph, declarationId: NodeId): Option.Option<AstDeclaration> =>
    astDeclarationOfId(graph, declarationId),
)

export const nodeOf = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => Option.Option<ts.Node>,
  (graph: AnalysisGraph, declarationId: NodeId) => Option.Option<ts.Node>
>(2, (graph: AnalysisGraph, declarationId: NodeId): Option.Option<ts.Node> => nodeValueOf(graph, declarationId))

export const nodeKindOf = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => Option.Option<ts.SyntaxKind>,
  (graph: AnalysisGraph, declarationId: NodeId) => Option.Option<ts.SyntaxKind>
>(
  2,
  (graph: AnalysisGraph, declarationId: NodeId): Option.Option<ts.SyntaxKind> =>
    Option.map(nodeOf(graph, declarationId), (node) => node.kind),
)

export const childrenOf = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => Chunk.Chunk<NodeId>,
  (graph: AnalysisGraph, declarationId: NodeId) => Chunk.Chunk<NodeId>
>(
  2,
  (graph: AnalysisGraph, declarationId: NodeId): Chunk.Chunk<NodeId> =>
    Option.getOrElse(HashMap.get(graph.childrenByDeclaration, declarationId), () => Chunk.empty()),
)

export const referencedEntitiesOf = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => Chunk.Chunk<AstEntityRef>,
  (graph: AnalysisGraph, declarationId: NodeId) => Chunk.Chunk<AstEntityRef>
>(
  2,
  (graph: AnalysisGraph, declarationId: NodeId): Chunk.Chunk<AstEntityRef> =>
    Option.getOrElse(HashMap.get(graph.referencedByDeclaration, declarationId), () => Chunk.empty()),
)

export const namespaceImportOf = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => Option.Option<AstNamespaceImport>,
  (graph: AnalysisGraph, symbolId: SymbolId) => Option.Option<AstNamespaceImport>
>(2, (
  graph: AnalysisGraph,
  symbolId: SymbolId,
): Option.Option<AstNamespaceImport> => HashMap.get(graph.namespaceImports, symbolId))

export const moduleExportInfoOf = dual<
  (moduleSymbolId: SymbolId) => (graph: AnalysisGraph) => Option.Option<AstModuleExportInfo>,
  (graph: AnalysisGraph, moduleSymbolId: SymbolId) => Option.Option<AstModuleExportInfo>
>(2, (
  graph: AnalysisGraph,
  moduleSymbolId: SymbolId,
): Option.Option<AstModuleExportInfo> => HashMap.get(graph.moduleExportInfo, moduleSymbolId))

export const symbolMetadataOf = dual<
  (symbolId: SymbolId) => (collected: CollectedAnalysis) => Option.Option<SymbolMetadata>,
  (collected: CollectedAnalysis, symbolId: SymbolId) => Option.Option<SymbolMetadata>
>(2, (
  collected: CollectedAnalysis,
  symbolId: SymbolId,
): Option.Option<SymbolMetadata> => HashMap.get(collected.symbolMetadata, symbolId))

export const apiItemMetadataOf = dual<
  (declarationId: NodeId) => (collected: CollectedAnalysis) => Option.Option<ApiItemMetadata>,
  (collected: CollectedAnalysis, declarationId: NodeId) => Option.Option<ApiItemMetadata>
>(2, (
  collected: CollectedAnalysis,
  declarationId: NodeId,
): Option.Option<ApiItemMetadata> => HashMap.get(collected.apiItemMetadata, declarationId))

export const declarationMetadataOf = dual<
  (declarationId: NodeId) => (collected: CollectedAnalysis) => Option.Option<DeclarationMetadata>,
  (collected: CollectedAnalysis, declarationId: NodeId) => Option.Option<DeclarationMetadata>
>(2, (
  collected: CollectedAnalysis,
  declarationId: NodeId,
): Option.Option<DeclarationMetadata> => HashMap.get(collected.declarationMetadata, declarationId))

export const entityOfRef = dual<
  (entityRef: AstEntityRef) => (collected: CollectedAnalysis) => Option.Option<CollectorEntity>,
  (collected: CollectedAnalysis, entityRef: AstEntityRef) => Option.Option<CollectorEntity>
>(2, (
  collected: CollectedAnalysis,
  entityRef: AstEntityRef,
): Option.Option<CollectorEntity> => HashMap.get(collected.entityByRef, entityRef))

export const entityOfSymbolId = dual<
  (symbolId: SymbolId) => (collected: CollectedAnalysis) => Option.Option<CollectorEntity>,
  (collected: CollectedAnalysis, symbolId: SymbolId) => Option.Option<CollectorEntity>
>(2, (
  collected: CollectedAnalysis,
  symbolId: SymbolId,
): Option.Option<CollectorEntity> => HashMap.get(collected.entityBySymbolId, symbolId))

export const isAncillaryOf = dual<
  (declarationId: NodeId) => (collected: CollectedAnalysis) => boolean,
  (collected: CollectedAnalysis, declarationId: NodeId) => boolean
>(2, (collected: CollectedAnalysis, declarationId: NodeId): boolean =>
  Option.getOrElse(
    Option.map(declarationMetadataOf(collected, declarationId), (metadata) => metadata.isAncillary),
    () => false,
  ))

export const localNameOfSymbolId = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => string,
  (graph: AnalysisGraph, symbolId: SymbolId) => string
>(2, (graph: AnalysisGraph, symbolId: SymbolId): string =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.localName),
    () => '',
  ))

export const localNameOfDeclarationId = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => string,
  (graph: AnalysisGraph, declarationId: NodeId) => string
>(2, (graph: AnalysisGraph, declarationId: NodeId): string =>
  Option.getOrElse(
    Option.map(declarationOf(graph, declarationId), (astDeclaration) =>
      localNameOfSymbolId(graph, astDeclaration.astSymbolId)),
    () =>
      '',
  ))

export const localNameOfRef = dual<
  (entityRef: AstEntityRef) => (graph: AnalysisGraph) => Option.Option<string>,
  (graph: AnalysisGraph, entityRef: AstEntityRef) => Option.Option<string>
>(2, (graph: AnalysisGraph, entityRef: AstEntityRef): Option.Option<string> =>
  Match.value(entityRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => Option.map(symbolOf(graph, symbolRef.symbolId), (s) => s.localName)),
    Match.tag('AstImportRef', (importRef) => Option.map(HashMap.get(graph.imports, importRef.key), (i) => i.localName)),
    Match.tag(
      'AstNamespaceImportRef',
      (namespaceRef) => Option.map(namespaceImportOf(graph, namespaceRef.symbolId), (record) => record.localName),
    ),
    Match.exhaustive,
  ))

export const isExternalSymbol = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => boolean,
  (graph: AnalysisGraph, symbolId: SymbolId) => boolean
>(2, (graph: AnalysisGraph, symbolId: SymbolId): boolean =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.isExternal),
    () => false,
  ))

export const parentSymbolIdOf = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => Option.Option<SymbolId>,
  (graph: AnalysisGraph, symbolId: SymbolId) => Option.Option<SymbolId>
>(
  2,
  (graph: AnalysisGraph, symbolId: SymbolId): Option.Option<SymbolId> =>
    Option.flatMap(symbolOf(graph, symbolId), (astSymbol) => astSymbol.parentAstSymbolId),
)

export const rootSymbolIdOf = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => SymbolId,
  (graph: AnalysisGraph, symbolId: SymbolId) => SymbolId
>(2, (graph: AnalysisGraph, symbolId: SymbolId): SymbolId =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.rootAstSymbolId),
    () => symbolId,
  ))

export const declarationIdsOfSymbol = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => Chunk.Chunk<NodeId>,
  (graph: AnalysisGraph, symbolId: SymbolId) => Chunk.Chunk<NodeId>
>(2, (graph: AnalysisGraph, symbolId: SymbolId): Chunk.Chunk<NodeId> =>
  Option.getOrElse(
    Option.map(symbolOf(graph, symbolId), (astSymbol) => astSymbol.declarationIds),
    () => Chunk.empty(),
  ))

export const declarationsOfIds = dual<
  (declarationIds: Chunk.Chunk<NodeId>) => (graph: AnalysisGraph) => Chunk.Chunk<AstDeclaration>,
  (graph: AnalysisGraph, declarationIds: Chunk.Chunk<NodeId>) => Chunk.Chunk<AstDeclaration>
>(2, (
  graph: AnalysisGraph,
  declarationIds: Chunk.Chunk<NodeId>,
): Chunk.Chunk<AstDeclaration> =>
  Chunk.filterMap(
    declarationIds,
    (declarationId) => Result.fromOption(declarationOf(graph, declarationId), () => undefined),
  ))

export const declarationsPreOrder = dual<
  (declarationIds: Chunk.Chunk<NodeId>) => (graph: AnalysisGraph) => Chunk.Chunk<AstDeclaration>,
  (graph: AnalysisGraph, declarationIds: Chunk.Chunk<NodeId>) => Chunk.Chunk<AstDeclaration>
>(2, (
  graph: AnalysisGraph,
  declarationIds: Chunk.Chunk<NodeId>,
): Chunk.Chunk<AstDeclaration> =>
  Arr.reduce(
    Chunk.toReadonlyArray(declarationIds),
    Chunk.empty<AstDeclaration>(),
    (accumulated, declarationId) => Chunk.appendAll(accumulated, declarationPreOrder(graph, declarationId)),
  ))

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

export const updateApiItemMetadata = dual<
  (
    declarationId: NodeId,
    update: (metadata: ApiItemMetadata) => ApiItemMetadata,
  ) => (collected: CollectedAnalysis) => CollectedAnalysis,
  (
    collected: CollectedAnalysis,
    declarationId: NodeId,
    update: (metadata: ApiItemMetadata) => ApiItemMetadata,
  ) => CollectedAnalysis
>(3, (
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
  }))

export const issueForDeclaration = dual<
  (
    graph: AnalysisGraph,
    messageId: string,
    messageText: string,
    declarationId: NodeId,
    properties: ExtractorMessageProperties | undefined,
  ) => (collected: CollectedAnalysis) => CollectedAnalysis,
  (
    collected: CollectedAnalysis,
    graph: AnalysisGraph,
    messageId: string,
    messageText: string,
    declarationId: NodeId,
    properties: ExtractorMessageProperties | undefined,
  ) => CollectedAnalysis
>(6, (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  declarationId: NodeId,
  properties: ExtractorMessageProperties | undefined,
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
  }))

export const issueForSymbol = dual<
  (
    graph: AnalysisGraph,
    messageId: string,
    messageText: string,
    symbolId: SymbolId,
    properties: ExtractorMessageProperties | undefined,
  ) => (collected: CollectedAnalysis) => CollectedAnalysis,
  (
    collected: CollectedAnalysis,
    graph: AnalysisGraph,
    messageId: string,
    messageText: string,
    symbolId: SymbolId,
    properties: ExtractorMessageProperties | undefined,
  ) => CollectedAnalysis
>(6, (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  symbolId: SymbolId,
  properties: ExtractorMessageProperties | undefined,
): CollectedAnalysis =>
  Option.match(Arr.head(Chunk.toReadonlyArray(declarationIdsOfSymbol(graph, symbolId))), {
    onNone: () => collected,
    onSome: (declarationId) => issueForDeclaration(collected, graph, messageId, messageText, declarationId, properties),
  }))

export const resolveReferenceIn = dual<
  (
    collected: CollectedAnalysis,
    declarationReference: tsdoc.DocDeclarationReference,
  ) => (graph: AnalysisGraph) => Result.Result<AstDeclaration, string>,
  (
    graph: AnalysisGraph,
    collected: CollectedAnalysis,
    declarationReference: tsdoc.DocDeclarationReference,
  ) => Result.Result<AstDeclaration, string>
>(3, (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationReference: tsdoc.DocDeclarationReference,
): Result.Result<AstDeclaration, string> =>
  resolveDeclarationReference(
    graph,
    { isAncillary: (declarationId) => isAncillaryOf(collected, declarationId) },
    declarationReference,
  ))

export const workingPackageNameOf = (graph: AnalysisGraph): string =>
  Option.getOrElse(Option.map(graph.workingPackage, (workingPackage) => workingPackage.name), () => '')

export const includeForgottenExports = (graph: AnalysisGraph): boolean =>
  Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.apiReport.includeForgottenExports), () => false) ||
  Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.docModel.includeForgottenExports), () => false)

export const isWarned = dual<
  (entityRef: AstEntityRef) => (warned: HashSet.HashSet<AstEntityRef>) => boolean,
  (warned: HashSet.HashSet<AstEntityRef>, entityRef: AstEntityRef) => boolean
>(2, (warned: HashSet.HashSet<AstEntityRef>, entityRef: AstEntityRef): boolean => HashSet.has(warned, entityRef))
