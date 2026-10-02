import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import { astSymbolOfId } from '../graph/analysis-graph.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import type { NodeId } from '../TypeScriptInternals.js'
import type { CollectedAnalysis } from './collect-analysis.js'
import { DeclarationMetadata } from './declaration-metadata.js'
import { declarationOf, issueForDeclaration, nodeOf } from './enhancement-view.js'
import {
  apiItemsNotBuilt,
  bothEligible,
  bothFreshDeclarations,
  getterDeclarationIdsOf,
  parseTsdocForDeclaration,
  sameSymbolDeclarations,
  setterDeclarationIdsOf,
  withAncillaryPair,
} from './metadata-helpers.js'

const ancillaryEligible = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): boolean => {
  const fresh = bothFreshDeclarations(mainMetadata, ancillaryMetadata) &&
    apiItemsNotBuilt(collected, mainDeclarationId, ancillaryDeclarationId)
  const sameSymbol = Option.match(declarationOf(graph, mainDeclarationId), {
    onNone: () => false,
    onSome: (mainDeclaration) =>
      Option.exists(
        declarationOf(graph, ancillaryDeclarationId),
        (ancillaryDeclaration) => sameSymbolDeclarations(mainDeclaration, ancillaryDeclaration),
      ),
  })
  return bothEligible(sameSymbol, fresh)
}

const wireAncillaryPair = (
  collected: CollectedAnalysis,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): CollectedAnalysis => ({
  ...collected,
  declarationMetadata: withAncillaryPair(
    collected.declarationMetadata,
    mainDeclarationId,
    ancillaryDeclarationId,
    mainMetadata,
    ancillaryMetadata,
  ),
})

const addAncillaryDeclaration = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
): CollectedAnalysis =>
  Option.match(HashMap.get(collected.declarationMetadata, mainDeclarationId), {
    onNone: () => collected,
    onSome: (mainMetadata) =>
      Option.match(HashMap.get(collected.declarationMetadata, ancillaryDeclarationId), {
        onNone: () => collected,
        onSome: (ancillaryMetadata) => {
          const alreadyAdded = Chunk.toReadonlyArray(mainMetadata.ancillaryDeclarationIds)
            .includes(ancillaryDeclarationId)
          const eligible = ancillaryEligible(
            collected,
            graph,
            mainDeclarationId,
            ancillaryDeclarationId,
            mainMetadata,
            ancillaryMetadata,
          )
          return Match.value(alreadyAdded).pipe(
            Match.when(true, () => collected),
            Match.when(false, () =>
              Match.value(eligible).pipe(
                Match.when(true, () =>
                  wireAncillaryPair(
                    collected,
                    mainDeclarationId,
                    ancillaryDeclarationId,
                    mainMetadata,
                    ancillaryMetadata,
                  )),
                Match.when(false, () => collected),
                Match.exhaustive,
              )),
            Match.exhaustive,
          )
        },
      }),
  })

const wireAncillaryGetters = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
  setterId: NodeId,
): CollectedAnalysis =>
  Arr.reduce(
    getterDeclarationIdsOf(graph, astSymbol),
    collected,
    (current, getterId) => addAncillaryDeclaration(current, graph, getterId, setterId),
  )

const detectAncillaryForSetter = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
  setterId: NodeId,
): CollectedAnalysis =>
  Match.value(getterDeclarationIdsOf(graph, astSymbol).length > 0).pipe(
    Match.when(true, () => wireAncillaryGetters(collected, graph, astSymbol, setterId)),
    Match.when(false, () => {
      const setterLocalName = Option.getOrElse(
        Option.flatMap(
          Option.flatMap(
            declarationOf(graph, setterId),
            (setterDeclaration) => astSymbolOfId(graph, setterDeclaration.astSymbolId),
          ),
          (setterSymbol) => Option.some(setterSymbol.localName),
        ),
        () => '',
      )
      return issueForDeclaration(
        collected,
        graph,
        ExtractorMessageId.MissingGetter,
        'The property "'.concat(setterLocalName, '" has a setter but no getter.'),
        setterId,
        undefined,
      )
    }),
    Match.exhaustive,
  )

const detectAncillaryDeclarations = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
): CollectedAnalysis =>
  Arr.reduce(
    setterDeclarationIdsOf(graph, astSymbol),
    collected,
    (current, setterId) => detectAncillaryForSetter(current, graph, astSymbol, setterId),
  )

export const calculateDeclarationMetadataForDeclarations = dual<
  (
    collected: CollectedAnalysis,
    graph: AnalysisGraph,
    astSymbol: AstSymbol,
  ) => (parser: tsdoc.TSDocParser) => CollectedAnalysis,
  (
    parser: tsdoc.TSDocParser,
    collected: CollectedAnalysis,
    graph: AnalysisGraph,
    astSymbol: AstSymbol,
  ) => CollectedAnalysis
>(4, (
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
): CollectedAnalysis => {
  const parsed = Arr.reduce(
    Chunk.toReadonlyArray(astSymbol.declarationIds),
    collected,
    (current, declarationId) => {
      const parsedPair = parseTsdocForDeclaration(
        parser,
        current.messageLog,
        nodeOf(graph, declarationId),
        declarationId,
      )
      return {
        ...current,
        messageLog: parsedPair[0],
        declarationMetadata: HashMap.set(
          current.declarationMetadata,
          declarationId,
          new DeclarationMetadata({
            tsdocParserContext: parsedPair[1],
            isAncillary: false,
            ancillaryDeclarationIds: Chunk.empty(),
          }),
        ),
      }
    },
  )
  return detectAncillaryDeclarations(parsed, graph, astSymbol)
})
