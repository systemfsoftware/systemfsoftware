import type * as tsdoc from '@microsoft/tsdoc'
import { HashSet, Option } from 'effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import { ReleaseTag } from '../../model/index.js'
import { astSymbolOfId } from '../graph/analysis-graph.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import type { CollectedAnalysis } from './collect-analysis.js'
import { issueForDeclaration, issueForSymbol, nodeOf } from './enhancement-view.js'
import { type ModifierDraft, preapprovedContainerKinds, releaseScanOf } from './metadata-helpers.js'

const resolveOf = (collected: CollectedAnalysis, draft: ModifierDraft): ModifierDraft => draft

const preapprovedUnsupported = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
): CollectedAnalysis =>
  issueForDeclaration(
    collected,
    graph,
    ExtractorMessageId.PreapprovedUnsupportedType,
    'The @preapproved tag cannot be applied to "'.concat(localName, '"') +
      ' because it is not a supported declaration type',
    astDeclaration.declarationId,
    undefined,
  )

const preapprovedForContainer = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  declaredInternal: boolean,
  draft: ModifierDraft,
): ModifierDraft =>
  Match.value(declaredInternal).pipe(
    Match.when(true, () => ({ ...draft, isPreapproved: true })),
    Match.when(false, () => {
      const withIssue = issueForSymbol(
        collected,
        graph,
        ExtractorMessageId.PreapprovedBadReleaseTag,
        'The @preapproved tag cannot be applied to "'.concat(localName, '"') +
          ' without an @internal release tag',
        astDeclaration.astSymbolId,
        undefined,
      )
      return resolveOf(withIssue, draft)
    }),
    Match.exhaustive,
  )

const applyPreapproved = (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  declaredInternal: boolean,
  draft: ModifierDraft,
): ModifierDraft =>
  Option.match(nodeOf(graph, astDeclaration.declarationId), {
    onNone: () => draft,
    onSome: (node) =>
      Match.value(HashSet.has(preapprovedContainerKinds, node.kind)).pipe(
        Match.when(
          true,
          () => preapprovedForContainer(collected, graph, astDeclaration, localName, declaredInternal, draft),
        ),
        Match.when(false, () => {
          const withIssue = preapprovedUnsupported(collected, graph, astDeclaration, localName)
          return resolveOf(withIssue, draft)
        }),
        Match.exhaustive,
      ),
  })

export const scanModifiers = dual<
  (
    graph: AnalysisGraph,
    astDeclaration: AstDeclaration,
    parserContext: tsdoc.ParserContext,
  ) => (collected: CollectedAnalysis) => { readonly collected: CollectedAnalysis; readonly draft: ModifierDraft },
  (
    collected: CollectedAnalysis,
    graph: AnalysisGraph,
    astDeclaration: AstDeclaration,
    parserContext: tsdoc.ParserContext,
  ) => { readonly collected: CollectedAnalysis; readonly draft: ModifierDraft }
>(4, (
  collected: CollectedAnalysis,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  parserContext: tsdoc.ParserContext,
): { readonly collected: CollectedAnalysis; readonly draft: ModifierDraft } => {
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
  const external = Option.match(astSymbolOfId(graph, astDeclaration.astSymbolId), {
    onNone: () => false,
    onSome: (astSymbol) => astSymbol.isExternal,
  })
  const withExtraTags = Match.value(scan.extra && !external).pipe(
    Match.when(true, () =>
      issueForDeclaration(
        collected,
        graph,
        ExtractorMessageId.ExtraReleaseTag,
        'The doc comment should not contain more than one release tag',
        astDeclaration.declarationId,
        undefined,
      )),
    Match.when(false, () => collected),
    Match.exhaustive,
  )
  const preapprovedTag = graph.tsdocConfiguration.tryGetTagDefinition('@preapproved')
  return Match.value(
    Option.exists(Option.fromNullishOr(preapprovedTag), (tagDefinition) => modifierTagSet.hasTag(tagDefinition)),
  ).pipe(
    Match.when(true, () => {
      const localName = Option.getOrElse(
        Option.map(astSymbolOfId(graph, astDeclaration.astSymbolId), (astSymbol) => astSymbol.localName),
        () => '',
      )
      return {
        collected: withExtraTags,
        draft: applyPreapproved(
          withExtraTags,
          graph,
          astDeclaration,
          localName,
          scan.declared === ReleaseTag.Internal,
          draft,
        ),
      }
    }),
    Match.when(false, () => ({ collected: withExtraTags, draft })),
    Match.exhaustive,
  )
})
