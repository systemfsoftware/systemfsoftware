import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import { MessageLog } from '../../collector/message-log.js'
import { ReleaseTag } from '../../model/index.js'
import { nodeValueOf } from '../graph/analysis-graph.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import * as TypeScriptHelpers from '../TypeScriptHelpers.js'
import type { NodeId } from '../TypeScriptInternals.js'
import * as TypeScriptInternals from '../TypeScriptInternals.js'
import type { ApiItemMetadata } from './api-item-metadata.js'
import { DeclarationMetadata } from './declaration-metadata.js'

export interface ReleaseScan {
  readonly declared: ReleaseTag
  readonly extra: boolean
}

export interface ModifierDraft {
  readonly declaredReleaseTag: ReleaseTag
  readonly isEventProperty: boolean
  readonly isOverride: boolean
  readonly isSealed: boolean
  readonly isVirtual: boolean
  readonly isPreapproved: boolean
}

export interface ApiItemMetadataStore {
  readonly apiItemMetadata: HashMap.HashMap<NodeId, ApiItemMetadata>
}

export const emptyModifierDraft: ModifierDraft = {
  declaredReleaseTag: ReleaseTag.None,
  isEventProperty: false,
  isOverride: false,
  isSealed: false,
  isVirtual: false,
  isPreapproved: false,
}

const zeroScan: ReleaseScan = { declared: ReleaseTag.None, extra: false }

export const preapprovedContainerKinds: HashSet.HashSet<ts.SyntaxKind> = HashSet.make(
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
)

const scanReleaseTagOf = (scan: ReleaseScan, present: boolean, tag: ReleaseTag): ReleaseScan =>
  Match.value(present).pipe(
    Match.when(false, () => scan),
    Match.when(true, () =>
      Match.value(scan.declared === ReleaseTag.None).pipe(
        Match.when(true, () => ({ declared: tag, extra: scan.extra })),
        Match.when(false, () => ({ declared: scan.declared, extra: true })),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const releaseScanOf = (modifierTagSet: tsdoc.StandardModifierTagSet): ReleaseScan => {
  const checks: ReadonlyArray<readonly [boolean, ReleaseTag]> = [
    [modifierTagSet.isPublic(), ReleaseTag.Public],
    [modifierTagSet.isBeta(), ReleaseTag.Beta],
    [modifierTagSet.isAlpha(), ReleaseTag.Alpha],
    [modifierTagSet.isInternal(), ReleaseTag.Internal],
  ]
  return Arr.reduce(checks, zeroScan, (scan, check) => scanReleaseTagOf(scan, check[0], check[1]))
}

export const maxReleaseTag = dual<
  (right: ReleaseTag) => (left: ReleaseTag) => ReleaseTag,
  (left: ReleaseTag, right: ReleaseTag) => ReleaseTag
>(2, (left: ReleaseTag, right: ReleaseTag): ReleaseTag =>
  Match.value(right > left).pipe(
    Match.when(true, () => right),
    Match.when(false, () => left),
    Match.exhaustive,
  ))

export const deprecatedFlagOf = (parserContext: Option.Option<tsdoc.ParserContext>): boolean =>
  Option.exists(parserContext, (context) => context.docComment.deprecatedBlock !== undefined)

export const customBlockTagNamesOf = (parserContext: Option.Option<tsdoc.ParserContext>): Chunk.Chunk<string> => {
  const noBlocks: ReadonlyArray<string> = []
  return Chunk.fromIterable(Option.match(parserContext, {
    onSome: (context) => Arr.map(context.docComment.customBlocks, (block) => block.blockTag.tagName),
    onNone: () => noBlocks,
  }))
}

export const modifierTagNamesOf = (parserContext: Option.Option<tsdoc.ParserContext>): Chunk.Chunk<string> => {
  const noTags: ReadonlyArray<string> = []
  return Chunk.fromIterable(Option.match(parserContext, {
    onSome: (context) => Arr.map(context.docComment.modifierTagSet.nodes, (tag) => tag.tagName),
    onNone: () => noTags,
  }))
}

const nodeForCommentOf = (node: ts.Node): ts.Node =>
  Match.value(node).pipe(
    Match.when(ts.isVariableDeclaration, (declaration) =>
      Option.getOrElse(
        Option.map(
          Option.filter(
            Option.fromUndefinedOr(
              TypeScriptHelpers.findFirstParent<ts.VariableStatement>(declaration, ts.SyntaxKind.VariableStatement),
            ),
            (statement) => statement.declarationList.declarations.length === 1,
          ),
          (statement) => statement,
        ),
        () => node,
      )),
    Match.orElse(() => node),
  )

const parsedWithoutContext = (log: MessageLog): readonly [MessageLog, Option.Option<tsdoc.ParserContext>] => [
  log,
  Option.none(),
]

const parsedWithContext = (
  log: MessageLog,
  parserContext: tsdoc.ParserContext,
  declarationId: NodeId,
  sourceFile: ts.SourceFile,
): readonly [MessageLog, Option.Option<tsdoc.ParserContext>] => [
  MessageLog.addTsdocMessages(log, parserContext, sourceFile, Option.some(declarationId)),
  Option.some(parserContext),
]

export const parseTsdocForDeclaration = dual<
  (
    log: MessageLog,
    node: Option.Option<ts.Node>,
    declarationId: NodeId,
  ) => (parser: tsdoc.TSDocParser) => readonly [MessageLog, Option.Option<tsdoc.ParserContext>],
  (
    parser: tsdoc.TSDocParser,
    log: MessageLog,
    node: Option.Option<ts.Node>,
    declarationId: NodeId,
  ) => readonly [MessageLog, Option.Option<tsdoc.ParserContext>]
>(4, (
  parser: tsdoc.TSDocParser,
  log: MessageLog,
  node: Option.Option<ts.Node>,
  declarationId: NodeId,
): readonly [MessageLog, Option.Option<tsdoc.ParserContext>] =>
  Option.match(node, {
    onNone: () => parsedWithoutContext(log),
    onSome: (foundNode) => {
      const nodeForComment = nodeForCommentOf(foundNode)
      const sourceFile = nodeForComment.getSourceFile()
      const ranges = Option.getOrElse(
        Option.fromNullishOr(TypeScriptInternals.getJSDocCommentRanges(nodeForComment, sourceFile.text)),
        () => [],
      )
      return Option.match(Arr.last(ranges), {
        onNone: () => parsedWithoutContext(log),
        onSome: (range) => {
          const parserContext = parser.parseRange(
            tsdoc.TextRange.fromStringRange(sourceFile.text, range.pos, range.end),
          )
          return parsedWithContext(log, parserContext, declarationId, sourceFile)
        },
      })
    },
  }))

export const setterDeclarationIdsOf = dual<
  (astSymbol: AstSymbol) => (graph: AnalysisGraph) => ReadonlyArray<NodeId>,
  (graph: AnalysisGraph, astSymbol: AstSymbol) => ReadonlyArray<NodeId>
>(2, (graph: AnalysisGraph, astSymbol: AstSymbol): ReadonlyArray<NodeId> =>
  Arr.filter(
    Chunk.toReadonlyArray(astSymbol.declarationIds),
    (declarationId) =>
      Option.exists(nodeValueOf(graph, declarationId), (node) => node.kind === ts.SyntaxKind.SetAccessor),
  ))

export const getterDeclarationIdsOf = dual<
  (astSymbol: AstSymbol) => (graph: AnalysisGraph) => ReadonlyArray<NodeId>,
  (graph: AnalysisGraph, astSymbol: AstSymbol) => ReadonlyArray<NodeId>
>(2, (graph: AnalysisGraph, astSymbol: AstSymbol): ReadonlyArray<NodeId> =>
  Arr.filter(
    Chunk.toReadonlyArray(astSymbol.declarationIds),
    (declarationId) =>
      Option.exists(nodeValueOf(graph, declarationId), (node) => node.kind === ts.SyntaxKind.GetAccessor),
  ))

export const sameSymbolDeclarations = dual<
  (ancillaryDeclaration: AstDeclaration) => (mainDeclaration: AstDeclaration) => boolean,
  (mainDeclaration: AstDeclaration, ancillaryDeclaration: AstDeclaration) => boolean
>(
  2,
  (mainDeclaration: AstDeclaration, ancillaryDeclaration: AstDeclaration): boolean =>
    mainDeclaration.astSymbolId === ancillaryDeclaration.astSymbolId,
)

export const bothFreshDeclarations = dual<
  (ancillaryMetadata: DeclarationMetadata) => (mainMetadata: DeclarationMetadata) => boolean,
  (mainMetadata: DeclarationMetadata, ancillaryMetadata: DeclarationMetadata) => boolean
>(
  2,
  (mainMetadata: DeclarationMetadata, ancillaryMetadata: DeclarationMetadata): boolean =>
    !mainMetadata.isAncillary && !ancillaryMetadata.isAncillary,
)

export const bothEligible = dual<
  (fresh: boolean) => (sameSymbol: boolean) => boolean,
  (sameSymbol: boolean, fresh: boolean) => boolean
>(2, (sameSymbol: boolean, fresh: boolean): boolean => sameSymbol && fresh)

export const apiItemsNotBuilt = dual<
  (mainDeclarationId: NodeId, ancillaryDeclarationId: NodeId) => (store: ApiItemMetadataStore) => boolean,
  (store: ApiItemMetadataStore, mainDeclarationId: NodeId, ancillaryDeclarationId: NodeId) => boolean
>(
  3,
  (store: ApiItemMetadataStore, mainDeclarationId: NodeId, ancillaryDeclarationId: NodeId): boolean =>
    !HashMap.has(store.apiItemMetadata, mainDeclarationId) &&
    !HashMap.has(store.apiItemMetadata, ancillaryDeclarationId),
)

export const withAncillaryPair = dual<
  (
    mainDeclarationId: NodeId,
    ancillaryDeclarationId: NodeId,
    mainMetadata: DeclarationMetadata,
    ancillaryMetadata: DeclarationMetadata,
  ) => (
    declarationMetadata: HashMap.HashMap<NodeId, DeclarationMetadata>,
  ) => HashMap.HashMap<NodeId, DeclarationMetadata>,
  (
    declarationMetadata: HashMap.HashMap<NodeId, DeclarationMetadata>,
    mainDeclarationId: NodeId,
    ancillaryDeclarationId: NodeId,
    mainMetadata: DeclarationMetadata,
    ancillaryMetadata: DeclarationMetadata,
  ) => HashMap.HashMap<NodeId, DeclarationMetadata>
>(5, (
  declarationMetadata: HashMap.HashMap<NodeId, DeclarationMetadata>,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): HashMap.HashMap<NodeId, DeclarationMetadata> =>
  HashMap.set(
    HashMap.set(
      declarationMetadata,
      mainDeclarationId,
      new DeclarationMetadata({
        tsdocParserContext: mainMetadata.tsdocParserContext,
        isAncillary: mainMetadata.isAncillary,
        ancillaryDeclarationIds: Chunk.append(mainMetadata.ancillaryDeclarationIds, ancillaryDeclarationId),
      }),
    ),
    ancillaryDeclarationId,
    new DeclarationMetadata({
      tsdocParserContext: ancillaryMetadata.tsdocParserContext,
      isAncillary: true,
      ancillaryDeclarationIds: ancillaryMetadata.ancillaryDeclarationIds,
    }),
  ))
