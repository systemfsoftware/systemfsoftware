import { HashMap, Option } from 'effect'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import type * as ts from 'typescript'

import type { ExtractorError } from '../../errors/index.js'
import { astDeclarationOfId, astSymbolOfId, nodeValueOf } from '../graph/analysis-graph.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import type { AstEntityRef } from '../graph/ast-entity.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { type CollectState, describeRef, type EntityDraft, invariantDefect } from './collect-state.js'

export const requireAstSymbol = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => Effect.Effect<AstSymbol, ExtractorError>,
  (graph: AnalysisGraph, symbolId: SymbolId) => Effect.Effect<AstSymbol, ExtractorError>
>(
  2,
  (graph: AnalysisGraph, symbolId: SymbolId): Effect.Effect<AstSymbol, ExtractorError> =>
    Option.match(astSymbolOfId(graph, symbolId), {
      onSome: (astSymbol) => Effect.succeed(astSymbol),
      onNone: () => Effect.die(invariantDefect('Missing AstSymbol record for the symbol id ' + symbolId)),
    }),
)

export const requireAstDeclaration = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => Effect.Effect<AstDeclaration, ExtractorError>,
  (graph: AnalysisGraph, declarationId: NodeId) => Effect.Effect<AstDeclaration, ExtractorError>
>(
  2,
  (graph: AnalysisGraph, declarationId: NodeId): Effect.Effect<AstDeclaration, ExtractorError> =>
    Option.match(astDeclarationOfId(graph, declarationId), {
      onSome: (astDeclaration) => Effect.succeed(astDeclaration),
      onNone: () =>
        Effect.die(invariantDefect('Missing AstDeclaration record for the declaration id ' + declarationId)),
    }),
)

export const requireNode = dual<
  (declarationId: NodeId) => (graph: AnalysisGraph) => Effect.Effect<ts.Node, ExtractorError>,
  (graph: AnalysisGraph, declarationId: NodeId) => Effect.Effect<ts.Node, ExtractorError>
>(
  2,
  (graph: AnalysisGraph, declarationId: NodeId): Effect.Effect<ts.Node, ExtractorError> =>
    Option.match(nodeValueOf(graph, declarationId), {
      onSome: (node) => Effect.succeed(node),
      onNone: () => Effect.die(invariantDefect('Missing ts.Node for the declaration id ' + declarationId)),
    }),
)

export const requireEntityDraft = dual<
  (entityRef: AstEntityRef) => (state: CollectState) => Effect.Effect<EntityDraft, ExtractorError>,
  (state: CollectState, entityRef: AstEntityRef) => Effect.Effect<EntityDraft, ExtractorError>
>(
  2,
  (state: CollectState, entityRef: AstEntityRef): Effect.Effect<EntityDraft, ExtractorError> =>
    Option.match(HashMap.get(state.entityByRef, entityRef), {
      onSome: (view) => Effect.succeed(view),
      onNone: () => Effect.die(invariantDefect('Missing CollectorEntity draft for ' + describeRef(entityRef))),
    }),
)
