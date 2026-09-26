import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import { ApiItemMetadata } from '../analyzer/collect/api-item-metadata.js'
import type { CollectedAnalysis } from '../analyzer/collect/collect-analysis.js'
import type { CollectorEntity } from '../analyzer/collect/collector-entity.js'
import { sortKeyIgnoringUnderscore } from '../analyzer/collect/collector-entity.js'
import { DeclarationMetadata } from '../analyzer/collect/declaration-metadata.js'
import {
  apiItemMetadataOf,
  declarationIdsOfSymbol,
  declarationMetadataOf,
  declarationOf,
  declarationsOfIds,
  entityOfRef,
  isAncillaryOf,
  localNameOfDeclarationId,
  localNameOfRef,
  moduleExportInfoOf,
  nodeOf,
  symbolMetadataOf,
  symbolOf,
  workingPackageNameOf,
} from '../analyzer/collect/enhancement-view.js'
import type { PackageDocComment } from '../analyzer/collect/package-doc-comment.js'
import type { SymbolMetadata } from '../analyzer/collect/symbol-metadata.js'
import type { AnalysisGraph } from '../analyzer/graph/analysis-graph.js'
import { symbolValueOf } from '../analyzer/graph/analysis-graph.js'
import { isSupportedSyntaxKind } from '../analyzer/graph/ast-declaration.js'
import type { AstDeclaration } from '../analyzer/graph/ast-declaration.js'
import type { AstEntity, AstEntityRef } from '../analyzer/graph/ast-entity.js'
import { AstImportKind } from '../analyzer/graph/ast-import.js'
import type { AstImport } from '../analyzer/graph/ast-import.js'
import { emptyAstModuleExportInfo } from '../analyzer/graph/ast-module.js'
import type { AstModuleExportInfo } from '../analyzer/graph/ast-module.js'
import type { AstNamespaceImport } from '../analyzer/graph/ast-namespace-import.js'
import type { AstSymbol } from '../analyzer/graph/ast-symbol.js'
import type { WorkingPackage } from '../analyzer/graph/working-package.js'
import type { NodeId } from '../analyzer/TypeScriptInternals.js'
import { getNodeId } from '../analyzer/TypeScriptInternals.js'
import type { ExtractorConfig } from '../config/extractor-config.js'
import { InternalInvariantError } from '../errors/index.js'
import { ReleaseTag } from '../model/index.js'
import type { ExtractorMessageId } from './extractor-message-id.js'
import { type ExtractorMessageProperties, MessageLog } from './message-log.js'
import type { ReportMessageSource } from './message-router.js'
import type { SourceMapIndex } from './SourceMapper.js'
import { VisitorState } from './VisitorState.js'

export { AstImportKind, sortKeyIgnoringUnderscore }
export type { ApiItemMetadata, AstDeclaration, AstEntity, AstEntityRef, AstImport, AstModuleExportInfo }
export type { AstNamespaceImport, AstSymbol, CollectorEntity, DeclarationMetadata, PackageDocComment }
export type { SymbolMetadata, WorkingPackage }

/**
 * The frozen analysis one extraction run reads: the graph the walker built, the collected
 * entities and metadata the fold computed, and the routing view the run's configuration implies.
 * Every consumer reaches analysis state through the accessors below, and every accessor returns a
 * new snapshot when it changes the message log, so no phase observes another phase's writes.
 */
export interface AnalysisSnapshot {
  readonly graph: AnalysisGraph
  readonly collected: CollectedAnalysis
  readonly reportMessages: ReportMessageSource
}

export const make = dual<
  (collected: CollectedAnalysis, reportMessages: ReportMessageSource) => (graph: AnalysisGraph) => AnalysisSnapshot,
  (graph: AnalysisGraph, collected: CollectedAnalysis, reportMessages: ReportMessageSource) => AnalysisSnapshot
>(3, (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  reportMessages: ReportMessageSource,
): AnalysisSnapshot => ({ graph, collected, reportMessages }))

export const messageLog = (snapshot: AnalysisSnapshot): MessageLog => snapshot.collected.messageLog

export const withMessageLog = dual<
  (log: MessageLog) => (snapshot: AnalysisSnapshot) => AnalysisSnapshot,
  (snapshot: AnalysisSnapshot, log: MessageLog) => AnalysisSnapshot
>(2, (snapshot: AnalysisSnapshot, log: MessageLog): AnalysisSnapshot => ({
  ...snapshot,
  collected: { ...snapshot.collected, messageLog: log },
}))

/** Maps every raw `.d.ts` position in the log through the pre-read index. */
export const locateMessages = dual<
  (index: SourceMapIndex) => (snapshot: AnalysisSnapshot) => AnalysisSnapshot,
  (snapshot: AnalysisSnapshot, index: SourceMapIndex) => AnalysisSnapshot
>(
  2,
  (snapshot: AnalysisSnapshot, index: SourceMapIndex): AnalysisSnapshot =>
    withMessageLog(snapshot, MessageLog.locate(messageLog(snapshot), index)),
)

export const markHandled = dual<
  (handled: HashSet.HashSet<number>) => (snapshot: AnalysisSnapshot) => AnalysisSnapshot,
  (snapshot: AnalysisSnapshot, handled: HashSet.HashSet<number>) => AnalysisSnapshot
>(
  2,
  (snapshot: AnalysisSnapshot, handled: HashSet.HashSet<number>): AnalysisSnapshot =>
    withMessageLog(snapshot, MessageLog.withHandled(messageLog(snapshot), handled)),
)

export const entities = (snapshot: AnalysisSnapshot): Chunk.Chunk<CollectorEntity> => snapshot.collected.entities

export const extractorConfig = (snapshot: AnalysisSnapshot): ExtractorConfig => snapshot.graph.extractorConfig

export const tsdocConfiguration = (snapshot: AnalysisSnapshot): tsdoc.TSDocConfiguration =>
  snapshot.graph.tsdocConfiguration

export const packageName = (snapshot: AnalysisSnapshot): string => workingPackageNameOf(snapshot.graph)

export const packageFolder = (snapshot: AnalysisSnapshot): string =>
  Option.getOrElse(
    Option.map(snapshot.graph.workingPackage, (workingPackage) => workingPackage.packageFolder),
    () => '',
  )

export const packageDocComment = (snapshot: AnalysisSnapshot): Option.Option<PackageDocComment> =>
  snapshot.collected.packageDocComment

export const dtsTypeReferenceDirectives = (snapshot: AnalysisSnapshot): Chunk.Chunk<string> =>
  snapshot.collected.dtsTypeReferenceDirectives

export const dtsLibReferenceDirectives = (snapshot: AnalysisSnapshot): Chunk.Chunk<string> =>
  snapshot.collected.dtsLibReferenceDirectives

export const starExportedExternalModulePaths = (snapshot: AnalysisSnapshot): ReadonlyArray<string> =>
  snapshot.collected.starExportedExternalModulePaths

export const reportMessages = (snapshot: AnalysisSnapshot): ReportMessageSource => snapshot.reportMessages

export const isSupportedDeclarationKind = (kind: ts.SyntaxKind): boolean => isSupportedSyntaxKind(kind)

export const refOf = (entity: CollectorEntity): AstEntityRef => entity.astEntity

export const astSymbolOf = dual<
  (ref: AstEntityRef) => (snapshot: AnalysisSnapshot) => Option.Option<AstSymbol>,
  (snapshot: AnalysisSnapshot, ref: AstEntityRef) => Option.Option<AstSymbol>
>(2, (snapshot: AnalysisSnapshot, ref: AstEntityRef): Option.Option<AstSymbol> =>
  Match.value(ref).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => symbolOf(snapshot.graph, symbolRef.symbolId)),
    Match.orElse(() => Option.none()),
  ))

export const astImportOf = dual<
  (ref: AstEntityRef) => (snapshot: AnalysisSnapshot) => Option.Option<AstImport>,
  (snapshot: AnalysisSnapshot, ref: AstEntityRef) => Option.Option<AstImport>
>(2, (snapshot: AnalysisSnapshot, ref: AstEntityRef): Option.Option<AstImport> =>
  Match.value(ref).pipe(
    Match.tag('AstImportRef', (importRef) => HashMap.get(snapshot.graph.imports, importRef.key)),
    Match.orElse(() => Option.none()),
  ))

export const astNamespaceImportOf = dual<
  (ref: AstEntityRef) => (snapshot: AnalysisSnapshot) => Option.Option<AstNamespaceImport>,
  (snapshot: AnalysisSnapshot, ref: AstEntityRef) => Option.Option<AstNamespaceImport>
>(2, (
  snapshot: AnalysisSnapshot,
  ref: AstEntityRef,
): Option.Option<AstNamespaceImport> =>
  Match.value(ref).pipe(
    Match.tag('AstNamespaceImportRef', (namespaceRef) =>
      HashMap.get(snapshot.graph.namespaceImports, namespaceRef.symbolId)),
    Match.orElse(() =>
      Option.none()
    ),
  ))

export const localName = dual<
  (source: AstEntityRef | AstDeclaration) => (snapshot: AnalysisSnapshot) => string,
  (snapshot: AnalysisSnapshot, source: AstEntityRef | AstDeclaration) => string
>(2, (snapshot: AnalysisSnapshot, source: AstEntityRef | AstDeclaration): string =>
  Match.value(source).pipe(
    Match.tag(
      'AstDeclaration',
      (astDeclaration) => localNameOfDeclarationId(snapshot.graph, astDeclaration.declarationId),
    ),
    Match.orElse((ref) => Option.getOrElse(localNameOfRef(snapshot.graph, ref), () => '')),
  ))

export const tryGetCollectorEntity = dual<
  (ref: AstEntityRef) => (snapshot: AnalysisSnapshot) => Option.Option<CollectorEntity>,
  (snapshot: AnalysisSnapshot, ref: AstEntityRef) => Option.Option<CollectorEntity>
>(2, (
  snapshot: AnalysisSnapshot,
  ref: AstEntityRef,
): Option.Option<CollectorEntity> => entityOfRef(snapshot.collected, ref))

export const tryFetchMetadataForAstEntity = dual<
  (ref: AstEntityRef) => (snapshot: AnalysisSnapshot) => Option.Option<SymbolMetadata>,
  (snapshot: AnalysisSnapshot, ref: AstEntityRef) => Option.Option<SymbolMetadata>
>(2, (
  snapshot: AnalysisSnapshot,
  ref: AstEntityRef,
): Option.Option<SymbolMetadata> =>
  Match.value(ref).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => symbolMetadataOf(snapshot.collected, symbolRef.symbolId)),
    Match.orElse(() => Option.none()),
  ))

const defaultApiItemMetadata: ApiItemMetadata = new ApiItemMetadata({
  declaredReleaseTag: ReleaseTag.None,
  effectiveReleaseTag: ReleaseTag.None,
  releaseTagSameAsParent: false,
  isEventProperty: false,
  isOverride: false,
  isSealed: false,
  isVirtual: false,
  isPreapproved: false,
  deprecated: false,
  customBlockTagNames: Chunk.empty(),
  modifierTagNames: Chunk.empty(),
  tsdocComment: Option.none(),
  undocumented: true,
  docCommentEnhancerVisitorState: VisitorState.Unvisited,
})

const defaultDeclarationMetadata: DeclarationMetadata = new DeclarationMetadata({
  tsdocParserContext: Option.none(),
  isAncillary: false,
  ancillaryDeclarationIds: Chunk.empty(),
})

export const fetchApiItemMetadata = dual<
  (astDeclaration: AstDeclaration) => (snapshot: AnalysisSnapshot) => ApiItemMetadata,
  (snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration) => ApiItemMetadata
>(
  2,
  (snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration): ApiItemMetadata =>
    Option.getOrElse(apiItemMetadataOf(snapshot.collected, astDeclaration.declarationId), () => defaultApiItemMetadata),
)

export const fetchDeclarationMetadata = dual<
  (astDeclaration: AstDeclaration) => (snapshot: AnalysisSnapshot) => DeclarationMetadata,
  (snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration) => DeclarationMetadata
>(2, (
  snapshot: AnalysisSnapshot,
  astDeclaration: AstDeclaration,
): DeclarationMetadata =>
  Option.getOrElse(
    declarationMetadataOf(snapshot.collected, astDeclaration.declarationId),
    () => defaultDeclarationMetadata,
  ))

export const isAncillaryDeclaration = dual<
  (astDeclaration: AstDeclaration) => (snapshot: AnalysisSnapshot) => boolean,
  (snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration) => boolean
>(
  2,
  (snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration): boolean =>
    isAncillaryOf(snapshot.collected, astDeclaration.declarationId),
)

export const astDeclarations = dual<
  (astSymbol: AstSymbol) => (snapshot: AnalysisSnapshot) => Chunk.Chunk<AstDeclaration>,
  (snapshot: AnalysisSnapshot, astSymbol: AstSymbol) => Chunk.Chunk<AstDeclaration>
>(
  2,
  (snapshot: AnalysisSnapshot, astSymbol: AstSymbol): Chunk.Chunk<AstDeclaration> =>
    declarationsOfIds(snapshot.graph, declarationIdsOfSymbol(snapshot.graph, astSymbol.followedSymbolId)),
)

export const modifierFlags = dual<
  (astDeclaration: AstDeclaration) => (_snapshot: AnalysisSnapshot) => ts.ModifierFlags,
  (_snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration) => ts.ModifierFlags
>(2, (_snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration): ts.ModifierFlags => astDeclaration.modifierFlags)

export const symbolFlags = dual<
  (astSymbol: AstSymbol) => (snapshot: AnalysisSnapshot) => ts.SymbolFlags,
  (snapshot: AnalysisSnapshot, astSymbol: AstSymbol) => ts.SymbolFlags
>(2, (snapshot: AnalysisSnapshot, astSymbol: AstSymbol): ts.SymbolFlags =>
  Option.getOrElse(
    Option.flatMap(symbolOf(snapshot.graph, astSymbol.followedSymbolId), (astSymbol) =>
      Option.map(symbolValueOf(snapshot.graph, astSymbol.followedSymbolId), (symbol) => symbol.flags)),
    () =>
      ts.SymbolFlags.None,
  ))

export const declaration = dual<
  (
    source: AstDeclaration | AstNamespaceImport,
  ) => (snapshot: AnalysisSnapshot) => Result.Result<ts.Node, InternalInvariantError>,
  (
    snapshot: AnalysisSnapshot,
    source: AstDeclaration | AstNamespaceImport,
  ) => Result.Result<ts.Node, InternalInvariantError>
>(2, (
  snapshot: AnalysisSnapshot,
  source: AstDeclaration | AstNamespaceImport,
): Result.Result<ts.Node, InternalInvariantError> => {
  const declarationId = Match.value(source).pipe(
    Match.tag('AstDeclaration', (astDeclaration) => astDeclaration.declarationId),
    Match.orElse((astNamespaceImport) => astNamespaceImport.declarationId),
  )
  return Option.match(nodeOf(snapshot.graph, declarationId), {
    onNone: () =>
      Result.fail(new InternalInvariantError({ message: 'Missing declaration node for the analysis graph' })),
    onSome: (node) => Result.succeed(node),
  })
})

export const childDeclarationByNode = dual<
  (
    node: ts.Node,
    parentAstDeclaration: AstDeclaration,
  ) => (snapshot: AnalysisSnapshot) => Result.Result<AstDeclaration, InternalInvariantError>,
  (
    snapshot: AnalysisSnapshot,
    node: ts.Node,
    parentAstDeclaration: AstDeclaration,
  ) => Result.Result<AstDeclaration, InternalInvariantError>
>(3, (
  snapshot: AnalysisSnapshot,
  node: ts.Node,
  parentAstDeclaration: AstDeclaration,
): Result.Result<AstDeclaration, InternalInvariantError> =>
  Option.match(declarationOf(snapshot.graph, getNodeId(node)), {
    onNone: () =>
      Result.fail(new InternalInvariantError({ message: 'Child declaration not found for the specified node' })),
    onSome: (astDeclaration) =>
      Match.value(
        Option.exists(
          astDeclaration.parentDeclarationId,
          (parentId) => parentId === parentAstDeclaration.declarationId,
        ),
      ).pipe(
        Match.when(true, (): Result.Result<AstDeclaration, InternalInvariantError> => Result.succeed(astDeclaration)),
        Match.when(
          false,
          (): Result.Result<AstDeclaration, InternalInvariantError> =>
            Result.fail(
              new InternalInvariantError({ message: 'The found child is not attached to the parent AstDeclaration' }),
            ),
        ),
        Match.exhaustive,
      ),
  }))

export const tryGetEntityForNode = dual<
  (
    node: ts.Identifier | ts.ImportTypeNode,
  ) => (snapshot: AnalysisSnapshot) => Result.Result<Option.Option<CollectorEntity>, InternalInvariantError>,
  (
    snapshot: AnalysisSnapshot,
    node: ts.Identifier | ts.ImportTypeNode,
  ) => Result.Result<Option.Option<CollectorEntity>, InternalInvariantError>
>(2, (
  snapshot: AnalysisSnapshot,
  node: ts.Identifier | ts.ImportTypeNode,
): Result.Result<Option.Option<CollectorEntity>, InternalInvariantError> => {
  const nodeId = getNodeId(node)
  return Match.value(HashMap.has(snapshot.graph.entitiesByNode, nodeId)).pipe(
    Match.when(
      false,
      (): Result.Result<Option.Option<CollectorEntity>, InternalInvariantError> =>
        Result.fail(
          new InternalInvariantError({
            message: 'tryGetEntityForIdentifier() called for an identifier that was not analyzed',
          }),
        ),
    ),
    Match.when(
      true,
      (): Result.Result<Option.Option<CollectorEntity>, InternalInvariantError> =>
        Result.succeed(
          Option.flatMap(Option.flatten(HashMap.get(snapshot.graph.entitiesByNode, nodeId)), (ref) =>
            entityOfRef(snapshot.collected, ref)),
        ),
    ),
    Match.exhaustive,
  )
})

export const fetchAstModuleExportInfo = dual<
  (astNamespaceImport: AstNamespaceImport) => (snapshot: AnalysisSnapshot) => AstModuleExportInfo,
  (snapshot: AnalysisSnapshot, astNamespaceImport: AstNamespaceImport) => AstModuleExportInfo
>(2, (
  snapshot: AnalysisSnapshot,
  astNamespaceImport: AstNamespaceImport,
): AstModuleExportInfo =>
  Option.getOrElse(moduleExportInfoOf(snapshot.graph, astNamespaceImport.astModuleId), () => emptyAstModuleExportInfo))

const declarationIdOf = (source: AstDeclaration | AstSymbol): Option.Option<NodeId> =>
  Match.value(source).pipe(
    Match.tag('AstDeclaration', (astDeclaration) => Option.some(astDeclaration.declarationId)),
    Match.orElse((astSymbol) => Arr.head(Chunk.toReadonlyArray(astSymbol.declarationIds))),
  )

/** Appends an analyzer issue associated with the declaration (or the symbol's first declaration). */
export const addAnalyzerIssue = dual<
  (
    messageId: ExtractorMessageId,
    messageText: string,
    astDeclarationOrSymbol: AstDeclaration | AstSymbol | undefined,
    properties: ExtractorMessageProperties | undefined,
  ) => (snapshot: AnalysisSnapshot) => AnalysisSnapshot,
  (
    snapshot: AnalysisSnapshot,
    messageId: ExtractorMessageId,
    messageText: string,
    astDeclarationOrSymbol: AstDeclaration | AstSymbol | undefined,
    properties: ExtractorMessageProperties | undefined,
  ) => AnalysisSnapshot
>(5, (
  snapshot: AnalysisSnapshot,
  messageId: ExtractorMessageId,
  messageText: string,
  astDeclarationOrSymbol: AstDeclaration | AstSymbol | undefined,
  properties: ExtractorMessageProperties | undefined,
): AnalysisSnapshot =>
  Option.match(Option.fromNullishOr(astDeclarationOrSymbol), {
    onNone: () => snapshot,
    onSome: (source) =>
      Option.match(declarationIdOf(source), {
        onNone: () => snapshot,
        onSome: (declarationId) =>
          Option.match(nodeOf(snapshot.graph, declarationId), {
            onNone: () => snapshot,
            onSome: (node) =>
              withMessageLog(
                snapshot,
                MessageLog.addAnalyzerIssue(
                  messageLog(snapshot),
                  messageId,
                  messageText,
                  node.getSourceFile(),
                  node.getStart(),
                  Option.some(declarationId),
                  properties,
                ),
              ),
          }),
      }),
  }))
