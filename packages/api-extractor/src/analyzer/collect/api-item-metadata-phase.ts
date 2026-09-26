import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'
import * as ts from 'typescript'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import { VisitorState } from '../../collector/VisitorState.js'
import type { ExtractorError } from '../../errors/index.js'
import { ReleaseTag } from '../../model/index.js'
import { astSymbolOfId } from '../graph/analysis-graph.js'
import type { AnalysisGraph, AnalysisRef } from '../graph/analysis-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import { type AstEntityRef, AstSymbolRef } from '../graph/ast-entity.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { ApiItemMetadata } from './api-item-metadata.js'
import { requireAstDeclaration, requireAstSymbol, requireNode } from './collect-lookups.js'
import { type CollectState, type EffectiveRelease, type ModifiersResolved, viewsOf } from './collect-state.js'
import { consumableOf } from './collector-entity.js'
import {
  calculateDeclarationMetadataForDeclarations,
  requireApiItemMetadata,
  requireDeclarationMetadata,
} from './declaration-metadata-phase.js'
import type { DeclarationMetadata } from './declaration-metadata.js'
import { issueForDeclaration, issueForSymbol } from './declaration-scan.js'
import { fromParsedDocComment } from './effective-doc-comment.js'
import {
  customBlockTagNamesOf,
  deprecatedFlagOf,
  emptyModifierDraft,
  maxReleaseTag,
  modifierTagNamesOf,
} from './metadata-helpers.js'
import { scanModifiers } from './modifier-scan.js'
import { SymbolMetadata } from './symbol-metadata.js'

const fetchApiItemMetadataInto = (
  graph: AnalysisGraph,
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  declarationId: NodeId,
): Effect.Effect<readonly [CollectState, ApiItemMetadata], ExtractorError> =>
  Match.value(HashMap.has(state.apiItemMetadata, declarationId)).pipe(
    Match.when(true, () =>
      Effect.map(requireApiItemMetadata(state, declarationId), (metadata) => {
        const found: readonly [CollectState, ApiItemMetadata] = [state, metadata]
        return found
      })),
    Match.when(
      false,
      () =>
        Effect.flatMap(requireAstDeclaration(graph, declarationId), (astDeclaration) =>
          Effect.flatMap(
            fetchSymbolMetadataInto(ref, parser, state, astDeclaration.astSymbolId),
            (nextState) =>
              Effect.map(requireApiItemMetadata(nextState, declarationId), (metadata) => {
                const found: readonly [CollectState, ApiItemMetadata] = [nextState, metadata]
                return found
              }),
          )),
    ),
    Match.exhaustive,
  )

const missingReleaseTagGate = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.gen(function*() {
    const astSymbol = yield* requireAstSymbol(graph, astDeclaration.astSymbolId)
    const rootSymbol = yield* requireAstSymbol(graph, astSymbol.rootAstSymbolId)
    const rootRef: AstEntityRef = new AstSymbolRef({ symbolId: astSymbol.rootAstSymbolId })
    const entity = HashMap.get(state.entityByRef, rootRef)
    const consumable = consumableOf(viewsOf(state), rootRef)
    const includeForgotten =
      Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.apiReport.includeForgottenExports), () => false) ||
      Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.docModel.includeForgottenExports), () => false)
    const gated = Match.value(Option.isSome(entity)).pipe(
      Match.when(false, () => false),
      Match.when(true, () => consumable || includeForgotten),
      Match.exhaustive,
    )
    const emitted = Match.value(gated).pipe(
      Match.when(false, () => false),
      Match.when(true, () => rootSymbol.localName !== '_default'),
      Match.exhaustive,
    )
    const entityLocalName = Option.match(entity, {
      onNone: () => '',
      onSome: (view) => view.localName,
    })
    return yield* Match.value(emitted).pipe(
      Match.when(false, () => Effect.succeed(state)),
      Match.when(true, () =>
        issueForSymbol(
          state,
          graph,
          ExtractorMessageId.MissingReleaseTag,
          '"'.concat(entityLocalName, '" is part of the package\'s API, but it is missing ') +
            'a release tag (@alpha, @beta, @public, or @internal)',
          astDeclaration.astSymbolId,
          undefined,
        )),
      Match.exhaustive,
    )
  })

const mainApiItemPhase = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  declarationMetadata: DeclarationMetadata,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.gen(function*() {
    const scanned: ModifiersResolved = yield* Option.match(declarationMetadata.tsdocParserContext, {
      onSome: (parserContext) => scanModifiers(state, graph, astDeclaration, parserContext),
      onNone: () => {
        const unresolved: ModifiersResolved = { state, draft: emptyModifierDraft }
        return Effect.succeed(unresolved)
      },
    })
    const effective: EffectiveRelease = yield* Option.match(astDeclaration.parentDeclarationId, {
      onSome: (parentDeclarationId) =>
        Effect.map(fetchApiItemMetadataInto(graph, ref, parser, scanned.state, parentDeclarationId), (fetched) => {
          const effectiveReleaseTag = Match.value(scanned.draft.declaredReleaseTag === ReleaseTag.None).pipe(
            Match.when(true, () => fetched[1].effectiveReleaseTag),
            Match.when(false, () => scanned.draft.declaredReleaseTag),
            Match.exhaustive,
          )
          return {
            state: fetched[0],
            effectiveReleaseTag,
            releaseTagSameAsParent: fetched[1].effectiveReleaseTag === effectiveReleaseTag,
          }
        }),
      onNone: () =>
        Effect.succeed<EffectiveRelease>({
          state: scanned.state,
          effectiveReleaseTag: scanned.draft.declaredReleaseTag,
          releaseTagSameAsParent: false,
        }),
    })
    const isExternalSymbol = Option.getOrElse(
      Option.map(astSymbolOfId(graph, astDeclaration.astSymbolId), (astSymbol) => astSymbol.isExternal),
      () => false,
    )
    const missingTagState: CollectState = yield* Match.value(
      effective.effectiveReleaseTag === ReleaseTag.None,
    ).pipe(
      Match.when(true, () =>
        Match.value(!isExternalSymbol).pipe(
          Match.when(true, () => missingReleaseTagGate(effective.state, graph, astDeclaration)),
          Match.when(false, () => Effect.succeed(effective.state)),
          Match.exhaustive,
        )),
      Match.when(false, () => Effect.succeed(effective.state)),
      Match.exhaustive,
    )
    const publicizedEffectiveReleaseTag = Match.value(effective.effectiveReleaseTag === ReleaseTag.None).pipe(
      Match.when(true, () => ReleaseTag.Public),
      Match.when(false, () => effective.effectiveReleaseTag),
      Match.exhaustive,
    )
    const apiItemMetadata = new ApiItemMetadata({
      declaredReleaseTag: scanned.draft.declaredReleaseTag,
      effectiveReleaseTag: publicizedEffectiveReleaseTag,
      releaseTagSameAsParent: effective.releaseTagSameAsParent,
      isEventProperty: scanned.draft.isEventProperty,
      isOverride: scanned.draft.isOverride,
      isSealed: scanned.draft.isSealed,
      isVirtual: scanned.draft.isVirtual,
      isPreapproved: scanned.draft.isPreapproved,
      deprecated: deprecatedFlagOf(declarationMetadata.tsdocParserContext),
      customBlockTagNames: customBlockTagNamesOf(declarationMetadata.tsdocParserContext),
      modifierTagNames: modifierTagNamesOf(declarationMetadata.tsdocParserContext),
      tsdocComment: Option.map(declarationMetadata.tsdocParserContext, (context) =>
        fromParsedDocComment(context.docComment)),
      undocumented: true,
      docCommentEnhancerVisitorState: VisitorState.Unvisited,
    })
    return {
      ...missingTagState,
      apiItemMetadata: Arr.reduce(
        Chunk.toReadonlyArray(declarationMetadata.ancillaryDeclarationIds),
        HashMap.set(missingTagState.apiItemMetadata, astDeclaration.declarationId, apiItemMetadata),
        (map, ancillaryId) =>
          HashMap.set(map, ancillaryId, apiItemMetadata),
      ),
    }
  })

const ancillaryApiItemPhase = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  declarationMetadata: DeclarationMetadata,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.map(
    requireNode(graph, astDeclaration.declarationId),
    (node) =>
      Match.value(node.kind === ts.SyntaxKind.SetAccessor && Option.isSome(declarationMetadata.tsdocParserContext))
        .pipe(
          Match.when(true, () => {
            const setterSymbolLocalName = Option.getOrElse(
              Option.flatMap(astSymbolOfId(graph, astDeclaration.astSymbolId), (astSymbol) =>
                Option.some(astSymbol.localName)),
              () =>
                '',
            )
            return issueForDeclaration(
              state,
              graph,
              ExtractorMessageId.SetterWithDocs,
              'The doc comment for the property "'.concat(setterSymbolLocalName, '"') +
                ' must appear on the getter, not the setter.',
              astDeclaration.declarationId,
              undefined,
            )
          }),
          Match.when(false, () => state),
          Match.exhaustive,
        ),
  )

const calculateApiItemMetadata = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  declarationId: NodeId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Effect.flatMap(requireAstDeclaration(graph, declarationId), (astDeclaration) =>
        Effect.flatMap(requireDeclarationMetadata(state, declarationId), (declarationMetadata) =>
          Match.value(declarationMetadata.isAncillary).pipe(
            Match.when(true, () =>
              ancillaryApiItemPhase(state, graph, astDeclaration, declarationMetadata)),
            Match.when(false, () =>
              mainApiItemPhase(ref, parser, state, graph, astDeclaration, declarationMetadata)),
            Match.exhaustive,
          ))),
  )

const calculateApiItemMetadataForDeclarations = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  symbolId: SymbolId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) => {
      const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
      return Arr.reduce(
        Chunk.toReadonlyArray(astSymbol.declarationIds),
        zero,
        (accumulated, declarationId) =>
          Effect.flatMap(accumulated, (current) => calculateApiItemMetadata(ref, parser, current, declarationId)),
      )
    }))

const storeSymbolMetadata = (
  graph: AnalysisGraph,
  state: CollectState,
  symbolId: SymbolId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) => {
    const zero: Effect.Effect<ReleaseTag, ExtractorError> = Effect.succeed(ReleaseTag.None)
    return Effect.map(
      Arr.reduce(
        Chunk.toReadonlyArray(astSymbol.declarationIds),
        zero,
        (accumulated, declarationId) =>
          Effect.flatMap(accumulated, (max) =>
            Effect.map(requireApiItemMetadata(state, declarationId), (metadata) =>
              maxReleaseTag(max, metadata.effectiveReleaseTag))),
      ),
      (maxEffectiveReleaseTag) => ({
        ...state,
        symbolMetadata: HashMap.set(
          state.symbolMetadata,
          symbolId,
          new SymbolMetadata({ maxEffectiveReleaseTag }),
        ),
        symbolMetadataDone: HashSet.add(state.symbolMetadataDone, symbolId),
      }),
    )
  })

export const fetchSymbolMetadataInto = dual<
  (
    parser: tsdoc.TSDocParser,
    state: CollectState,
    symbolId: SymbolId,
  ) => (ref: AnalysisRef) => Effect.Effect<CollectState, ExtractorError>,
  (
    ref: AnalysisRef,
    parser: tsdoc.TSDocParser,
    state: CollectState,
    symbolId: SymbolId,
  ) => Effect.Effect<CollectState, ExtractorError>
>(4, (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  symbolId: SymbolId,
): Effect.Effect<CollectState, ExtractorError> =>
  Match.value(HashSet.has(state.symbolMetadataDone, symbolId)).pipe(
    Match.when(true, () => Effect.succeed(state)),
    Match.when(false, () =>
      Effect.flatMap(Ref.get(ref), (graph) =>
        Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) =>
          Effect.gen(function*() {
            const withParent = yield* Option.match(astSymbol.parentAstSymbolId, {
              onSome: (parentSymbolId) =>
                fetchSymbolMetadataInto(ref, parser, state, parentSymbolId),
              onNone: () =>
                Effect.succeed(state),
            })
            const withDeclarations = yield* calculateDeclarationMetadataForDeclarations(
              ref,
              parser,
              withParent,
              symbolId,
            )
            const withApiItems = yield* calculateApiItemMetadataForDeclarations(ref, parser, withDeclarations, symbolId)
            const nextGraph = yield* Ref.get(ref)
            return yield* storeSymbolMetadata(nextGraph, withApiItems, symbolId)
          })))),
    Match.exhaustive,
  ))
