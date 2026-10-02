import type * as tsdoc from '@microsoft/tsdoc'
import { HashSet, Option } from 'effect'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import type { ExtractorError } from '../../errors/index.js'
import { ReleaseTag } from '../../model/index.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import { requireAstSymbol, requireNode } from './collect-lookups.js'
import { type CollectState, type ModifiersResolved } from './collect-state.js'
import { issueForDeclaration, issueForSymbol } from './declaration-scan.js'
import { type ModifierDraft, preapprovedContainerKinds, releaseScanOf } from './metadata-helpers.js'

const resolveOf = (state: CollectState, draft: ModifierDraft): ModifiersResolved => ({ state, draft })

const preapprovedForContainer = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  declaredInternal: boolean,
  draft: ModifierDraft,
): Effect.Effect<ModifiersResolved, ExtractorError> =>
  Match.value(declaredInternal).pipe(
    Match.when(true, () => {
      const preapproved: ModifiersResolved = { state, draft: { ...draft, isPreapproved: true } }
      return Effect.succeed<ModifiersResolved>(preapproved)
    }),
    Match.when(false, () =>
      Effect.map(
        issueForSymbol(
          state,
          graph,
          ExtractorMessageId.PreapprovedBadReleaseTag,
          'The @preapproved tag cannot be applied to "'.concat(localName, '"') +
            ' without an @internal release tag',
          astDeclaration.astSymbolId,
          undefined,
        ),
        (nextState) => resolveOf(nextState, draft),
      )),
    Match.exhaustive,
  )

const preapprovedUnsupported = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  draft: ModifierDraft,
): Effect.Effect<ModifiersResolved, ExtractorError> =>
  Effect.succeed(
    resolveOf(
      issueForDeclaration(
        state,
        graph,
        ExtractorMessageId.PreapprovedUnsupportedType,
        'The @preapproved tag cannot be applied to "'.concat(localName, '"') +
          ' because it is not a supported declaration type',
        astDeclaration.declarationId,
        undefined,
      ),
      draft,
    ),
  )

const applyPreapproved = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  declaredInternal: boolean,
  draft: ModifierDraft,
): Effect.Effect<ModifiersResolved, ExtractorError> =>
  Effect.flatMap(
    requireNode(graph, astDeclaration.declarationId),
    (node) =>
      Match.value(HashSet.has(preapprovedContainerKinds, node.kind)).pipe(
        Match.when(
          true,
          () => preapprovedForContainer(state, graph, astDeclaration, localName, declaredInternal, draft),
        ),
        Match.when(false, () => preapprovedUnsupported(state, graph, astDeclaration, localName, draft)),
        Match.exhaustive,
      ),
  )

export const scanModifiers = dual<
  (
    graph: AnalysisGraph,
    astDeclaration: AstDeclaration,
    parserContext: tsdoc.ParserContext,
  ) => (state: CollectState) => Effect.Effect<ModifiersResolved, ExtractorError>,
  (
    state: CollectState,
    graph: AnalysisGraph,
    astDeclaration: AstDeclaration,
    parserContext: tsdoc.ParserContext,
  ) => Effect.Effect<ModifiersResolved, ExtractorError>
>(4, (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  parserContext: tsdoc.ParserContext,
): Effect.Effect<ModifiersResolved, ExtractorError> => {
  const modifierTagSet = parserContext.docComment.modifierTagSet
  const scan = releaseScanOf(modifierTagSet)
  const draft: ModifierDraft = {
    declaredReleaseTag: scan.declared,
    isEventProperty: modifierTagSet.isEventProperty(),
    isOverride: modifierTagSet.isOverride(),
    isSealed: modifierTagSet.isSealed(),
    isVirtual: modifierTagSet.isVirtual(),
    isPreapproved: false,
  }
  return Effect.flatMap(requireAstSymbol(graph, astDeclaration.astSymbolId), (astSymbol) =>
    Effect.flatMap(
      Match.value(scan.extra && !astSymbol.isExternal).pipe(
        Match.when(true, () =>
          Effect.succeed(
            issueForDeclaration(
              state,
              graph,
              ExtractorMessageId.ExtraReleaseTag,
              'The doc comment should not contain more than one release tag',
              astDeclaration.declarationId,
              undefined,
            ),
          )),
        Match.when(false, () => Effect.succeed(state)),
        Match.exhaustive,
      ),
      (withExtraTags) => {
        const preapprovedTag = graph.tsdocConfiguration.tryGetTagDefinition('@preapproved')
        return Match.value(
          Option.exists(Option.fromNullishOr(preapprovedTag), (tagDefinition) => modifierTagSet.hasTag(tagDefinition)),
        ).pipe(
          Match.when(true, () =>
            applyPreapproved(
              withExtraTags,
              graph,
              astDeclaration,
              astSymbol.localName,
              scan.declared === ReleaseTag.Internal,
              draft,
            )),
          Match.when(false, () => {
            const resolved: ModifiersResolved = { state: withExtraTags, draft }
            return Effect.succeed(resolved)
          }),
          Match.exhaustive,
        )
      },
    ))
})
