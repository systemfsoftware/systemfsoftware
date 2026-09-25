import { Chunk, HashMap, HashSet, Option, Result } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import { convertToLf } from '../analyzer/text.js'
import * as TypeScriptHelpers from '../analyzer/TypeScriptHelpers.js'
import { type NodeId } from '../analyzer/TypeScriptInternals.js'
import * as Snapshot from '../collector/analysis-snapshot.js'
import { ExtractorMessageId } from '../collector/extractor-message-id.js'
import type { ExtractorMessage } from '../collector/message-log.js'
import type { ApiReportVariant } from '../config/config-file.schema.js'
import { ReleaseTag } from '../model/index.js'
import {
  internalInvariantOf,
  isExportKeywordInNamespaceExportDeclaration,
  planImportTypeSpan,
  type RenderFailure,
  syntheticParameterNames,
} from './dts-emit-helpers.js'
import * as SpanPlan from './span-plan.js'
import type { SpanTree } from './span-tree.js'
import * as SpanTreeModule from './span-tree.js'
import * as TextWriter from './text-writer.js'

export type { RenderFailure }

export interface ExportToEmit {
  readonly exportName: string
  readonly associatedMessages: ReadonlyArray<ExtractorMessage>
}

export interface PlanState {
  readonly snapshot: Snapshot.AnalysisSnapshot
  readonly reportVariant: ApiReportVariant
  readonly entity: Snapshot.CollectorEntity
  readonly plan: SpanPlan.SpanPlan
  readonly handled: HashSet.HashSet<number>
  readonly consumed: HashSet.HashSet<number>
  readonly processedSignatures: HashSet.HashSet<NodeId>
  readonly exportsToEmit: ReadonlyArray<ExportToEmit>
}

export const initialPlanState = dual<
  (
    reportVariant: ApiReportVariant,
    entity: Snapshot.CollectorEntity,
    handled: HashSet.HashSet<number>,
    exportsToEmit: ReadonlyArray<ExportToEmit>,
  ) => (snapshot: Snapshot.AnalysisSnapshot) => PlanState,
  (
    snapshot: Snapshot.AnalysisSnapshot,
    reportVariant: ApiReportVariant,
    entity: Snapshot.CollectorEntity,
    handled: HashSet.HashSet<number>,
    exportsToEmit: ReadonlyArray<ExportToEmit>,
  ) => PlanState
>(5, (
  snapshot: Snapshot.AnalysisSnapshot,
  reportVariant: ApiReportVariant,
  entity: Snapshot.CollectorEntity,
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
}))

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

export const associatedMessagesOf = dual<
  (astDeclaration: Snapshot.AstDeclaration) => (state: MessageSelectionState) => SelectedMessages,
  (state: MessageSelectionState, astDeclaration: Snapshot.AstDeclaration) => SelectedMessages
>(2, (
  state: MessageSelectionState,
  astDeclaration: Snapshot.AstDeclaration,
): SelectedMessages => {
  const selected = Snapshot.reportMessages(state.snapshot).associatedReportMessages(
    Snapshot.messageLog(state.snapshot),
    astDeclaration.declarationId,
    effectivelyHandled(state),
  )
  return {
    messages: Arr.map(selected, (candidate) => candidate.message),
    consumed: HashSet.union(
      state.consumed,
      HashSet.fromIterable(Arr.map(selected, (candidate) => candidate.index)),
    ),
  }
})

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

export const writeLineAsComments = dual<
  (line: string) => (writer: TextWriter.TextWriter) => TextWriter.TextWriter,
  (writer: TextWriter.TextWriter, line: string) => TextWriter.TextWriter
>(2, (writer: TextWriter.TextWriter, line: string): TextWriter.TextWriter =>
  Arr.reduce(
    Arr.fromIterable(convertToLf(line).split('\n')),
    writer,
    (current, realLine) => TextWriter.writeLine(TextWriter.write(TextWriter.write(current, '// '), realLine)),
  ))

const hasCustomBlock = (apiItemMetadata: Snapshot.ApiItemMetadata, tag: string): boolean =>
  Option.match(apiItemMetadata.tsdocComment, {
    onNone: () => false,
    onSome: (tsdocComment) =>
      Arr.some(Chunk.toReadonlyArray(tsdocComment.customBlocks), (block) => block.blockTag.tagName === tag),
  })

const hasModifierTag = (apiItemMetadata: Snapshot.ApiItemMetadata, tag: string): boolean =>
  Option.match(apiItemMetadata.tsdocComment, {
    onNone: () => false,
    onSome: (tsdocComment) => tsdocComment.modifierTagSet.hasTagName(tag),
  })

const hasDeprecatedBlock = (apiItemMetadata: Snapshot.ApiItemMetadata): boolean =>
  Option.match(apiItemMetadata.tsdocComment, {
    onNone: () => false,
    onSome: (tsdocComment) => Option.isSome(tsdocComment.deprecatedBlock),
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
  apiItemMetadata: Snapshot.ApiItemMetadata,
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

const standardTagNames = (apiItemMetadata: Snapshot.ApiItemMetadata, tags: StandardTagsConfig): ReadonlyArray<string> =>
  Arr.map(
    Arr.filter(standardTagRulesOf(apiItemMetadata, tags), (rule) => rule.shouldReport && rule.isPresent),
    (rule) => rule.tagName,
  )

const customTagAdmitted = (
  apiItemMetadata: Snapshot.ApiItemMetadata,
  tag: string,
  shouldReport: boolean | undefined,
): boolean =>
  Match.value(shouldReport === true).pipe(
    Match.when(true, () => hasCustomBlock(apiItemMetadata, tag) || hasModifierTag(apiItemMetadata, tag)),
    Match.when(false, () => false),
    Match.exhaustive,
  )

const customTagNames = (
  apiItemMetadata: Snapshot.ApiItemMetadata,
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

export interface AedocSynopsis {
  readonly text: string
  readonly snapshot: Snapshot.AnalysisSnapshot
}

export const getAedocSynopsis = dual<
  (
    astDeclaration: Snapshot.AstDeclaration,
    messagesToReport: ReadonlyArray<ExtractorMessage>,
  ) => (snapshot: Snapshot.AnalysisSnapshot) => AedocSynopsis,
  (
    snapshot: Snapshot.AnalysisSnapshot,
    astDeclaration: Snapshot.AstDeclaration,
    messagesToReport: ReadonlyArray<ExtractorMessage>,
  ) => AedocSynopsis
>(3, (
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
  messagesToReport: ReadonlyArray<ExtractorMessage>,
): AedocSynopsis =>
  Match.value(Snapshot.isAncillaryDeclaration(snapshot, astDeclaration)).pipe(
    Match.when(true, (): AedocSynopsis => ({ text: '', snapshot })),
    Match.orElse(() => aedocSynopsisOf(snapshot, astDeclaration, messagesToReport)),
  ))

const aedocSynopsisOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
  messagesToReport: ReadonlyArray<ExtractorMessage>,
): AedocSynopsis => {
  const footer = aedocFooterPartsOf(snapshot, astDeclaration)
  const lines = synopsisLinesOf(snapshot, astDeclaration, messagesToReport)

  return Match.value(footer.parts.length > 0).pipe(
    Match.when(true, () => {
      const withSeparator = Match.value(messagesToReport.length > 0).pipe(
        Match.when(true, () => writeLineAsComments(lines, '')),
        Match.when(false, () => lines),
        Match.exhaustive,
      )
      return {
        text: TextWriter.getText(writeLineAsComments(withSeparator, footer.parts.join(' '))),
        snapshot: footer.snapshot,
      }
    }),
    Match.when(false, () => ({ text: TextWriter.getText(lines), snapshot: footer.snapshot })),
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

interface AedocFooter {
  readonly parts: ReadonlyArray<string>
  readonly snapshot: Snapshot.AnalysisSnapshot
}

const aedocFooterPartsOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
): AedocFooter => {
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
    Match.when(true, (): AedocFooter => ({
      parts: Arr.append(footerParts, '(undocumented)'),
      snapshot: Snapshot.addAnalyzerIssue(
        snapshot,
        ExtractorMessageId.Undocumented,
        `Missing documentation for "${Snapshot.localName(snapshot, astDeclaration)}".`,
        astDeclaration,
        undefined,
      ),
    })),
    Match.when(false, (): AedocFooter => ({ parts: footerParts, snapshot })),
    Match.exhaustive,
  )
}

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

export const shouldIncludeDeclaration = dual<
  (astDeclaration: Snapshot.AstDeclaration) => (state: PlanState) => boolean,
  (state: PlanState, astDeclaration: Snapshot.AstDeclaration) => boolean
>(2, (
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
  ))

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
): Result.Result<Snapshot.AstDeclaration, RenderFailure> =>
  Match.value(Snapshot.isSupportedDeclarationKind(tree.kind)).pipe(
    Match.when(true, () => Snapshot.childDeclarationByNode(state.snapshot, tree.node, astDeclaration)),
    Match.when(false, () => Result.succeed(astDeclaration)),
    Match.exhaustive,
  )

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
  const names = syntheticParameterNames(Arr.fromIterable(signatureTree.node.getChildren()))
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
  Match.value(isExportKeywordInNamespaceExportDeclaration(tree.node)).pipe(
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
  referencedEntity: Snapshot.CollectorEntity,
): Result.Result<PlanState, RenderFailure> =>
  Option.match(Option.filter(referencedEntity.nameForEmit, (name) => name.length > 0), {
    onNone: () => internalInvariantOf('referencedEntry.nameForEmit is undefined'),
    onSome: (nameForEmit) => Result.succeed({ ...state, plan: SpanPlan.withPrefix(state.plan, tree, nameForEmit) }),
  })

const handleIdentifier = (state: PlanState, tree: SpanTree): Result.Result<PlanState, RenderFailure> =>
  Match.value(tree.node).pipe(
    Match.when(
      ts.isIdentifier,
      (identifier) =>
        Result.flatMap(
          Snapshot.tryGetEntityForNode(state.snapshot, identifier),
          (referenced) =>
            Option.match(referenced, {
              onNone: () => Result.succeed(state),
              onSome: (referencedEntity) => identifierPrefixOf(state, tree, referencedEntity),
            }),
        ),
    ),
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
): Result.Result<PlanState, RenderFailure> =>
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

const handleImportType = (
  state: PlanState,
  tree: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
): Result.Result<PlanState, RenderFailure> =>
  Result.map(
    planImportTypeSpan({
      state,
      snapshot: state.snapshot,
      tree,
      astDeclaration,
      planNestedSpan: (currentState, span, previousSibling, nestedDeclaration) =>
        planDeclarationSpan(
          currentState,
          span,
          Option.some(tree),
          previousSibling,
          nestedDeclaration,
          insideTypeLiteral,
        ),
    }),
    (planned) => ({ ...planned.state, plan: planned.plan }),
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
): Result.Result<PlannedSpan, RenderFailure> =>
  Match.value(tree.kind).pipe(
    Match.when(ts.SyntaxKind.JSDocComment, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.succeed({
        state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) },
        recurseChildren: false,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.ExportKeyword, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.succeed({
        state: handleExportKeyword(state, tree),
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.DefaultKeyword, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.succeed({
        state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) },
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.DeclareKeyword, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.succeed({
        state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) },
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.SyntaxList, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.succeed({
        state,
        recurseChildren: true,
        sortChildren: sortChildrenFor(parent),
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.VariableDeclaration, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.map(handleVariableDeclaration(state, tree, parent), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      }))),
    Match.when(ts.SyntaxKind.Parameter, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.succeed({
        state: handleParameter(state, parent),
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      })),
    Match.when(ts.SyntaxKind.TypeLiteral, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.succeed({ state, recurseChildren: true, sortChildren: false, insideTypeLiteral: true })),
    Match.when(ts.SyntaxKind.Identifier, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.map(handleIdentifier(state, tree), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      }))),
    Match.when(ts.SyntaxKind.ImportType, (): Result.Result<PlannedSpan, RenderFailure> =>
      Result.map(handleImportType(state, tree, astDeclaration, insideTypeLiteral), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
        sortChildren: false,
        insideTypeLiteral,
      }))),
    Match.orElse((): Result.Result<PlannedSpan, RenderFailure> =>
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
): Result.Result<ChildWalk, RenderFailure> =>
  Result.flatMap(nestedDeclarationOf(walk.state, child, astDeclaration), (childAstDeclaration) => {
    const afterChildPrefix = Match.value(Snapshot.isSupportedDeclarationKind(child.kind)).pipe(
      Match.when(true, () =>
        Match.value(shouldIncludeDeclaration(walk.state, childAstDeclaration)).pipe(
          Match.when(true, () =>
            planIncludedChild(walk.state, tree, child, childAstDeclaration, insideTypeLiteral, sortChildren)),
          Match.when(false, (): Result.Result<PlanState, RenderFailure> =>
            Result.succeed(walk.state)),
          Match.exhaustive,
        )),
      Match.when(false, (): Result.Result<PlanState, RenderFailure> => Result.succeed(walk.state)),
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
  })

const planIncludedChild = (
  state: PlanState,
  tree: SpanTree,
  child: SpanTree,
  childAstDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
  sortChildren: boolean,
): Result.Result<PlanState, RenderFailure> => {
  const afterSortKeys = Match.value(sortChildren).pipe(
    Match.when(true, () => planSortKeys(state, tree, child, childAstDeclaration)),
    Match.when(false, (): Result.Result<PlanState, RenderFailure> => Result.succeed(state)),
    Match.exhaustive,
  )
  return Result.flatMap(afterSortKeys, (plannedState) =>
    Match.value(insideTypeLiteral).pipe(
      Match.when(true, (): Result.Result<PlanState, RenderFailure> => Result.succeed(plannedState)),
      Match.when(false, () => planAedocPrefix(plannedState, child, childAstDeclaration)),
      Match.exhaustive,
    ))
}

const planSortKeys = (
  state: PlanState,
  tree: SpanTree,
  child: SpanTree,
  childAstDeclaration: Snapshot.AstDeclaration,
): Result.Result<PlanState, RenderFailure> => {
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
): Result.Result<PlanState, RenderFailure> => {
  const selected = associatedMessagesOf(state, childAstDeclaration)
  const aedocSynopsis = getAedocSynopsis(state.snapshot, childAstDeclaration, selected.messages)
  return Result.succeed({
    ...state,
    snapshot: aedocSynopsis.snapshot,
    consumed: selected.consumed,
    plan: SpanPlan.prependPrefix(state.plan, child, aedocSynopsis.text),
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

export const planForPreapproved = dual<
  (tree: SpanTree) => (plan: SpanPlan.SpanPlan) => SpanPlan.SpanPlan,
  (plan: SpanPlan.SpanPlan, tree: SpanTree) => SpanPlan.SpanPlan
>(
  2,
  (plan: SpanPlan.SpanPlan, tree: SpanTree): SpanPlan.SpanPlan =>
    Arr.reduce(tree.children, { plan, skipRest: false } satisfies PreapprovedWalk, plannedPreapprovedChild).plan,
)

export const planDeclarationSpan = dual<
  (
    tree: SpanTree,
    parent: Option.Option<SpanTree>,
    previousSibling: Option.Option<SpanTree>,
    astDeclaration: Snapshot.AstDeclaration,
    insideTypeLiteral: boolean,
  ) => (state: PlanState) => Result.Result<PlanState, RenderFailure>,
  (
    state: PlanState,
    tree: SpanTree,
    parent: Option.Option<SpanTree>,
    previousSibling: Option.Option<SpanTree>,
    astDeclaration: Snapshot.AstDeclaration,
    insideTypeLiteral: boolean,
  ) => Result.Result<PlanState, RenderFailure>
>(6, (
  state: PlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  previousSibling: Option.Option<SpanTree>,
  astDeclaration: Snapshot.AstDeclaration,
  insideTypeLiteral: boolean,
): Result.Result<PlanState, RenderFailure> =>
  Match.value(shouldIncludeDeclaration(state, astDeclaration)).pipe(
    Match.when(false, () => Result.succeed({ ...state, plan: SpanPlan.skipAll(state.plan, tree) })),
    Match.when(true, () => planIncludedSpan(state, tree, parent, previousSibling, insideTypeLiteral, astDeclaration)),
    Match.exhaustive,
  ))

const planIncludedSpan = (
  state: PlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  previousSibling: Option.Option<SpanTree>,
  insideTypeLiteral: boolean,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<PlanState, RenderFailure> =>
  Result.flatMap(
    plannedSpanOf(state, tree, parent, previousSibling, insideTypeLiteral, astDeclaration),
    (planned) => {
      const initial: Result.Result<ChildWalk, RenderFailure> = Result.succeed({
        state: planned.state,
        previous: Option.none(),
      })
      return Match.value(planned.recurseChildren).pipe(
        Match.when(false, (): Result.Result<PlanState, RenderFailure> => Result.succeed(planned.state)),
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
