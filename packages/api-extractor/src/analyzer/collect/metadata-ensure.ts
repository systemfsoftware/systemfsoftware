import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import { VisitorState } from '../../collector/VisitorState.js'
import { ReleaseTag } from '../../model/index.js'
import { astSymbolOfId } from '../graph/analysis-graph.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import { AstSymbolRef } from '../graph/ast-entity.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { ApiItemMetadata } from './api-item-metadata.js'
import type { CollectedAnalysis } from './collect-analysis.js'
import { consumableOf } from './collector-entity.js'
import type { DeclarationMetadata } from './declaration-metadata.js'
import { fromParsedDocComment } from './effective-doc-comment.js'
import {
  apiItemMetadataOf,
  declarationOf,
  includeForgottenExports,
  issueForDeclaration,
  issueForSymbol,
  nodeOf,
} from './enhancement-view.js'
import { calculateDeclarationMetadataForDeclarations } from './ensure-declaration-phase.js'
import { scanModifiers } from './ensure-modifier-phase.js'
import {
  customBlockTagNamesOf,
  deprecatedFlagOf,
  emptyModifierDraft,
  maxReleaseTag,
  modifierTagNamesOf,
} from './metadata-helpers.js'
import { SymbolMetadata } from './symbol-metadata.js'

interface EnsuredMetadata {
  readonly collected: CollectedAnalysis
  readonly metadata: Option.Option<ApiItemMetadata>
}

const missingReleaseTagIssue = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
): CollectedAnalysis => {
  const rootSymbolId = Option.getOrElse(
    Option.map(astSymbolOfId(graph, astDeclaration.astSymbolId), (astSymbol) => astSymbol.rootAstSymbolId),
    () => astDeclaration.astSymbolId,
  )
  const rootRef: AstSymbolRef = new AstSymbolRef({ symbolId: rootSymbolId })
  const entity = HashMap.get(collected.entityByRef, rootRef)
  const consumable = consumableOf((ref) => HashMap.get(collected.entityByRef, ref), rootRef)
  const gated = Match.value(Option.isSome(entity)).pipe(
    Match.when(false, () => false),
    Match.when(true, () => consumable || includeForgottenExports(graph)),
    Match.exhaustive,
  )
  const rootSymbolLocalName = Option.getOrElse(
    Option.map(astSymbolOfId(graph, rootSymbolId), (astSymbol) => astSymbol.localName),
    () => '',
  )
  const emitted = Match.value(gated).pipe(
    Match.when(false, () => false),
    Match.when(true, () => rootSymbolLocalName !== '_default'),
    Match.exhaustive,
  )
  const entityLocalName = Option.match(entity, {
    onNone: () => '',
    onSome: (view) => view.localName,
  })
  return Match.value(emitted).pipe(
    Match.when(false, () => collected),
    Match.when(true, () =>
      issueForSymbol(
        collected,
        graph,
        ExtractorMessageId.MissingReleaseTag,
        '"'.concat(entityLocalName, '" is part of the package\'s API, but it is missing ') +
          'a release tag (@alpha, @beta, @public, or @internal)',
        astDeclaration.astSymbolId,
        undefined,
      )),
    Match.exhaustive,
  )
}

const effectiveForParented = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  astDeclaration: AstDeclaration,
  declaredReleaseTag: ReleaseTag,
): { readonly collected: CollectedAnalysis; readonly effective: ReleaseTag; readonly sameAsParent: boolean } =>
  Option.match(astDeclaration.parentDeclarationId, {
    onSome: (parentDeclarationId) => {
      const parent = ensureApiItemMetadata(collected, graph, parser, parentDeclarationId)
      return Option.match(parent.metadata, {
        onNone: () => ({
          collected: parent.collected,
          effective: declaredReleaseTag,
          sameAsParent: false,
        }),
        onSome: (parentMetadata) => {
          const effective = Match.value(declaredReleaseTag === ReleaseTag.None).pipe(
            Match.when(true, () => parentMetadata.effectiveReleaseTag),
            Match.when(false, () => declaredReleaseTag),
            Match.exhaustive,
          )
          return {
            collected: parent.collected,
            effective,
            sameAsParent: parentMetadata.effectiveReleaseTag === effective,
          }
        },
      })
    },
    onNone: () => ({ collected, effective: declaredReleaseTag, sameAsParent: false }),
  })

const mainApiItemPhase = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  astDeclaration: AstDeclaration,
  declarationMetadata: DeclarationMetadata,
): CollectedAnalysis => {
  const scanned = Option.match(declarationMetadata.tsdocParserContext, {
    onSome: (parserContext) => scanModifiers(collected, graph, astDeclaration, parserContext),
    onNone: () => ({ collected, draft: emptyModifierDraft }),
  })
  const effective = effectiveForParented(
    scanned.collected,
    graph,
    parser,
    astDeclaration,
    scanned.draft.declaredReleaseTag,
  )
  const external = Option.match(astSymbolOfId(graph, astDeclaration.astSymbolId), {
    onNone: () => false,
    onSome: (astSymbol) => astSymbol.isExternal,
  })
  const missingTagState = Match.value(effective.effective === ReleaseTag.None).pipe(
    Match.when(true, () =>
      Match.value(!external).pipe(
        Match.when(true, () => missingReleaseTagIssue(effective.collected, graph, astDeclaration)),
        Match.when(false, () => effective.collected),
        Match.exhaustive,
      )),
    Match.when(false, () => effective.collected),
    Match.exhaustive,
  )
  const publicizedEffectiveReleaseTag = Match.value(effective.effective === ReleaseTag.None).pipe(
    Match.when(true, () => ReleaseTag.Public),
    Match.when(false, () => effective.effective),
    Match.exhaustive,
  )
  const apiItemMetadata = new ApiItemMetadata({
    declaredReleaseTag: scanned.draft.declaredReleaseTag,
    effectiveReleaseTag: publicizedEffectiveReleaseTag,
    releaseTagSameAsParent: effective.sameAsParent,
    isEventProperty: scanned.draft.isEventProperty,
    isOverride: scanned.draft.isOverride,
    isSealed: scanned.draft.isSealed,
    isVirtual: scanned.draft.isVirtual,
    isPreapproved: scanned.draft.isPreapproved,
    deprecated: deprecatedFlagOf(declarationMetadata.tsdocParserContext),
    customBlockTagNames: customBlockTagNamesOf(declarationMetadata.tsdocParserContext),
    modifierTagNames: modifierTagNamesOf(declarationMetadata.tsdocParserContext),
    tsdocComment: Option.map(
      declarationMetadata.tsdocParserContext,
      (context) => fromParsedDocComment(context.docComment),
    ),
    undocumented: true,
    docCommentEnhancerVisitorState: VisitorState.Unvisited,
  })
  return {
    ...missingTagState,
    apiItemMetadata: Arr.reduce(
      Chunk.toReadonlyArray(declarationMetadata.ancillaryDeclarationIds),
      HashMap.set(missingTagState.apiItemMetadata, astDeclaration.declarationId, apiItemMetadata),
      (map, ancillaryId) => HashMap.set(map, ancillaryId, apiItemMetadata),
    ),
  }
}

const ancillaryApiItemPhase = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  declarationMetadata: DeclarationMetadata,
): CollectedAnalysis =>
  Option.match(nodeOf(graph, astDeclaration.declarationId), {
    onNone: () => collected,
    onSome: (node) =>
      Match.value(node.kind === ts.SyntaxKind.SetAccessor && Option.isSome(declarationMetadata.tsdocParserContext))
        .pipe(
          Match.when(true, () => {
            const setterSymbolLocalName = Option.getOrElse(
              Option.map(astSymbolOfId(graph, astDeclaration.astSymbolId), (astSymbol) => astSymbol.localName),
              () => '',
            )
            return issueForDeclaration(
              collected,
              graph,
              ExtractorMessageId.SetterWithDocs,
              'The doc comment for the property "'.concat(setterSymbolLocalName, '"') +
                ' must appear on the getter, not the setter.',
              astDeclaration.declarationId,
              undefined,
            )
          }),
          Match.when(false, () => collected),
          Match.exhaustive,
        ),
  })

const calculateApiItemMetadata = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  declarationId: NodeId,
): CollectedAnalysis =>
  Option.match(declarationOf(graph, declarationId), {
    onNone: () => collected,
    onSome: (astDeclaration) =>
      Option.match(HashMap.get(collected.declarationMetadata, declarationId), {
        onNone: () => collected,
        onSome: (declarationMetadata) =>
          Match.value(declarationMetadata.isAncillary).pipe(
            Match.when(true, () => ancillaryApiItemPhase(collected, graph, astDeclaration, declarationMetadata)),
            Match.when(false, () => mainApiItemPhase(collected, graph, parser, astDeclaration, declarationMetadata)),
            Match.exhaustive,
          ),
      }),
  })

const calculateApiItemMetadataForDeclarations = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  astSymbol: AstSymbol,
): CollectedAnalysis =>
  Arr.reduce(
    Chunk.toReadonlyArray(astSymbol.declarationIds),
    collected,
    (current, declarationId) => calculateApiItemMetadata(current, graph, parser, declarationId),
  )

const storeSymbolMetadata = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
  symbolId: SymbolId,
): CollectedAnalysis => {
  const zeroRelease: ReleaseTag = ReleaseTag.None
  const maxOfDeclaration = (current: ReleaseTag, declarationId: NodeId): ReleaseTag =>
    Option.match(apiItemMetadataOf(collected, declarationId), {
      onNone: () => current,
      onSome: (metadata) => maxReleaseTag(current, metadata.effectiveReleaseTag),
    })
  const maxEffectiveReleaseTag = Arr.reduce(
    Chunk.toReadonlyArray(astSymbol.declarationIds),
    zeroRelease,
    maxOfDeclaration,
  )
  return {
    ...collected,
    symbolMetadata: HashMap.set(
      collected.symbolMetadata,
      symbolId,
      new SymbolMetadata({ maxEffectiveReleaseTag }),
    ),
  }
}

export const ensureSymbolMetadata = dual<
  (
    graph: AnalysisGraph,
    parser: tsdoc.TSDocParser,
    symbolId: SymbolId,
  ) => (collected: CollectedAnalysis) => CollectedAnalysis,
  (
    collected: CollectedAnalysis,
    graph: AnalysisGraph,
    parser: tsdoc.TSDocParser,
    symbolId: SymbolId,
  ) => CollectedAnalysis
>(4, (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  symbolId: SymbolId,
): CollectedAnalysis =>
  Match.value(HashMap.has(collected.symbolMetadata, symbolId)).pipe(
    Match.when(true, () => collected),
    Match.when(false, () =>
      Option.match(astSymbolOfId(graph, symbolId), {
        onNone: () => collected,
        onSome: (astSymbol) => {
          const withParent = Option.match(astSymbol.parentAstSymbolId, {
            onSome: (parentSymbolId) => ensureSymbolMetadata(collected, graph, parser, parentSymbolId),
            onNone: () => collected,
          })
          const withDeclarations = calculateDeclarationMetadataForDeclarations(parser, withParent, graph, astSymbol)
          const withApiItems = calculateApiItemMetadataForDeclarations(withDeclarations, graph, parser, astSymbol)
          return storeSymbolMetadata(withApiItems, graph, astSymbol, symbolId)
        },
      })),
    Match.exhaustive,
  ))

export const ensureApiItemMetadata = dual<
  (
    graph: AnalysisGraph,
    parser: tsdoc.TSDocParser,
    declarationId: NodeId,
  ) => (collected: CollectedAnalysis) => EnsuredMetadata,
  (
    collected: CollectedAnalysis,
    graph: AnalysisGraph,
    parser: tsdoc.TSDocParser,
    declarationId: NodeId,
  ) => EnsuredMetadata
>(4, (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  declarationId: NodeId,
): EnsuredMetadata =>
  Option.match(declarationOf(graph, declarationId), {
    onNone: () => ({ collected, metadata: Option.none() }),
    onSome: (astDeclaration) => {
      const ensured = ensureSymbolMetadata(collected, graph, parser, astDeclaration.astSymbolId)
      return { collected: ensured, metadata: apiItemMetadataOf(ensured, declarationId) }
    },
  }))
