import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import type { ExtractorError } from '../../errors/index.js'
import type { AnalysisGraph, AnalysisRef } from '../graph/analysis-graph.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import type { ApiItemMetadata } from './api-item-metadata.js'
import { requireAstDeclaration, requireAstSymbol } from './collect-lookups.js'
import { type CollectState, invariantDefect, type MetadataState } from './collect-state.js'
import { DeclarationMetadata } from './declaration-metadata.js'
import { issueForDeclaration, parseTsdocForDeclaration } from './declaration-scan.js'
import {
  apiItemsNotBuilt,
  bothEligible,
  bothFreshDeclarations,
  getterDeclarationIdsOf,
  sameSymbolDeclarations,
  setterDeclarationIdsOf,
  withAncillaryPair,
} from './metadata-helpers.js'

export const requireDeclarationMetadata = dual<
  (declarationId: NodeId) => (state: MetadataState) => Effect.Effect<DeclarationMetadata, ExtractorError>,
  (state: MetadataState, declarationId: NodeId) => Effect.Effect<DeclarationMetadata, ExtractorError>
>(
  2,
  (state: MetadataState, declarationId: NodeId): Effect.Effect<DeclarationMetadata, ExtractorError> =>
    Option.match(HashMap.get(state.declarationMetadata, declarationId), {
      onSome: (metadata) => Effect.succeed(metadata),
      onNone: () => Effect.die(invariantDefect('Missing DeclarationMetadata for the declaration id ' + declarationId)),
    }),
)

export const requireApiItemMetadata = dual<
  (declarationId: NodeId) => (state: MetadataState) => Effect.Effect<ApiItemMetadata, ExtractorError>,
  (state: MetadataState, declarationId: NodeId) => Effect.Effect<ApiItemMetadata, ExtractorError>
>(
  2,
  (state: MetadataState, declarationId: NodeId): Effect.Effect<ApiItemMetadata, ExtractorError> =>
    Option.match(HashMap.get(state.apiItemMetadata, declarationId), {
      onSome: (metadata) => Effect.succeed(metadata),
      onNone: () => Effect.die(invariantDefect('Missing ApiItemMetadata for the declaration id ' + declarationId)),
    }),
)

const ancillaryEligible = (
  state: CollectState,
  graph: AnalysisGraph,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): Effect.Effect<boolean, ExtractorError> => {
  const fresh = bothFreshDeclarations(mainMetadata, ancillaryMetadata) &&
    apiItemsNotBuilt(state, mainDeclarationId, ancillaryDeclarationId)
  return Effect.map(
    Effect.flatMap(
      requireAstDeclaration(graph, mainDeclarationId),
      (mainDeclaration) =>
        Effect.map(
          requireAstDeclaration(graph, ancillaryDeclarationId),
          (ancillaryDeclaration) => sameSymbolDeclarations(mainDeclaration, ancillaryDeclaration),
        ),
    ),
    (sameSymbol) => bothEligible(sameSymbol, fresh),
  )
}

const wireAncillaryPair = (
  state: CollectState,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.succeed({
    ...state,
    declarationMetadata: withAncillaryPair(
      state.declarationMetadata,
      mainDeclarationId,
      ancillaryDeclarationId,
      mainMetadata,
      ancillaryMetadata,
    ),
  })

const addAncillaryDeclaration = (
  state: CollectState,
  graph: AnalysisGraph,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.gen(function*() {
    const mainMetadata = yield* requireDeclarationMetadata(state, mainDeclarationId)
    const ancillaryMetadata = yield* requireDeclarationMetadata(state, ancillaryDeclarationId)
    const alreadyAdded = Chunk.toReadonlyArray(mainMetadata.ancillaryDeclarationIds).includes(ancillaryDeclarationId)
    const eligible = yield* ancillaryEligible(
      state,
      graph,
      mainDeclarationId,
      ancillaryDeclarationId,
      mainMetadata,
      ancillaryMetadata,
    )
    return yield* Match.value(alreadyAdded).pipe(
      Match.when(true, () => Effect.succeed(state)),
      Match.when(false, () =>
        Match.value(eligible).pipe(
          Match.when(
            true,
            () => wireAncillaryPair(state, mainDeclarationId, ancillaryDeclarationId, mainMetadata, ancillaryMetadata),
          ),
          Match.when(false, () =>
            Effect.die(invariantDefect(
              'Invalid call to _addAncillaryDeclaration() because the declarations are not eligible',
            ))),
          Match.exhaustive,
        )),
      Match.exhaustive,
    )
  })

const wireAncillaryGetters = (
  state: CollectState,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
  setterId: NodeId,
): Effect.Effect<CollectState, ExtractorError> => {
  const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
  return Arr.reduce(
    getterDeclarationIdsOf(graph, astSymbol),
    zero,
    (accumulated, getterId) =>
      Effect.flatMap(accumulated, (current) => addAncillaryDeclaration(current, graph, getterId, setterId)),
  )
}

const detectAncillaryForSetter = (
  state: CollectState,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
  setterId: NodeId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(
    requireAstDeclaration(graph, setterId),
    (setterDeclaration) =>
      Effect.flatMap(requireAstSymbol(graph, setterDeclaration.astSymbolId), (setterSymbol) => {
        const withGetter = Match.value(getterDeclarationIdsOf(graph, astSymbol).length > 0).pipe(
          Match.when(true, () => wireAncillaryGetters(state, graph, astSymbol, setterId)),
          Match.when(false, () =>
            Effect.succeed(issueForDeclaration(
              state,
              graph,
              ExtractorMessageId.MissingGetter,
              'The property "'.concat(setterSymbol.localName, '" has a setter but no getter.'),
              setterId,
              undefined,
            ))),
          Match.exhaustive,
        )
        return withGetter
      }),
  )

const detectAncillaryDeclarations = (
  state: CollectState,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
): Effect.Effect<CollectState, ExtractorError> => {
  const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
  return Arr.reduce(
    setterDeclarationIdsOf(graph, astSymbol),
    zero,
    (accumulated, setterId) =>
      Effect.flatMap(accumulated, (current) => detectAncillaryForSetter(current, graph, astSymbol, setterId)),
  )
}

export const calculateDeclarationMetadataForDeclarations = dual<
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
  Effect.flatMap(Ref.get(ref), (graph) =>
    Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) => {
      const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
      return Effect.flatMap(
        Arr.reduce(
          Chunk.toReadonlyArray(astSymbol.declarationIds),
          zero,
          (accumulated, declarationId) =>
            Effect.flatMap(accumulated, (current) =>
              Effect.map(parseTsdocForDeclaration(parser, current.log, graph, declarationId), (parsed) => ({
                ...current,
                log: parsed[0],
                declarationMetadata: HashMap.set(
                  current.declarationMetadata,
                  declarationId,
                  new DeclarationMetadata({
                    tsdocParserContext: parsed[1],
                    isAncillary: false,
                    ancillaryDeclarationIds: Chunk.empty(),
                  }),
                ),
              }))),
        ),
        (parsedState) =>
          detectAncillaryDeclarations(parsedState, graph, astSymbol),
      )
    })))
