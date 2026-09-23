import type * as tsdoc from '@microsoft/tsdoc'
import * as Data from 'effect/Data'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import { AstDeclaration } from '../analyzer/AstDeclaration.js'
import type { AstEntity } from '../analyzer/AstEntity.js'
import { AstImport } from '../analyzer/AstImport.js'
import type { IAstModuleExportInfo } from '../analyzer/AstModule.js'
import { AstNamespaceImport } from '../analyzer/AstNamespaceImport.js'
import { ResolverFailure } from '../analyzer/AstReferenceResolver.js'
import { AstSymbol } from '../analyzer/AstSymbol.js'
import { getSymbolId, type SymbolId } from '../analyzer/TypeScriptInternals.js'
import type { ExtractorConfig } from '../config/index.js'
import type { ApiItemMetadata } from './ApiItemMetadata.js'
import { Collector, type ICollectorOptions } from './Collector.js'
import type { CollectorEntity } from './CollectorEntity.js'
import type { DeclarationMetadata } from './DeclarationMetadata.js'
import type { ExtractorMessageId } from './extractor-message-id.js'
import type { ExtractorMessageProperties, MessageLog } from './message-log.js'
import type { ReportMessageSource } from './message-router.js'
import type { SourceMapIndex } from './SourceMapper.js'
import type { SymbolMetadata } from './SymbolMetadata.js'
import type { WorkingPackage } from './WorkingPackage.js'

export type { AstDeclaration, AstEntity, AstImport, AstNamespaceImport, AstSymbol }
export { AstImportKind } from '../analyzer/AstImport.js'
export type { IAstModuleExportInfo } from '../analyzer/AstModule.js'

export const isSupportedDeclarationKind = (kind: ts.SyntaxKind): boolean => AstDeclaration.isSupportedSyntaxKind(kind)

export const sortKeyIgnoringUnderscore = (identifier: string | undefined): string =>
  Collector.getSortKeyIgnoringUnderscore(identifier)

export class AstSymbolRef extends Data.TaggedClass('AstSymbolRef')<{ readonly symbolId: SymbolId }> {}
export class AstImportRef extends Data.TaggedClass('AstImportRef')<{ readonly key: string }> {}
export class AstNamespaceImportRef extends Data.TaggedClass('AstNamespaceImportRef')<{ readonly symbolId: SymbolId }> {}
export class AstNamespaceExportRef extends Data.TaggedClass('AstNamespaceExportRef') {}

export type AstEntityRef = AstSymbolRef | AstImportRef | AstNamespaceImportRef | AstNamespaceExportRef

const asAstSymbolValue = (astEntity: AstEntity): Option.Option<AstSymbol> =>
  Match.value(astEntity).pipe(
    Match.when((candidate): candidate is AstSymbol => candidate instanceof AstSymbol, (astSymbol) =>
      Option.some(astSymbol)),
    Match.orElse(() =>
      Option.none()
    ),
  )

const asAstImportValue = (astEntity: AstEntity): Option.Option<AstImport> =>
  Match.value(astEntity).pipe(
    Match.when((candidate): candidate is AstImport => candidate instanceof AstImport, (astImport) =>
      Option.some(astImport)),
    Match.orElse(() =>
      Option.none()
    ),
  )

const asAstNamespaceImportValue = (astEntity: AstEntity): Option.Option<AstNamespaceImport> =>
  Match.value(astEntity).pipe(
    Match.when((candidate): candidate is AstNamespaceImport => candidate instanceof AstNamespaceImport, (
      astNamespaceImport,
    ) => Option.some(astNamespaceImport)),
    Match.orElse(() => Option.none()),
  )

export const refOf = (entity: AstEntity): AstEntityRef =>
  Option.match(asAstSymbolValue(entity), {
    onSome: (astSymbol) => new AstSymbolRef({ symbolId: getSymbolId(astSymbol.followedSymbol) }),
    onNone: () =>
      Option.match(asAstImportValue(entity), {
        onSome: (astImport) => new AstImportRef({ key: astImport.key }),
        onNone: () =>
          Option.match(asAstNamespaceImportValue(entity), {
            onSome: (astNamespaceImport) =>
              new AstNamespaceImportRef({ symbolId: getSymbolId(astNamespaceImport.symbol) }),
            onNone: () => new AstNamespaceExportRef(),
          }),
      }),
  })

const snapshotCollector: unique symbol = Symbol.for('~systemfsoftware/api-extractor/analysis-snapshot')

export interface AnalysisSnapshot {
  readonly [snapshotCollector]: Collector
}

export const make = (options: ICollectorOptions): AnalysisSnapshot => ({
  [snapshotCollector]: new Collector(options),
})

const collector = (snapshot: AnalysisSnapshot): Collector => snapshot[snapshotCollector]

export const analyze = (snapshot: AnalysisSnapshot): void => collector(snapshot).analyze()

export const entities = (snapshot: AnalysisSnapshot): ReadonlyArray<CollectorEntity> => collector(snapshot).entities

export const extractorConfig = (snapshot: AnalysisSnapshot): ExtractorConfig => collector(snapshot).extractorConfig

export const workingPackage = (snapshot: AnalysisSnapshot): WorkingPackage => collector(snapshot).workingPackage

export const tsdocConfiguration = (snapshot: AnalysisSnapshot): tsdoc.TSDocConfiguration =>
  collector(snapshot).tsdocConfiguration

export const dtsTypeReferenceDirectives = (snapshot: AnalysisSnapshot): ReadonlySet<string> =>
  collector(snapshot).dtsTypeReferenceDirectives

export const dtsLibReferenceDirectives = (snapshot: AnalysisSnapshot): ReadonlySet<string> =>
  collector(snapshot).dtsLibReferenceDirectives

export const starExportedExternalModulePaths = (snapshot: AnalysisSnapshot): ReadonlyArray<string> =>
  collector(snapshot).starExportedExternalModulePaths

export const reportMessages = (snapshot: AnalysisSnapshot): ReportMessageSource => collector(snapshot).reportMessages

export const messageLog = (snapshot: AnalysisSnapshot): MessageLog => collector(snapshot).messageLog

export const locateMessages = (snapshot: AnalysisSnapshot, index: SourceMapIndex): void =>
  collector(snapshot).locateMessages(index)

export const markHandled = (snapshot: AnalysisSnapshot, handled: HashSet.HashSet<number>): void =>
  collector(snapshot).markHandled(handled)

export const fetchApiItemMetadata = (
  snapshot: AnalysisSnapshot,
  astDeclaration: AstDeclaration,
): ApiItemMetadata => collector(snapshot).fetchApiItemMetadata(astDeclaration)

export const fetchSymbolMetadata = (snapshot: AnalysisSnapshot, astSymbol: AstSymbol): SymbolMetadata =>
  collector(snapshot).fetchSymbolMetadata(astSymbol)

export const fetchDeclarationMetadata = (
  snapshot: AnalysisSnapshot,
  astDeclaration: AstDeclaration,
): DeclarationMetadata => collector(snapshot).fetchDeclarationMetadata(astDeclaration)

export const tryFetchMetadataForAstEntity = (
  snapshot: AnalysisSnapshot,
  astEntity: AstEntity,
): Option.Option<SymbolMetadata> => Option.fromNullishOr(collector(snapshot).tryFetchMetadataForAstEntity(astEntity))

export const isAncillaryDeclaration = (snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration): boolean =>
  collector(snapshot).isAncillaryDeclaration(astDeclaration)

export const tryGetCollectorEntity = (
  snapshot: AnalysisSnapshot,
  astEntity: AstEntity,
): Option.Option<CollectorEntity> => Option.fromNullishOr(collector(snapshot).tryGetCollectorEntity(astEntity))

export const tryGetEntityForNode = (
  snapshot: AnalysisSnapshot,
  node: ts.Identifier | ts.ImportTypeNode,
): Option.Option<CollectorEntity> => Option.fromNullishOr(collector(snapshot).tryGetEntityForNode(node))

export const resolveReference = (
  snapshot: AnalysisSnapshot,
  declarationReference: tsdoc.DocDeclarationReference,
): Result.Result<AstDeclaration, string> =>
  Match.value(collector(snapshot).astReferenceResolver.resolve(declarationReference)).pipe(
    Match.when(
      (candidate): candidate is ResolverFailure => candidate instanceof ResolverFailure,
      (failure) => Result.fail(failure.reason),
    ),
    Match.orElse((astDeclaration) => Result.succeed(astDeclaration)),
  )

export const addAnalyzerIssue = (
  snapshot: AnalysisSnapshot,
  messageId: ExtractorMessageId,
  messageText: string,
  astDeclarationOrSymbol?: AstDeclaration | AstSymbol,
  properties?: ExtractorMessageProperties,
): void => {
  collector(snapshot).addAnalyzerIssue(messageId, messageText, astDeclarationOrSymbol, properties)
}

export const fetchAstModuleExportInfo = (
  snapshot: AnalysisSnapshot,
  astNamespaceImport: AstNamespaceImport,
): IAstModuleExportInfo => astNamespaceImport.fetchAstModuleExportInfo(collector(snapshot))

export const childDeclarationByNode = (
  snapshot: AnalysisSnapshot,
  node: ts.Node,
  parentAstDeclaration: AstDeclaration,
): AstDeclaration => collector(snapshot).astSymbolTable.getChildAstDeclarationByNode(node, parentAstDeclaration)

export const astDeclarations = (_snapshot: AnalysisSnapshot, astSymbol: AstSymbol): ReadonlyArray<AstDeclaration> =>
  astSymbol.astDeclarations

export const astSymbol = (_snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration): AstSymbol =>
  astDeclaration.astSymbol

export const children = (_snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration): ReadonlyArray<AstDeclaration> =>
  astDeclaration.children

export const parentAstDeclaration = (
  _snapshot: AnalysisSnapshot,
  astDeclaration: AstDeclaration,
): Option.Option<AstDeclaration> => Option.fromNullishOr(astDeclaration.parent)

export const declaration = (
  _snapshot: AnalysisSnapshot,
  source: AstDeclaration | AstNamespaceImport,
): ts.Declaration =>
  Match.value(source).pipe(
    Match.when(
      (candidate): candidate is AstNamespaceImport => candidate instanceof AstNamespaceImport,
      (astNamespaceImport) => astNamespaceImport.declaration,
    ),
    Match.orElse((astDeclaration) => astDeclaration.declaration),
  )

export const modifierFlags = (_snapshot: AnalysisSnapshot, astDeclaration: AstDeclaration): ts.ModifierFlags =>
  astDeclaration.modifierFlags

export const referencedAstEntities = (
  _snapshot: AnalysisSnapshot,
  astDeclaration: AstDeclaration,
): ReadonlyArray<AstEntity> => astDeclaration.referencedAstEntities

export const localName = (_snapshot: AnalysisSnapshot, source: AstEntity | AstDeclaration): string =>
  Match.value(source).pipe(
    Match.when(
      (candidate): candidate is AstDeclaration => candidate instanceof AstDeclaration,
      (astDeclaration) => astDeclaration.astSymbol.localName,
    ),
    Match.orElse((astEntity) => astEntity.localName),
  )

export const rootAstSymbol = (_snapshot: AnalysisSnapshot, astSymbol: AstSymbol): AstSymbol => astSymbol.rootAstSymbol

export const parentAstSymbol = (_snapshot: AnalysisSnapshot, astSymbol: AstSymbol): Option.Option<AstSymbol> =>
  Option.fromNullishOr(astSymbol.parentAstSymbol)

export const isExternal = (_snapshot: AnalysisSnapshot, astSymbol: AstSymbol): boolean => astSymbol.isExternal

export const symbolFlags = (_snapshot: AnalysisSnapshot, astSymbol: AstSymbol): ts.SymbolFlags =>
  astSymbol.followedSymbol.flags

export const forEachDeclarationRecursive = (
  _snapshot: AnalysisSnapshot,
  astSymbol: AstSymbol,
  action: (astDeclaration: AstDeclaration) => void,
): void => astSymbol.forEachDeclarationRecursive(action)

export const astSymbolOf = (astEntity: AstEntity): Option.Option<AstSymbol> => asAstSymbolValue(astEntity)

export const astImportOf = (astEntity: AstEntity): Option.Option<AstImport> => asAstImportValue(astEntity)

export const astNamespaceImportOf = (astEntity: AstEntity): Option.Option<AstNamespaceImport> =>
  asAstNamespaceImportValue(astEntity)

export const astEntityOf = (entity: CollectorEntity): AstEntity => entity.astEntity
