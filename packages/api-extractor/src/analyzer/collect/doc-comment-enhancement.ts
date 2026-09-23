import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import { VisitorState } from '../../collector/VisitorState.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { ApiItemMetadata } from './api-item-metadata.js'
import type { CollectedAnalysis } from './collect-analysis.js'
import { childNodesOf, EffectiveDocComment } from './effective-doc-comment.js'
import {
  apiItemMetadataOf,
  declarationIdsOfSymbol,
  declarationOf,
  declarationsPreOrder,
  includeForgottenExports,
  issueForDeclaration,
  localNameOfDeclarationId,
  nodeKindOf,
  resolveReferenceIn,
  updateApiItemMetadata,
  workingPackageNameOf,
} from './enhancement-view.js'
import { ensureApiItemMetadata } from './metadata-ensure.js'

const enhancerVisits = (graph: AnalysisGraph, consumable: boolean): boolean =>
  consumable || includeForgottenExports(graph)

const rebuiltMetadata = (
  metadata: ApiItemMetadata,
  undocumented: boolean,
  visitorState: VisitorState,
  tsdocComment: Option.Option<EffectiveDocComment>,
): ApiItemMetadata =>
  new ApiItemMetadata({
    declaredReleaseTag: metadata.declaredReleaseTag,
    effectiveReleaseTag: metadata.effectiveReleaseTag,
    releaseTagSameAsParent: metadata.releaseTagSameAsParent,
    isEventProperty: metadata.isEventProperty,
    isOverride: metadata.isOverride,
    isSealed: metadata.isSealed,
    isVirtual: metadata.isVirtual,
    isPreapproved: metadata.isPreapproved,
    deprecated: metadata.deprecated,
    customBlockTagNames: metadata.customBlockTagNames,
    modifierTagNames: metadata.modifierTagNames,
    tsdocComment,
    undocumented,
    docCommentEnhancerVisitorState: visitorState,
  })

const withVisitorState = (metadata: ApiItemMetadata, state: VisitorState): ApiItemMetadata =>
  rebuiltMetadata(metadata, metadata.undocumented, state, metadata.tsdocComment)

const withUndocumented = (metadata: ApiItemMetadata, undocumented: boolean): ApiItemMetadata =>
  rebuiltMetadata(metadata, undocumented, metadata.docCommentEnhancerVisitorState, metadata.tsdocComment)

const setVisitorState = (
  collected: CollectedAnalysis,
  declarationId: NodeId,
  state: VisitorState,
): CollectedAnalysis => updateApiItemMetadata(collected, declarationId, (metadata) => withVisitorState(metadata, state))

const markUndocumented = (
  collected: CollectedAnalysis,
  declarationId: NodeId,
  undocumented: boolean,
): CollectedAnalysis =>
  updateApiItemMetadata(collected, declarationId, (metadata) => withUndocumented(metadata, undocumented))

const refersToWorkingPackage = (
  graph: AnalysisGraph,
  declarationReference: Option.Option<tsdoc.DocDeclarationReference>,
): boolean =>
  Option.match(declarationReference, {
    onNone: () => true,
    onSome: (reference) =>
      Match.value(reference.packageName === undefined).pipe(
        Match.when(true, () => true),
        Match.when(false, () => reference.packageName === workingPackageNameOf(graph)),
        Match.exhaustive,
      ),
  })

const linkDestinationOf = (node: tsdoc.DocNode): Option.Option<tsdoc.DocDeclarationReference> =>
  Match.value(node).pipe(
    Match.when(
      (candidate): candidate is tsdoc.DocLinkTag => candidate instanceof tsdoc.DocLinkTag,
      (linkTag) => Option.fromUndefinedOr(linkTag.codeDestination),
    ),
    Match.orElse(() => Option.none()),
  )

const checkForBrokenLink = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationId: NodeId,
  node: tsdoc.DocNode,
): CollectedAnalysis =>
  Option.match(linkDestinationOf(node), {
    onNone: () => collected,
    onSome: (codeDestination) =>
      Match.value(refersToWorkingPackage(graph, Option.some(codeDestination))).pipe(
        Match.when(false, () => collected),
        Match.when(true, () =>
          Result.match(resolveReferenceIn(graph, collected, codeDestination), {
            onFailure: (reason) =>
              issueForDeclaration(
                collected,
                graph,
                ExtractorMessageId.UnresolvedLink,
                'The @link reference could not be resolved: ' + reason,
                declarationId,
              ),
            onSuccess: () => collected,
          })),
        Match.exhaustive,
      ),
  })

const checkForBrokenLinksInNode = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationId: NodeId,
  node: tsdoc.DocNode,
): CollectedAnalysis =>
  Arr.reduce(
    node.getChildNodes(),
    checkForBrokenLink(graph, collected, declarationId, node),
    (state, childNode) => checkForBrokenLinksInNode(graph, state, declarationId, childNode),
  )

const checkForBrokenLinks = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationId: NodeId,
): CollectedAnalysis =>
  Option.match(apiItemMetadataOf(collected, declarationId), {
    onNone: () => collected,
    onSome: (metadata) =>
      Option.match(metadata.tsdocComment, {
        onNone: () => collected,
        onSome: (record) =>
          Arr.reduce(
            childNodesOf(record),
            collected,
            (state, node) => checkForBrokenLinksInNode(graph, state, declarationId, node),
          ),
      }),
  })

const analyzeInheritedDocumentation = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationId: NodeId,
  record: EffectiveDocComment,
): CollectedAnalysis =>
  Option.match(record.inheritDocTag, {
    onNone: () => markUndocumented(collected, declarationId, true),
    onSome: (inheritDocTag) =>
      Match.value(refersToWorkingPackage(graph, Option.fromUndefinedOr(inheritDocTag.declarationReference))).pipe(
        Match.when(true, () => markUndocumented(collected, declarationId, true)),
        Match.when(false, () => markUndocumented(collected, declarationId, false)),
        Match.exhaustive,
      ),
  })

const analyzeNonConstructorDocumentation = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationId: NodeId,
): CollectedAnalysis =>
  Option.match(apiItemMetadataOf(collected, declarationId), {
    onNone: () => collected,
    onSome: (metadata) =>
      Option.match(metadata.tsdocComment, {
        onNone: () => markUndocumented(collected, declarationId, true),
        onSome: (record) =>
          Match.value(tsdoc.PlainTextEmitter.hasAnyTextContent(record.summarySection, 10)).pipe(
            Match.when(true, () => markUndocumented(collected, declarationId, false)),
            Match.when(false, () => analyzeInheritedDocumentation(graph, collected, declarationId, record)),
            Match.exhaustive,
          ),
      }),
  })

const analyzeConstructorDocumentation = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
): CollectedAnalysis => {
  const marked = markUndocumented(collected, declarationId, false)
  const parentId = Option.flatMap(
    declarationOf(graph, declarationId),
    (astDeclaration) => astDeclaration.parentDeclarationId,
  )
  return Option.match(parentId, {
    onNone: () => marked,
    onSome: (parentDeclarationId) => ensureApiItemMetadata(marked, graph, parser, parentDeclarationId).collected,
  })
}

const analyzeNeedsDocumentation = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
): CollectedAnalysis =>
  Match.value(Option.contains(nodeKindOf(graph, declarationId), ts.SyntaxKind.Constructor)).pipe(
    Match.when(true, () => analyzeConstructorDocumentation(graph, parser, collected, declarationId)),
    Match.when(false, () => analyzeNonConstructorDocumentation(graph, collected, declarationId)),
    Match.exhaustive,
  )

const copyInheritedDocs = (
  collected: CollectedAnalysis,
  declarationId: NodeId,
  target: EffectiveDocComment,
  source: EffectiveDocComment,
): CollectedAnalysis => {
  const copied = new EffectiveDocComment({
    summarySection: source.summarySection,
    remarksBlock: source.remarksBlock,
    privateRemarks: target.privateRemarks,
    deprecatedBlock: target.deprecatedBlock,
    params: source.params,
    typeParams: source.typeParams,
    returnsBlock: source.returnsBlock,
    customBlocks: target.customBlocks,
    seeBlocks: target.seeBlocks,
    inheritDocTag: Option.none(),
    modifierTagSet: target.modifierTagSet,
  })
  return updateApiItemMetadata(
    collected,
    declarationId,
    (metadata) =>
      rebuiltMetadata(metadata, metadata.undocumented, metadata.docCommentEnhancerVisitorState, Option.some(copied)),
  )
}

const copyFromReferenced = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
  target: EffectiveDocComment,
  referencedDeclarationId: NodeId,
): CollectedAnalysis => {
  const ensured = ensureApiItemMetadata(collected, graph, parser, referencedDeclarationId)
  return Option.match(ensured.metadata, {
    onNone: () => ensured.collected,
    onSome: (referencedMetadata) =>
      Option.match(referencedMetadata.tsdocComment, {
        onNone: () => ensured.collected,
        onSome: (source) => copyInheritedDocs(ensured.collected, declarationId, target, source),
      }),
  })
}

const resolveInheritDoc = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
  target: EffectiveDocComment,
  declarationReference: tsdoc.DocDeclarationReference,
): CollectedAnalysis =>
  Result.match(resolveReferenceIn(graph, collected, declarationReference), {
    onFailure: (reason) =>
      issueForDeclaration(
        collected,
        graph,
        ExtractorMessageId.UnresolvedInheritDocReference,
        'The @inheritDoc reference could not be resolved: ' + reason,
        declarationId,
      ),
    onSuccess: (referencedAstDeclaration) => {
      const analyzed = analyzeApiItem(graph, parser, collected, referencedAstDeclaration.declarationId)
      return copyFromReferenced(
        graph,
        parser,
        analyzed,
        declarationId,
        target,
        referencedAstDeclaration.declarationId,
      )
    },
  })

const applyInheritDocTag = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
  target: EffectiveDocComment,
  inheritDocTag: tsdoc.DocInheritDocTag,
): CollectedAnalysis =>
  Option.match(Option.fromUndefinedOr(inheritDocTag.declarationReference), {
    onNone: () =>
      issueForDeclaration(
        collected,
        graph,
        ExtractorMessageId.UnresolvedInheritDocBase,
        'The @inheritDoc tag needs a TSDoc declaration reference; signature matching is not supported yet',
        declarationId,
      ),
    onSome: (declarationReference) =>
      Match.value(refersToWorkingPackage(graph, Option.some(declarationReference))).pipe(
        Match.when(false, () => collected),
        Match.when(
          true,
          () => resolveInheritDoc(graph, parser, collected, declarationId, target, declarationReference),
        ),
        Match.exhaustive,
      ),
  })

const applyInheritDoc = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
): CollectedAnalysis =>
  Option.match(apiItemMetadataOf(collected, declarationId), {
    onNone: () => collected,
    onSome: (metadata) =>
      Option.match(metadata.tsdocComment, {
        onNone: () => collected,
        onSome: (record) =>
          Option.match(record.inheritDocTag, {
            onNone: () => collected,
            onSome: (inheritDocTag) =>
              applyInheritDocTag(graph, parser, collected, declarationId, record, inheritDocTag),
          }),
      }),
  })

const visitDeclaration = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
): CollectedAnalysis => {
  const visiting = setVisitorState(collected, declarationId, VisitorState.Visiting)
  const applied = applyInheritDoc(graph, parser, visiting, declarationId)
  const documented = analyzeNeedsDocumentation(graph, parser, applied, declarationId)
  const checked = checkForBrokenLinks(graph, documented, declarationId)
  return setVisitorState(checked, declarationId, VisitorState.Visited)
}

const analyzeApiItem = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  declarationId: NodeId,
): CollectedAnalysis => {
  const ensured = ensureApiItemMetadata(collected, graph, parser, declarationId)
  return Option.match(ensured.metadata, {
    onNone: () => ensured.collected,
    onSome: (metadata) =>
      Match.value(metadata.docCommentEnhancerVisitorState).pipe(
        Match.when(VisitorState.Visited, () => ensured.collected),
        Match.when(VisitorState.Visiting, () =>
          issueForDeclaration(
            ensured.collected,
            graph,
            ExtractorMessageId.CyclicInheritDoc,
            'The @inheritDoc tag for "' + localNameOfDeclarationId(graph, declarationId) +
              '" refers to its own declaration',
            declarationId,
          )),
        Match.when(VisitorState.Unvisited, () => visitDeclaration(graph, parser, ensured.collected, declarationId)),
        Match.exhaustive,
      ),
  })
}

const enhanceSymbol = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  symbolId: SymbolId,
): CollectedAnalysis =>
  Arr.reduce(
    Chunk.toReadonlyArray(declarationsPreOrder(graph, declarationIdsOfSymbol(graph, symbolId))),
    collected,
    (state, astDeclaration) => analyzeApiItem(graph, parser, state, astDeclaration.declarationId),
  )

export const enhanceDocComments = (collected: CollectedAnalysis, graph: AnalysisGraph): CollectedAnalysis => {
  const parser = new tsdoc.TSDocParser(graph.tsdocConfiguration)
  return Arr.reduce(
    Chunk.toReadonlyArray(collected.entities),
    collected,
    (state, entity) =>
      Match.value(entity.astEntity).pipe(
        Match.tag('AstSymbolRef', (symbolRef) =>
          Match.value(enhancerVisits(graph, entity.consumable)).pipe(
            Match.when(true, () => enhanceSymbol(graph, parser, state, symbolRef.symbolId)),
            Match.when(false, () => state),
            Match.exhaustive,
          )),
        Match.orElse(() => state),
      ),
  )
}
