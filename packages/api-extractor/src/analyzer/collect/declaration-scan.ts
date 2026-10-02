import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'

import { type ExtractorMessageProperties, MessageLog } from '../../collector/message-log.js'
import type { ExtractorError } from '../../errors/index.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import { nodeValueOf } from '../graph/analysis-graph.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { requireAstSymbol, requireNode } from './collect-lookups.js'
import type { CollectState } from './collect-state.js'
import { parseTsdocForDeclaration as parseTsdocForDeclarationAt } from './metadata-helpers.js'

export const issueForDeclaration = dual<
  (
    graph: AnalysisGraph,
    messageId: string,
    messageText: string,
    declarationId: NodeId,
    properties?: ExtractorMessageProperties,
  ) => (state: CollectState) => CollectState,
  (
    state: CollectState,
    graph: AnalysisGraph,
    messageId: string,
    messageText: string,
    declarationId: NodeId,
    properties?: ExtractorMessageProperties,
  ) => CollectState
>(6, (
  state: CollectState,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  declarationId: NodeId,
  properties?: ExtractorMessageProperties,
): CollectState =>
  Option.match(nodeValueOf(graph, declarationId), {
    onNone: () => state,
    onSome: (node) => ({
      ...state,
      log: MessageLog.addAnalyzerIssue(
        state.log,
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
    properties?: ExtractorMessageProperties,
  ) => (state: CollectState) => Effect.Effect<CollectState, ExtractorError>,
  (
    state: CollectState,
    graph: AnalysisGraph,
    messageId: string,
    messageText: string,
    symbolId: SymbolId,
    properties?: ExtractorMessageProperties,
  ) => Effect.Effect<CollectState, ExtractorError>
>(6, (
  state: CollectState,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  symbolId: SymbolId,
  properties?: ExtractorMessageProperties,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.map(
    requireAstSymbol(graph, symbolId),
    (astSymbol) =>
      Option.match(Arr.head(Chunk.toReadonlyArray(astSymbol.declarationIds)), {
        onNone: () => state,
        onSome: (firstDeclarationId) =>
          issueForDeclaration(state, graph, messageId, messageText, firstDeclarationId, properties),
      }),
  ))

export const parseTsdocForDeclaration = dual<
  (
    log: MessageLog,
    graph: AnalysisGraph,
    declarationId: NodeId,
  ) => (parser: tsdoc.TSDocParser) => Effect.Effect<
    readonly [MessageLog, Option.Option<tsdoc.ParserContext>],
    ExtractorError
  >,
  (
    parser: tsdoc.TSDocParser,
    log: MessageLog,
    graph: AnalysisGraph,
    declarationId: NodeId,
  ) => Effect.Effect<readonly [MessageLog, Option.Option<tsdoc.ParserContext>], ExtractorError>
>(4, (
  parser: tsdoc.TSDocParser,
  log: MessageLog,
  graph: AnalysisGraph,
  declarationId: NodeId,
): Effect.Effect<readonly [MessageLog, Option.Option<tsdoc.ParserContext>], ExtractorError> =>
  Effect.map(
    requireNode(graph, declarationId),
    (node) => parseTsdocForDeclarationAt(parser, log, Option.some(node), declarationId),
  ))
