import { HashMap, HashSet, Option, Result } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import * as SourceFileLocationFormatter from '../analyzer/SourceFileLocationFormatter.js'
import { convertToLf } from '../analyzer/text.js'
import * as TypeScriptHelpers from '../analyzer/TypeScriptHelpers.js'
import { getNodeId, type NodeId } from '../analyzer/TypeScriptInternals.js'
import * as Snapshot from '../collector/analysis-snapshot.js'
import type { ApiItemMetadata } from '../collector/ApiItemMetadata.js'
import type { CollectorEntity } from '../collector/CollectorEntity.js'
import { ExtractorMessageId } from '../collector/extractor-message-id.js'
import type { ExtractorMessage } from '../collector/message-log.js'
import type { ApiReportVariant } from '../config/config-file.schema.js'
import { InternalInvariantError, UnsupportedStarExportError } from '../errors/index.js'
import { ReleaseTag } from '../model/index.js'
import { DtsEmitHelpers } from './dts-emit-helpers.js'
import * as RenderSpan from './render-span.js'
import * as SpanPlan from './span-plan.js'
import type { SpanTree } from './span-tree.js'
import * as SpanTreeModule from './span-tree.js'
import * as TextWriter from './text-writer.js'

/** The typed failures `generateReviewFileContent` can return: refusals the CLI reports, and defects it crashes on. */
export type ReportRenderFailure = UnsupportedStarExportError | InternalInvariantError

export const internalInvariantOf = (message: string): Result.Result<never, ReportRenderFailure> =>
  Result.fail(new InternalInvariantError({ message }))

export interface ExportToEmit {
  readonly exportName: string
  readonly associatedMessages: ReadonlyArray<ExtractorMessage>
}

export interface PlanState {
  readonly snapshot: Snapshot.AnalysisSnapshot
  readonly reportVariant: ApiReportVariant
  readonly entity: CollectorEntity
  readonly plan: SpanPlan.SpanPlan
  readonly handled: HashSet.HashSet<number>
  readonly consumed: HashSet.HashSet<number>
  readonly processedSignatures: HashSet.HashSet<NodeId>
  readonly exportsToEmit: ReadonlyArray<ExportToEmit>
}

export const initialPlanState = (
  snapshot: Snapshot.AnalysisSnapshot,
  reportVariant: ApiReportVariant,
  entity: CollectorEntity,
  handled: HashSet.HashSet<number>,
  exportsToEmit: ReadonlyArray<ExportToEmit>,
): PlanState => ({
  snapshot,
  reportVariant,
  entity,
  plan: SpanPlan.empty,
  handled,
  consumed: HashSet.empty(),
  processedSignatures: HashSet.empty(),
  exportsToEmit,
})

export interface MessageSelectionState {
  readonly snapshot: Snapshot.AnalysisSnapshot
  readonly handled: HashSet.HashSet<number>
  readonly consumed: HashSet.HashSet<number>
}

const effectivelyHandled = (state: MessageSelectionState): HashSet.HashSet<number> =>
  HashSet.union(state.handled, HashSet.fromIterable(state.consumed))

export interface SelectedMessages {
  readonly messages: ReadonlyArray<ExtractorMessage>
  readonly consumed: HashSet.HashSet<number>
}

export const associatedMessagesOf = (
  state: MessageSelectionState,
  astDeclaration: Snapshot.AstDeclaration,
): SelectedMessages => {
  const selected = Snapshot.reportMessages(state.snapshot).associatedReportMessages(
    Snapshot.messageLog(state.snapshot),
    astDeclaration,
    effectivelyHandled(state),
  )
  return {
    messages: Arr.map(selected, (candidate) => candidate.message),
    consumed: HashSet.union(
      state.consumed,
      HashSet.fromIterable(Arr.map(selected, (candidate) => candidate.index)),
    ),
  }
}

export const unassociatedMessagesOf = (state: MessageSelectionState): SelectedMessages => {
  const selected = Snapshot.reportMessages(state.snapshot).unassociatedReportMessages(
    Snapshot.messageLog(state.snapshot),
    effectivelyHandled(state),
  )
  return {
    messages: Arr.map(selected, (candidate) => candidate.message),
    consumed: HashSet.union(
      state.consumed,
      HashSet.fromIterable(Arr.map(selected, (candidate) => candidate.index)),
    ),
  }
}

export const writeLineAsComments = (writer: TextWriter.TextWriter, line: string): TextWriter.TextWriter =>
  Arr.reduce(
    Arr.fromIterable(convertToLf(line).split('\n')),
    writer,
    (current, realLine) => TextWriter.writeLine(TextWriter.write(TextWriter.write(current, '// '), realLine)),
  )

const hasCustomBlock = (apiItemMetadata: ApiItemMetadata, tag: string): boolean =>
  Option.match(Option.fromNullishOr(apiItemMetadata.tsdocComment), {
    onNone: () => false,
    onSome: (tsdocComment) => Arr.some(tsdocComment.customBlocks, (block) => block.blockTag.tagName === tag),
  })

const hasModifierTag = (apiItemMetadata: ApiItemMetadata, tag: string): boolean =>
  Option.match(Option.fromNullishOr(apiItemMetadata.tsdocComment), {
    onNone: () => false,
    onSome: (tsdocComment) => tsdocComment.modifierTagSet.hasTagName(tag),
  })

const hasDeprecatedBlock = (apiItemMetadata: ApiItemMetadata): boolean =>
  Option.match(Option.fromNullishOr(apiItemMetadata.tsdocComment), {
    onNone: () => false,
    onSome: (tsdocComment) => tsdocComment.deprecatedBlock !== undefined,
  })

interface StandardTagsConfig {
  readonly reportSealedTag?: boolean | undefined
  readonly reportVirtualTag?: boolean | undefined
  readonly reportOverrideTag?: boolean | undefined
  readonly reportEventPropertyTag?: boolean | undefined
  readonly reportDeprecatedTag?: boolean | undefined
}

interface StandardTagRule {
  readonly shouldReport: boolean
  readonly isPresent: boolean
  readonly tagName: string
}

const standardTagRulesOf = (
  apiItemMetadata: ApiItemMetadata,
  tags: StandardTagsConfig,
): ReadonlyArray<StandardTagRule> => [
  { shouldReport: tags.reportSealedTag === true, isPresent: apiItemMetadata.isSealed, tagName: '@sealed' },
  { shouldReport: tags.reportVirtualTag === true, isPresent: apiItemMetadata.isVirtual, tagName: '@virtual' },
  { shouldReport: tags.reportOverrideTag === true, isPresent: apiItemMetadata.isOverride, tagName: '@override' },
  {
    shouldReport: tags.reportEventPropertyTag === true,
    isPresent: apiItemMetadata.isEventProperty,
    tagName: '@eventProperty',
  },
  {
    shouldReport: tags.reportDeprecatedTag === true,
    isPresent: hasDeprecatedBlock(apiItemMetadata),
    tagName: '@deprecated',
  },
]

const standardTagNames = (apiItemMetadata: ApiItemMetadata, tags: StandardTagsConfig): ReadonlyArray<string> =>
  Arr.map(
    Arr.filter(standardTagRulesOf(apiItemMetadata, tags), (rule) => rule.shouldReport && rule.isPresent),
    (rule) => rule.tagName,
  )

const customTagAdmitted = (
  apiItemMetadata: ApiItemMetadata,
  tag: string,
  shouldReport: boolean | undefined,
): boolean =>
  Match.value(shouldReport === true).pipe(
    Match.when(true, () => hasCustomBlock(apiItemMetadata, tag) || hasModifierTag(apiItemMetadata, tag)),
    Match.when(false, () => false),
    Match.exhaustive,
  )

const customTagNames = (
  apiItemMetadata: ApiItemMetadata,
  otherTags: Readonly<Record<string, boolean | undefined>>,
): ReadonlyArray<string> =>
  Arr.map(
    Arr.filter(
      Object.entries(otherTags),
      ([tag, shouldReport]) => customTagAdmitted(apiItemMetadata, tag, shouldReport),
    ),
    ([tag]) => tag,
  )

const DEFAULT_TAGS_TO_REPORT: Readonly<Record<string, boolean>> = {
  '@sealed': true,
  '@virtual': true,
  '@override': true,
  '@eventProperty': true,
  '@deprecated': true,
}

export const getAedocSynopsis = (
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
  messagesToReport: ReadonlyArray<ExtractorMessage> = [],
): string =>
  Match.value(Snapshot.isAncillaryDeclaration(snapshot, astDeclaration)).pipe(
    Match.when(true, () => ''),
    Match.orElse(() => aedocSynopsisOf(snapshot, astDeclaration, messagesToReport)),
  )

const aedocSynopsisOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
  messagesToReport: ReadonlyArray<ExtractorMessage>,
): string => {
  const footerParts = aedocFooterPartsOf(snapshot, astDeclaration)
  const lines = synopsisLinesOf(snapshot, astDeclaration, messagesToReport)

  return Match.value(footerParts.length > 0).pipe(
    Match.when(true, () => {
      const withSeparator = Match.value(messagesToReport.length > 0).pipe(
        Match.when(true, () => writeLineAsComments(lines, '')),
        Match.when(false, () => lines),
        Match.exhaustive,
      )
      return TextWriter.getText(writeLineAsComments(withSeparator, footerParts.join(' ')))
    }),
    Match.when(false, () => TextWriter.getText(lines)),
    Match.exhaustive,
  )
}

const synopsisLinesOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
  messagesToReport: ReadonlyArray<ExtractorMessage>,
): TextWriter.TextWriter =>
  Arr.reduce(
    messagesToReport,
    TextWriter.make(),
    (writer, message) => writeLineAsComments(writer, `Warning: ${message.formatMessageWithoutLocation()}`),
  )

const tagsToReportOf = (snapshot: Snapshot.AnalysisSnapshot): Readonly<Record<string, boolean | undefined>> => ({
  ...DEFAULT_TAGS_TO_REPORT,
  ...Snapshot.extractorConfig(snapshot).apiReport.tagsToReport,
})

const aedocFooterPartsOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
): ReadonlyArray<string> => {
  const apiItemMetadata = Snapshot.fetchApiItemMetadata(snapshot, astDeclaration)
  const releaseTagFooter = Match.value(
    !apiItemMetadata.releaseTagSameAsParent && apiItemMetadata.effectiveReleaseTag !== ReleaseTag.None,
  ).pipe(
    Match.when(true, () => [ReleaseTag.getTagName(apiItemMetadata.effectiveReleaseTag)]),
    Match.when(false, (): ReadonlyArray<string> => []),
    Match.exhaustive,
  )
  const {
    '@sealed': reportSealedTag,
    '@virtual': reportVirtualTag,
    '@override': reportOverrideTag,
    '@eventProperty': reportEventPropertyTag,
    '@deprecated': reportDeprecatedTag,
    ...otherTagsToReport
  } = tagsToReportOf(snapshot)

  const footerParts = [
    ...releaseTagFooter,
    ...standardTagNames(apiItemMetadata, {
      reportSealedTag,
      reportVirtualTag,
      reportOverrideTag,
      reportEventPropertyTag,
      reportDeprecatedTag,
    }),
    ...customTagNames(apiItemMetadata, otherTagsToReport),
  ]

  return Match.value(apiItemMetadata.undocumented).pipe(
    Match.when(true, () => {
      Snapshot.addAnalyzerIssue(
        snapshot,
        ExtractorMessageId.Undocumented,
        `Missing documentation for "${Snapshot.localName(snapshot, astDeclaration)}".`,
        astDeclaration,
      )
      return Arr.append(footerParts, '(undocumented)')
    }),
    Match.when(false, () => footerParts),
    Match.exhaustive,
  )
}

// ---------------------------------------------------------------- span planning

const shouldIncludeReleaseTag = (releaseTag: ReleaseTag, reportVariant: ApiReportVariant): boolean =>
  Match.value(reportVariant).pipe(
    Match.when('complete', () => true),
    Match.when(
      'alpha',
      () => releaseTagAdmittedOf(releaseTag, [ReleaseTag.Alpha, ReleaseTag.Beta, ReleaseTag.Public, ReleaseTag.None]),
    ),
    Match.when('beta', () => releaseTagAdmittedOf(releaseTag, [ReleaseTag.Beta, ReleaseTag.Public, ReleaseTag.None])),
    Match.when('public', () => releaseTagAdmittedOf(releaseTag, [ReleaseTag.Public, ReleaseTag.None])),
    Match.exhaustive,
  )

const releaseTagAdmittedOf = (releaseTag: ReleaseTag, admitted: ReadonlyArray<ReleaseTag>): boolean =>
  Arr.some(admitted, (candidate) => candidate === releaseTag)

export const shouldIncludeDeclaration = (
  state: PlanState,
  astDeclaration: Snapshot.AstDeclaration,
): boolean =>
  Match.value(
    (Snapshot.modifierFlags(state.snapshot, astDeclaration) & ts.ModifierFlags.Private) !== 0,
  ).pipe(
    Match.when(true, () => false),
    Match.when(false, () =>
      shouldIncludeReleaseTag(
        Snapshot.fetchApiItemMetadata(state.snapshot, astDeclaration).effectiveReleaseTag,
        state.reportVariant,
      )),
    Match.exhaustive,
  )

const keywordModifiersOf = (kind: ts.SyntaxKind): boolean =>
  Match.value(kind).pipe(
    Match.when(ts.SyntaxKind.InterfaceKeyword, () => true),
    Match.when(ts.SyntaxKind.ClassKeyword, () => true),
    Match.when(ts.SyntaxKind.EnumKeyword, () => true),
    Match.when(ts.SyntaxKind.NamespaceKeyword, () => true),
    Match.when(ts.SyntaxKind.ModuleKeyword, () => true),
    Match.when(ts.SyntaxKind.TypeKeyword, () => true),
    Match.when(ts.SyntaxKind.FunctionKeyword, () => true),
    Match.orElse(() => false),
  )

const nestedDeclarationOf = (
  state: PlanState,
  tree: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
): Snapshot.AstDeclaration =>
  Match.value(Snapshot.isSupportedDeclarationKind(tree.kind)).pipe(
    Match.when(true, () => Snapshot.childDeclarationByNode(state.snapshot, tree.node, astDeclaration)),
    Match.when(false, () => astDeclaration),
    Match.exhaustive,
  )

const bindingPatternNameOf = (name: ts.Node): boolean =>
  Match.value(name.kind).pipe(
    Match.when(ts.SyntaxKind.ObjectBindingPattern, () => true),
    Match.when(ts.SyntaxKind.ArrayBindingPattern, () => true),
    Match.orElse(() => false),
  )

const candidateSyntheticName = (counter: number): string =>
  Match.value(counter <= 1).pipe(
    Match.when(true, () => 'input'),
    Match.when(false, () => `input${counter}`),
    Match.exhaustive,
  )

const syntheticNameOf = (alreadyUsed: ReadonlyArray<string>, counter: number): string =>
  Match.value(Arr.contains(alreadyUsed, candidateSyntheticName(counter))).pipe(
    Match.when(true, () => syntheticNameOf(alreadyUsed, counter + 1)),
    Match.when(false, () => candidateSyntheticName(counter)),
    Match.exhaustive,
  )

interface SyntheticWalk {
  readonly names: HashMap.HashMap<NodeId, string>
  readonly used: ReadonlyArray<string>
}

const syntheticWalkOf = (walk: SyntheticWalk, parameter: ts.ParameterDeclaration): SyntheticWalk =>
  Match.value(bindingPatternNameOf(parameter.name)).pipe(
    Match.when(true, () => {
      const syntheticName = syntheticNameOf(walk.used, 1)
      return {
        names: HashMap.set(walk.names, getNodeId(parameter.name), syntheticName),
        used: Arr.append(walk.used, syntheticName),
      }
    }),
    Match.when(false, () => walk),
    Match.exhaustive,
  )

const bindingParametersOf = (
  parameters: ReadonlyArray<ts.ParameterDeclaration>,
): ReadonlyArray<ts.ParameterDeclaration> =>
  Option.match(Arr.findFirstIndex(parameters, bindingPatternNameOf), {
    onNone: (): ReadonlyArray<ts.ParameterDeclaration> => [],
    onSome: (firstBinding) => Arr.drop(parameters, firstBinding),
  })

const isPlainIdentifierName = (name: ts.BindingName): name is ts.Identifier =>
  !ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)

const usedParameterNamesOf = (parameters: ReadonlyArray<ts.ParameterDeclaration>): ReadonlyArray<string> =>
  Arr.filterMap(parameters, (parameter) =>
    Result.fromOption(
      Option.map(Option.filter(Option.some(parameter.name), isPlainIdentifierName), (name) => name.text.trim()),
      () => 'unused',
    ))

const applySyntheticNames = (
  state: PlanState,
  signatureTree: SpanTree,
  names: HashMap.HashMap<NodeId, string>,
): PlanState =>
  Arr.reduce(
    SpanTreeModule.preordered(signatureTree),
    state,
    (current, span) =>
      Option.match(HashMap.get(names, span.id), {
        onNone: () => current,
        onSome: (syntheticName) => ({ ...current, plan: SpanPlan.withPrefix(current.plan, span, syntheticName) }),
      }),
  )

const normalizeParameterNames = (state: PlanState, signatureTree: SpanTree): PlanState => {
  const parameters = Arr.filter(Arr.fromIterable(signatureTree.node.getChildren()), ts.isParameter)
  const names = Arr.reduce(
    bindingParametersOf(parameters),
    { names: HashMap.empty<NodeId, string>(), used: usedParameterNamesOf(parameters) } satisfies SyntheticWalk,
    syntheticWalkOf,
  ).names
  return Match.value(HashMap.size(names) > 0).pipe(
    Match.when(true, () => applySyntheticNames(state, signatureTree, names)),
    Match.when(false, () => state),
    Match.exhaustive,
  )
}

const handleParameter = (state: PlanState, parent: Option.Option<SpanTree>): PlanState =>
  Option.match(parent, {
    onNone: () => state,
    onSome: (signatureParent) =>
      Match.value(HashSet.has(state.processedSignatures, signatureParent.id)).pipe(
        Match.when(true, () => state),
        Match.when(false, () =>
          normalizeParameterNames(
            { ...state, processedSignatures: HashSet.add(state.processedSignatures, signatureParent.id) },
            signatureParent,
          )),
        Match.exhaustive,
      ),
  })

const handleExportKeyword = (state: PlanState, tree: SpanTree): PlanState =>
  Match.value(DtsEmitHelpers.isExportKeywordInNamespaceExportDeclaration(tree.node)).pipe(
    Match.when(true, () => state),
    Match.when(false, () => ({ ...state, plan: SpanPlan.skipAll(state.plan, tree) })),
    Match.exhaustive,
  )

const replacedModifiersOf = (state: PlanState): string =>
  Match.value(state.entity.shouldInlineExport).pipe(
    Match.when(true, () => 'export '),
    Match.when(false, () => ''),
    Match.exhaustive,
  )

const handleKeywordModifiers = (
  state: PlanState,
  tree: SpanTree,
  previousSibling: Option.Option<SpanTree>,
): PlanState => {
  const replacedModifiers = replacedModifiersOf(state)
  return Option.match(previousSibling, {
    onSome: (previous) =>
      Match.value(previous.kind === ts.SyntaxKind.SyntaxList).pipe(
        Match.when(true, () => ({ ...state, plan: SpanPlan.prependPrefix(state.plan, previous, replacedModifiers) })),
        Match.when(false, () => ({ ...state, plan: SpanPlan.prependPrefix(state.plan, tree, replacedModifiers) })),
        Match.exhaustive,
      ),
    onNone: () => ({ ...state, plan: SpanPlan.prependPrefix(state.plan, tree, replacedModifiers) }),
  })
}

const identifierPrefixOf = (
  state: PlanState,
  tree: SpanTree,
  referencedEntity: CollectorEntity,
): Result.Result<PlanState, ReportRenderFailure> =>
  Option.match(Option.filter(Option.fromNullishOr(referencedEntity.nameForEmit), (name) => name.length > 0), {
    onNone: () => internalInvariantOf('referencedEntry.nameForEmit is undefined'),
    onSome: (nameForEmit) => Result.succeed({ ...state, plan: SpanPlan.withPrefix(state.plan, tree, nameForEmit) }),
  })

const handleIdentifier = (state: PlanState, tree: SpanTree): Result.Result<PlanState, ReportRenderFailure> =>
  Match.value(tree.node).pipe(
    Match.when(ts.isIdentifier, (identifier) =>
      Option.match(Snapshot.tryGetEntityForNode(state.snapshot, identifier), {
        onNone: () => Result.succeed(state),
        onSome: (referencedEntity) => identifierPrefixOf(state, tree, referencedEntity),
      })),
    Match.orElse(() => Result.succeed(state)),
  )

const variableDeclarationPrefixOf = (
  state: PlanState,
  tree: SpanTree,
  list: ts.VariableDeclarationList,
): PlanState => {
  const firstDeclarationStart = Option.getOrElse(
    Option.map(Arr.head(list.declarations), (declaration) => declaration.getStart()),
    () => list.getStart(),
  )
  const listPrefix = list.getSourceFile().text.substring(list.getStart(), firstDeclarationStart)
  const afterListPrefix = {
    ...state,
    plan: SpanPlan.prependPrefix(SpanPlan.withSuffix(state.plan, tree, ';'), tree, listPrefix),
  }
  return Match.value(state.entity.shouldInlineExport).pipe(
    Match.when(true, () => ({ ...state, plan: SpanPlan.prependPrefix(afterListPrefix.plan, tree, 'export ') })),
    Match.when(false, () => afterListPrefix),
    Match.exhaustive,
  )
}

const handleVariableDeclaration = (
  state: PlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
): Result.Result<PlanState, ReportRenderFailure> =>
  Option.match(parent, {
    onSome: () => Result.succeed(state),
    onNone: () =>
      Option.match(
        Option.fromUndefinedOr(
          TypeScriptHelpers.matchAncestor<ts.VariableDeclarationList>(tree.node, [
            ts.SyntaxKind.VariableDeclarationList,
            ts.SyntaxKind.VariableDeclaration,
          ]),
        ),
        {
          onNone: () => internalInvariantOf('Unsupported variable declaration'),
          onSome: (list) => Result.succeed(variableDeclarationPrefixOf(state, tree, list)),
        },
      ),
  })

const relativeImportPathOf = (node: ts.ImportTypeNode): Option.Option<string> =>
  Option.some(node.argument).pipe(
    Option.filter(ts.isLiteralTypeNode),
    Option.map((literalTypeNode) => literalTypeNode.literal),
    Option.filter(ts.isStringLiteral),
    Option.map((literal) => literal.text),
    Option.filter((modulePath) => modulePath.startsWith('.')),
  )

const handleUnresolvedImportType = (
  state: PlanState,
  astDeclaration: Snapshot.AstDeclaration,
  node: ts.ImportTypeNode,
): PlanState =>
  Option.match(relativeImportPathOf(node), {
    onNone: () => state,
    onSome: (modulePath) => {
      Snapshot.addAnalyzerIssue(
        state.snapshot,
        ExtractorMessageId.UnresolvedImportPath,
        `The inline import path "${modulePath}" could not be resolved, so it would be emitted unchanged` +
          ` into the .d.ts rollup, where it does not resolve to anything. Import the symbol at the top` +
          ` of the file instead of using an inline import() type.`,
        astDeclaration,
      )
      return state
    },
  })

const resolveNestedQualifiersText = (node: ts.ImportTypeNode): string =>
  Option.match(Option.fromUndefinedOr(node.qualifier), {
    onNone: () => '',
    onSome: (qualifier) => {
      const qualifiersText = qualifier.getText()
      const dotIndex = qualifiersText.indexOf('.')
      return Match.value(dotIndex >= 0).pipe(
        Match.when(true, () => qualifiersText.substring(dotIndex)),
        Match.when(false, () => ''),
        Match.exhaustive,
      )
    },
  })

const nestedImportQualifiersOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  entity: CollectorEntity,
  node: ts.ImportTypeNode,
): Result.Result<string, ReportRenderFailure> =>
  Option.match(Snapshot.astImportOf(Snapshot.astEntityOf(entity)), {
    onNone: () => internalInvariantOf('Missing AstImport for an AstImportRef'),
    onSome: (astImport) =>
      Result.succeed(
        Match.value(astImport.importKind === Snapshot.AstImportKind.ImportType && astImport.exportName.length > 0).pipe(
          Match.when(true, () => resolveNestedQualifiersText(node)),
          Match.when(false, () => ''),
          Match.exhaustive,
        ),
      ),
  })

const typeArgumentBoundsOf = (tree: SpanTree): Option.Option<readonly [number, number]> =>
  Option.match(Arr.findFirstIndex(tree.children, (child) => child.kind === ts.SyntaxKind.LessThanToken), {
    onNone: () => Option.none(),
    onSome: (lessThan) =>
      Option.match(Arr.findFirstIndex(tree.children, (child) => child.kind === ts.SyntaxKind.GreaterThanToken), {
        onNone: () => Option.none(),
        onSome: (greaterThan) =>
          Match.value(greaterThan > lessThan).pipe(
            Match.when(true, () => Option.some([lessThan, greaterThan] as const)),
            Match.when(false, () => Option.none()),
            Match.exhaustive,
          ),
      }),
  })

const extractTypeArgumentSpans = (tree: SpanTree): Option.Option<ReadonlyArray<SpanTree>> =>
  Option.map(typeArgumentBoundsOf(tree), ([from, to]) => Arr.fromIterable(tree.children.slice(from + 1, to)))

const separatorAfterOf = (tree: SpanTree): string =>
  Option.match(Option.fromNullishOr(/(\s*)$/.exec(SpanTreeModule.originalText(tree))), {
    onNone: () => '',
    onSome: (separatorMatch) => Option.getOrElse(Option.fromUndefinedOr(separatorMatch[1]), () => ''),
  })

interface TypeArgumentsText {
  readonly state: PlanState
  readonly text: string
}

interface NestedWalk {
  readonly state: PlanState
  readonly previous: Option.Option<SpanTree>
}

const plannedNestedOf = (
  walk: NestedWalk,
  parent: SpanTree,
  span: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
): Result.Result<NestedWalk, ReportRenderFailure> =>
  Result.map(
    planDeclarationSpan(
      walk.state,
      span,
      Option.some(parent),
      walk.previous,
      nestedDeclarationOf(walk.state, span, astDeclaration),
      insideTypeLiteral,
    ),
    (plannedState) => ({ state: plannedState, previous: Option.some(span) }),
  )

const planNestedSpans = (
  state: PlanState,
  parent: SpanTree,
  typeArgumentSpans: ReadonlyArray<SpanTree>,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
): Result.Result<PlanState, ReportRenderFailure> => {
  const initial: Result.Result<NestedWalk, ReportRenderFailure> = Result.succeed({
    state,
    previous: Option.none(),
  })
  return Result.map(
    Arr.reduce(
      typeArgumentSpans,
      initial,
      (accumulated, span) =>
        Result.flatMap(accumulated, (walk) => plannedNestedOf(walk, parent, span, astDeclaration, insideTypeLiteral)),
    ),
    (walk) => walk.state,
  )
}

const formatTypeArgumentsText = (
  state: PlanState,
  tree: SpanTree,
  node: ts.ImportTypeNode,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
): Result.Result<TypeArgumentsText, ReportRenderFailure> =>
  Option.match(Option.filter(Option.fromUndefinedOr(node.typeArguments), (typeArguments) => typeArguments.length > 0), {
    onNone: () => Result.succeed({ state, text: '' }),
    onSome: () =>
      Option.match(extractTypeArgumentSpans(tree), {
        onNone: () =>
          internalInvariantOf(
            `Invalid type arguments: ${node.getText()}\n${SourceFileLocationFormatter.formatDeclaration(node)}`,
          ),
        onSome: (typeArgumentSpans) =>
          Result.map(
            planNestedSpans(state, tree, typeArgumentSpans, astDeclaration, insideTypeLiteral),
            (planned) => ({
              state: planned,
              text: `<${
                Arr.join(Arr.map(typeArgumentSpans, (span) => RenderSpan.renderText(span, planned.plan)), ', ')
              }>`,
            }),
          ),
      }),
  })

const handleResolvedImportType = (
  state: PlanState,
  tree: SpanTree,
  node: ts.ImportTypeNode,
  astDeclaration: Snapshot.AstDeclaration,
  referencedEntity: CollectorEntity,
  insideTypeLiteral: boolean,
): Result.Result<PlanState, ReportRenderFailure> =>
  Option.match(Option.filter(Option.fromNullishOr(referencedEntity.nameForEmit), (name) => name.length > 0), {
    onNone: () => internalInvariantOf('referencedEntry.nameForEmit is undefined'),
    onSome: (nameForEmit) =>
      Result.flatMap(
        formatTypeArgumentsText(state, tree, node, astDeclaration, insideTypeLiteral),
        ({ state: planned, text: typeArgumentsText }) =>
          Result.map(nestedImportQualifiersOf(planned.snapshot, referencedEntity, node), (nestedQualifiers) => ({
            ...planned,
            plan: SpanPlan.withPrefix(
              SpanPlan.skipAll(planned.plan, tree),
              tree,
              `${nameForEmit}${nestedQualifiers}${typeArgumentsText}${separatorAfterOf(tree)}`,
            ),
          })),
      ),
  })

const handleImportType = (
  state: PlanState,
  tree: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
): Result.Result<PlanState, ReportRenderFailure> =>
  Match.value(tree.node).pipe(
    Match.when(ts.isImportTypeNode, (node) =>
      Option.match(Snapshot.tryGetEntityForNode(state.snapshot, node), {
        onNone: () => Result.succeed(handleUnresolvedImportType(state, astDeclaration, node)),
        onSome: (referencedEntity) =>
          handleResolvedImportType(state, tree, node, astDeclaration, referencedEntity, insideTypeLiteral),
      })),
    Match.orElse(() => Result.succeed(state)),
  )

interface PlannedSpan {
  readonly state: PlanState
  readonly recurseChildren: boolean
  readonly sortChildren: boolean
  readonly insideTypeLiteral: boolean
}

const plannedSpanOf = (
  state: PlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  previousSibling: Option.Option<SpanTree>,
  insideTypeLiteral: boolean,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<PlannedSpan, ReportRenderFailure> =>
  Match.value(tree.kind).pipe(
    Match.when(ts.SyntaxKind.JSDocComment, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.succeed({
        state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) },
        recurseChildren: false,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.ExportKeyword, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.succeed({
        state: handleExportKeyword(state, tree),
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.DefaultKeyword, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.succeed({
        state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) },
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.DeclareKeyword, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.succeed({
        state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) },
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.SyntaxList, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.succeed({
        state,
        recurseChildren: true,
        sortChildren: sortChildrenFor(parent),
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.VariableDeclaration, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.map(handleVariableDeclaration(state, tree, parent), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      }))),
    Match.when(ts.SyntaxKind.Parameter, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.succeed({
        state: handleParameter(state, parent),
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.TypeLiteral, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.succeed({ state, recurseChildren: true, sortChildren: false, insideTypeLiteral: true })),
    Match.when(ts.SyntaxKind.Identifier, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.map(handleIdentifier(state, tree), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      }))),
    Match.when(ts.SyntaxKind.ImportType, (): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Result.map(handleImportType(state, tree, astDeclaration, insideTypeLiteral), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      }))),
    Match.orElse((): Result.Result<PlannedSpan, ReportRenderFailure> =>
      Match.value(keywordModifiersOf(tree.kind)).pipe(
        Match.when(true, () =>
          Result.succeed({
            state: handleKeywordModifiers(state, tree, previousSibling),
            recurseChildren: true,
            sortChildren: false,
            insideTypeLiteral,
          })),
        Match.when(false, () =>
          Result.succeed({ state, recurseChildren: true, sortChildren: false, insideTypeLiteral })),
        Match.exhaustive,
      )
    ),
  )

const sortChildrenFor = (parent: Option.Option<SpanTree>): boolean =>
  Option.match(parent, {
    onNone: () => false,
    onSome: (parentSpan) =>
      Snapshot.isSupportedDeclarationKind(parentSpan.kind) || parentSpan.kind === ts.SyntaxKind.ModuleBlock,
  })

interface ChildWalk {
  readonly state: PlanState
  readonly previous: Option.Option<SpanTree>
}

const plannedChildOf = (
  walk: ChildWalk,
  tree: SpanTree,
  child: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
  sortChildren: boolean,
): Result.Result<ChildWalk, ReportRenderFailure> => {
  const childAstDeclaration = nestedDeclarationOf(walk.state, child, astDeclaration)
  const afterChildPrefix = Match.value(Snapshot.isSupportedDeclarationKind(child.kind)).pipe(
    Match.when(true, () =>
      Match.value(shouldIncludeDeclaration(walk.state, childAstDeclaration)).pipe(
        Match.when(true, () =>
          planIncludedChild(walk.state, tree, child, childAstDeclaration, insideTypeLiteral, sortChildren)),
        Match.when(false, (): Result.Result<PlanState, ReportRenderFailure> =>
          Result.succeed(walk.state)),
        Match.exhaustive,
      )),
    Match.when(false, (): Result.Result<PlanState, ReportRenderFailure> => Result.succeed(walk.state)),
    Match.exhaustive,
  )
  return Result.flatMap(afterChildPrefix, (plannedState) =>
    Result.map(
      planDeclarationSpan(
        plannedState,
        child,
        Option.some(tree),
        walk.previous,
        childAstDeclaration,
        insideTypeLiteral,
      ),
      (planned) => ({ state: planned, previous: Option.some(child) }),
    ))
}

const planIncludedChild = (
  state: PlanState,
  tree: SpanTree,
  child: SpanTree,
  childAstDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
  sortChildren: boolean,
): Result.Result<PlanState, ReportRenderFailure> => {
  const afterSortKeys = Match.value(sortChildren).pipe(
    Match.when(true, () => planSortKeys(state, tree, child, childAstDeclaration)),
    Match.when(false, (): Result.Result<PlanState, ReportRenderFailure> => Result.succeed(state)),
    Match.exhaustive,
  )
  return Result.flatMap(afterSortKeys, (plannedState) =>
    Match.value(insideTypeLiteral).pipe(
      Match.when(true, (): Result.Result<PlanState, ReportRenderFailure> => Result.succeed(plannedState)),
      Match.when(false, () => planAedocPrefix(plannedState, child, childAstDeclaration)),
      Match.exhaustive,
    ))
}

const planSortKeys = (
  state: PlanState,
  tree: SpanTree,
  child: SpanTree,
  childAstDeclaration: Snapshot.AstDeclaration,
): Result.Result<PlanState, ReportRenderFailure> => {
  const sortKey = Snapshot.sortKeyIgnoringUnderscore(Snapshot.localName(state.snapshot, childAstDeclaration))
  return Result.succeed({
    ...state,
    plan: SpanPlan.withSortKey(SpanPlan.sortChildren(state.plan, tree), child, sortKey),
  })
}

const planAedocPrefix = (
  state: PlanState,
  child: SpanTree,
  childAstDeclaration: Snapshot.AstDeclaration,
): Result.Result<PlanState, ReportRenderFailure> => {
  const selected = associatedMessagesOf(state, childAstDeclaration)
  const aedocSynopsis = getAedocSynopsis(state.snapshot, childAstDeclaration, selected.messages)
  return Result.succeed({
    ...state,
    consumed: selected.consumed,
    plan: SpanPlan.prependPrefix(state.plan, child, aedocSynopsis),
  })
}

interface PreapprovedWalk {
  readonly plan: SpanPlan.SpanPlan
  readonly skipRest: boolean
}

const omittedPreapprovedChild = (skipRest: boolean, kind: ts.SyntaxKind): boolean =>
  Match.value(skipRest).pipe(
    Match.when(true, () => true),
    Match.when(false, () =>
      Match.value(kind).pipe(
        Match.when(ts.SyntaxKind.SyntaxList, () => true),
        Match.when(ts.SyntaxKind.JSDocComment, () => true),
        Match.orElse(() => false),
      )),
    Match.exhaustive,
  )

const plannedPreapprovedChild = (walk: PreapprovedWalk, child: SpanTree): PreapprovedWalk => {
  const afterSkipAll = Match.value(omittedPreapprovedChild(walk.skipRest, child.kind)).pipe(
    Match.when(true, () => SpanPlan.skipAll(walk.plan, child)),
    Match.when(false, () => walk.plan),
    Match.exhaustive,
  )
  const afterIdentifier = Match.value(child.kind === ts.SyntaxKind.Identifier).pipe(
    Match.when(
      true,
      () => SpanPlan.withSuffix(SpanPlan.omitSeparatorAfter(afterSkipAll, child), child, ' { /* (preapproved) */ }'),
    ),
    Match.when(false, () => afterSkipAll),
    Match.exhaustive,
  )
  return {
    plan: afterIdentifier,
    skipRest: walk.skipRest || child.kind === ts.SyntaxKind.Identifier,
  }
}

export const planForPreapproved = (plan: SpanPlan.SpanPlan, tree: SpanTree): SpanPlan.SpanPlan =>
  Arr.reduce(tree.children, { plan, skipRest: false } satisfies PreapprovedWalk, plannedPreapprovedChild).plan

export const planDeclarationSpan = (
  state: PlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  previousSibling: Option.Option<SpanTree>,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
): Result.Result<PlanState, ReportRenderFailure> =>
  Match.value(shouldIncludeDeclaration(state, astDeclaration)).pipe(
    Match.when(false, () => Result.succeed({ ...state, plan: SpanPlan.skipAll(state.plan, tree) })),
    Match.when(true, () => planIncludedSpan(state, tree, parent, previousSibling, insideTypeLiteral, astDeclaration)),
    Match.exhaustive,
  )

const planIncludedSpan = (
  state: PlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  previousSibling: Option.Option<SpanTree>,
  insideTypeLiteral: boolean,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<PlanState, ReportRenderFailure> =>
  Result.flatMap(
    plannedSpanOf(state, tree, parent, previousSibling, insideTypeLiteral, astDeclaration),
    (planned) => {
      const initial: Result.Result<ChildWalk, ReportRenderFailure> = Result.succeed({
        state: planned.state,
        previous: Option.none(),
      })
      return Match.value(planned.recurseChildren).pipe(
        Match.when(false, (): Result.Result<PlanState, ReportRenderFailure> => Result.succeed(planned.state)),
        Match.when(true, () =>
          Result.map(
            Arr.reduce(tree.children, initial, (accumulated, child) =>
              Result.flatMap(
                accumulated,
                (walk) =>
                  plannedChildOf(walk, tree, child, astDeclaration, planned.insideTypeLiteral, planned.sortChildren),
              )),
            (walk) => walk.state,
          )),
        Match.exhaustive,
      )
    },
  )
