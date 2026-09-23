import { Chunk, HashMap, HashSet, Option, Result } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import * as SourceFileLocationFormatter from '../analyzer/SourceFileLocationFormatter.js'
import * as SyntaxHelpers from '../analyzer/SyntaxHelpers.js'
import * as TypeScriptHelpers from '../analyzer/TypeScriptHelpers.js'
import type { NodeId } from '../analyzer/TypeScriptInternals.js'
import * as Snapshot from '../collector/analysis-snapshot.js'
import type { MessageLog } from '../collector/message-log.js'
import { UnsupportedStarExportError } from '../errors/index.js'
import { ReleaseTag } from '../model/index.js'
import {
  emitNamedExport,
  emitStarExports,
  entityNameOf,
  internalInvariantOf,
  isExportKeywordInNamespaceExportDeclaration,
  planImportTypeSpan,
  type RenderFailure,
  writeImports,
} from './dts-emit-helpers.js'
import {
  formatAliasDeclarations,
  formatAliasExportClause,
  type NamespaceAlias,
  type NamespaceMember,
  type NamespaceMemberKind,
  planNamespaceAliases,
} from './namespace-aliaser.js'
import * as RenderSpan from './render-span.js'
import * as SpanPlan from './span-plan.js'
import * as SpanTreeModule from './span-tree.js'
import type { SpanTree } from './span-tree.js'
import * as TextWriter from './text-writer.js'

export enum DtsRollupKind {
  InternalRelease = 0,
  AlphaRelease = 1,
  BetaRelease = 2,
  PublicRelease = 3,
}

const ADMITTED_RELEASE_TAGS: Readonly<Record<DtsRollupKind, ReadonlyArray<ReleaseTag> | undefined>> = {
  [DtsRollupKind.InternalRelease]: undefined,
  [DtsRollupKind.AlphaRelease]: [ReleaseTag.Alpha, ReleaseTag.Beta, ReleaseTag.Public, ReleaseTag.None],
  [DtsRollupKind.BetaRelease]: [ReleaseTag.Beta, ReleaseTag.Public, ReleaseTag.None],
  [DtsRollupKind.PublicRelease]: [ReleaseTag.Public, ReleaseTag.None],
}

const shouldIncludeReleaseTag = (releaseTag: ReleaseTag, dtsKind: DtsRollupKind): boolean =>
  Option.match(Option.fromNullishOr(ADMITTED_RELEASE_TAGS[dtsKind]), {
    onNone: () => true,
    onSome: (admitted) => Arr.some(admitted, (candidate) => candidate === releaseTag),
  })

const isNamespaceImportKind = (astImport: Snapshot.AstImport): boolean =>
  Arr.some(
    [Snapshot.AstImportKind.StarImport, Snapshot.AstImportKind.EqualsImport, Snapshot.AstImportKind.ImportType],
    (kind) => kind === astImport.importKind,
  )

const classifyNamespaceMember = (
  snapshot: Snapshot.AnalysisSnapshot,
  ref: Snapshot.AstEntityRef,
): Result.Result<NamespaceMemberKind, RenderFailure> =>
  Match.value(ref).pipe(
    Match.tag('AstNamespaceImportRef', (): Result.Result<NamespaceMemberKind, RenderFailure> =>
      Result.succeed('namespace')),
    Match.tag('AstImportRef', (): Result.Result<NamespaceMemberKind, RenderFailure> =>
      Option.match(Snapshot.astImportOf(snapshot, ref), {
        onNone: () =>
          internalInvariantOf('Missing AstImport for an AstImportRef'),
        onSome: (astImport) =>
          Match.value(isNamespaceImportKind(astImport)).pipe(
            Match.when(true, (): Result.Result<NamespaceMemberKind, RenderFailure> =>
              Result.succeed('namespace')),
            Match.when(false, (): Result.Result<NamespaceMemberKind, RenderFailure> =>
              Result.succeed(isTypeOnlyMemberKindOf(astImport.isTypeOnlyEverywhere))),
            Match.exhaustive,
          ),
      })),
    Match.tag('AstSymbolRef', (): Result.Result<NamespaceMemberKind, RenderFailure> =>
      Option.match(Snapshot.astSymbolOf(snapshot, ref), {
        onNone: () =>
          internalInvariantOf('Missing AstSymbol for an AstSymbolRef'),
        onSome: (astSymbol) =>
          Result.succeed(symbolMemberKindOf(Snapshot.symbolFlags(snapshot, astSymbol))),
      })),
    Match.exhaustive,
  )

const isTypeOnlyMemberKindOf = (isTypeOnlyEverywhere: boolean): NamespaceMemberKind =>
  Match.value(isTypeOnlyEverywhere).pipe(
    Match.when(true, (): NamespaceMemberKind => 'type'),
    Match.when(false, (): NamespaceMemberKind => 'value'),
    Match.exhaustive,
  )

const typeMemberKindOf = (flags: ts.SymbolFlags): NamespaceMemberKind =>
  Match.value((flags & ts.SymbolFlags.Type) !== 0).pipe(
    Match.when(true, (): NamespaceMemberKind => 'type'),
    Match.when(false, (): NamespaceMemberKind => 'value'),
    Match.exhaustive,
  )

const valueMemberKindOf = (flags: ts.SymbolFlags): NamespaceMemberKind =>
  Match.value((flags & ts.SymbolFlags.Value) !== 0).pipe(
    Match.when(true, (): NamespaceMemberKind => valueAndTypeMemberKindOf(flags)),
    Match.when(false, (): NamespaceMemberKind => typeMemberKindOf(flags)),
    Match.exhaustive,
  )

const valueAndTypeMemberKindOf = (flags: ts.SymbolFlags): NamespaceMemberKind =>
  Match.value((flags & ts.SymbolFlags.Type) !== 0).pipe(
    Match.when(true, (): NamespaceMemberKind => 'both'),
    Match.when(false, (): NamespaceMemberKind => 'value'),
    Match.exhaustive,
  )

const symbolMemberKindOf = (flags: ts.SymbolFlags): NamespaceMemberKind =>
  Match.value((flags & ts.SymbolFlags.Namespace) !== 0).pipe(
    Match.when(true, (): NamespaceMemberKind => 'namespace'),
    Match.when(false, (): NamespaceMemberKind => valueMemberKindOf(flags)),
    Match.exhaustive,
  )

const KEYWORD_MODIFIER_KINDS: ReadonlyArray<ts.SyntaxKind> = [
  ts.SyntaxKind.InterfaceKeyword,
  ts.SyntaxKind.ClassKeyword,
  ts.SyntaxKind.EnumKeyword,
  ts.SyntaxKind.NamespaceKeyword,
  ts.SyntaxKind.ModuleKeyword,
  ts.SyntaxKind.TypeKeyword,
  ts.SyntaxKind.FunctionKeyword,
]

const isKeywordNeedingModifiers = (kind: ts.SyntaxKind): boolean =>
  Arr.some(KEYWORD_MODIFIER_KINDS, (candidate) => candidate === kind)

interface RollupPlanState {
  readonly snapshot: Snapshot.AnalysisSnapshot
  readonly entity: Snapshot.CollectorEntity
  readonly dtsKind: DtsRollupKind
  readonly ids: HashMap.HashMap<NodeId, SpanTree>
  readonly plan: SpanPlan.SpanPlan
}

interface RollupEmitState {
  readonly snapshot: Snapshot.AnalysisSnapshot
  readonly writer: TextWriter.TextWriter
  readonly reservedNames: HashSet.HashSet<string>
}

interface PlannedRollupSpan {
  readonly state: RollupPlanState
  readonly recurseChildren: boolean
}

interface TrimmedSpan {
  readonly state: RollupPlanState
  readonly trimmed: boolean
}

interface RollupChildWalk {
  readonly state: RollupPlanState
  readonly previous: Option.Option<SpanTree>
}

const handleKeywordModifiers = (
  state: RollupPlanState,
  tree: SpanTree,
  previousSibling: Option.Option<SpanTree>,
  astDeclaration: Snapshot.AstDeclaration,
): RollupPlanState => {
  const declaredPrefix = Match.value(Option.isNone(astDeclaration.parentDeclarationId)).pipe(
    Match.when(true, () => 'declare '),
    Match.when(false, () => ''),
    Match.exhaustive,
  )
  const replacedModifiers = Match.value(state.entity.shouldInlineExport).pipe(
    Match.when(true, () => `export ${declaredPrefix}`),
    Match.when(false, () => declaredPrefix),
    Match.exhaustive,
  )
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

const variableDeclarationPlanOf = (
  state: RollupPlanState,
  tree: SpanTree,
  list: ts.VariableDeclarationList,
  astDeclaration: Snapshot.AstDeclaration,
): RollupPlanState => {
  const firstDeclarationStart = Option.getOrElse(
    Option.map(Arr.head(list.declarations), (declaration) => declaration.getStart()),
    () => list.getStart(),
  )
  const listPrefix = list.getSourceFile().text.substring(list.getStart(), firstDeclarationStart)
  const withListPrefix = {
    ...state,
    plan: SpanPlan.prependPrefix(SpanPlan.withSuffix(state.plan, tree, ';'), tree, `declare ${listPrefix}`),
  }
  const withExport = Match.value(state.entity.shouldInlineExport).pipe(
    Match.when(true, () => ({ ...withListPrefix, plan: SpanPlan.prependPrefix(withListPrefix.plan, tree, 'export ') })),
    Match.when(false, () => withListPrefix),
    Match.exhaustive,
  )
  return Option.match(Snapshot.fetchDeclarationMetadata(state.snapshot, astDeclaration).tsdocParserContext, {
    onNone: () => withExport,
    onSome: (parserContext) => {
      const commentText = parserContext.sourceRange.toString()
      const originalComment = Match.value(/\r?\n\s*$/.test(commentText)).pipe(
        Match.when(true, () => commentText),
        Match.when(false, () => `${commentText}\n`),
        Match.exhaustive,
      )
      return {
        ...withExport,
        plan: SpanPlan.prependPrefix(
          SpanPlan.withIndentDocComment(withExport.plan, tree, 'prefixOnly'),
          tree,
          originalComment,
        ),
      }
    },
  })
}

const handleVariableDeclaration = (
  state: RollupPlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<RollupPlanState, RenderFailure> =>
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
          onSome: (list) => Result.succeed(variableDeclarationPlanOf(state, tree, list, astDeclaration)),
        },
      ),
  })

const handleIdentifier = (state: RollupPlanState, tree: SpanTree): Result.Result<RollupPlanState, RenderFailure> =>
  Match.value(tree.node).pipe(
    Match.when(
      ts.isIdentifier,
      (identifier) =>
        Result.flatMap(
          Snapshot.tryGetEntityForNode(state.snapshot, identifier),
          (referenced) =>
            Option.match(referenced, {
              onNone: () => Result.succeed(state),
              onSome: (referencedEntity) =>
                Option.match(Option.filter(referencedEntity.nameForEmit, (name) => name.length > 0), {
                  onNone: () => internalInvariantOf('referencedEntry.nameForEmit is undefined'),
                  onSome: (nameForEmit) =>
                    Result.succeed({ ...state, plan: SpanPlan.withPrefix(state.plan, tree, nameForEmit) }),
                }),
            }),
        ),
    ),
    Match.orElse(() => Result.succeed(state)),
  )

const plannedImportTypeOf = (
  state: RollupPlanState,
  tree: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<RollupPlanState, RenderFailure> =>
  Result.map(
    planImportTypeSpan({
      state,
      snapshot: state.snapshot,
      tree,
      astDeclaration,
      planNestedSpan: (currentState, span, nestedPreviousSibling, nestedDeclaration) =>
        planSpanOf(currentState, span, Option.some(tree), nestedPreviousSibling, nestedDeclaration),
    }),
    (planned) => ({ ...planned.state, plan: planned.plan }),
  )

const packageDocumentationRegex = /(?:\s|\*)@packageDocumentation(?:\s|\*)/gi

const plannedSpanKindOf = (
  state: RollupPlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  previousSibling: Option.Option<SpanTree>,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<PlannedRollupSpan, RenderFailure> =>
  Match.value(tree.kind).pipe(
    Match.when(ts.SyntaxKind.JSDocComment, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Result.succeed({
        state: Match.value(Option.fromNullishOr(SpanTreeModule.originalText(tree).match(packageDocumentationRegex)))
          .pipe(
            Match.when(Option.isSome, () => ({ ...state, plan: SpanPlan.skipAll(state.plan, tree) })),
            Match.when(Option.isNone, () => state),
            Match.exhaustive,
          ),
        recurseChildren: false,
      })),
    Match.when(ts.SyntaxKind.ExportKeyword, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Result.succeed({
        state: Match.value(isExportKeywordInNamespaceExportDeclaration(tree.node)).pipe(
          Match.when(true, () => state),
          Match.when(false, () => ({ ...state, plan: SpanPlan.skipAll(state.plan, tree) })),
          Match.exhaustive,
        ),
        recurseChildren: true,
      })),
    Match.when(ts.SyntaxKind.DefaultKeyword, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Result.succeed({ state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) }, recurseChildren: true })),
    Match.when(ts.SyntaxKind.DeclareKeyword, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Result.succeed({ state: { ...state, plan: SpanPlan.skipAll(state.plan, tree) }, recurseChildren: true })),
    Match.when(ts.SyntaxKind.VariableDeclaration, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Result.map(handleVariableDeclaration(state, tree, parent, astDeclaration), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
      }))),
    Match.when(ts.SyntaxKind.Identifier, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Result.map(handleIdentifier(state, tree), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
      }))),
    Match.when(ts.SyntaxKind.ImportType, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Result.map(plannedImportTypeOf(state, tree, astDeclaration), (plannedState) => ({
        state: plannedState,
        recurseChildren: true,
      }))),
    Match.orElse((): Result.Result<PlannedRollupSpan, RenderFailure> =>
      Match.value(isKeywordNeedingModifiers(tree.kind)).pipe(
        Match.when(true, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
          Result.succeed({
            state: handleKeywordModifiers(state, tree, previousSibling, astDeclaration),
            recurseChildren: true,
          })),
        Match.when(false, (): Result.Result<PlannedRollupSpan, RenderFailure> =>
          Result.succeed({ state, recurseChildren: true })),
        Match.exhaustive,
      )
    ),
  )

const plannedSpanChildrenOf = (
  planned: PlannedRollupSpan,
  tree: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<RollupPlanState, RenderFailure> =>
  Match.value(planned.recurseChildren).pipe(
    Match.when(false, (): Result.Result<RollupPlanState, RenderFailure> => Result.succeed(planned.state)),
    Match.when(true, () => {
      const initial: Result.Result<RollupChildWalk, RenderFailure> = Result.succeed({
        state: planned.state,
        previous: Option.none(),
      })
      return Result.map(
        Arr.reduce(tree.children, initial, (accumulated, child) =>
          Result.flatMap(accumulated, (walk) =>
            plannedChildOf(walk, tree, child, astDeclaration))),
        (walk) =>
          walk.state,
      )
    }),
    Match.exhaustive,
  )

const planSpanOf = (
  state: RollupPlanState,
  tree: SpanTree,
  parent: Option.Option<SpanTree>,
  previousSibling: Option.Option<SpanTree>,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<RollupPlanState, RenderFailure> =>
  Result.flatMap(
    plannedSpanKindOf(state, tree, parent, previousSibling, astDeclaration),
    (planned) => plannedSpanChildrenOf(planned, tree, astDeclaration),
  )

const trimmedSpanOf = (
  state: RollupPlanState,
  child: SpanTree,
  childAstDeclaration: Snapshot.AstDeclaration,
): TrimmedSpan => {
  const nodeToTrim = Match.value(child.kind === ts.SyntaxKind.VariableDeclaration).pipe(
    Match.when(true, () =>
      Option.getOrElse(
        SpanTreeModule.findFirstParent(
          child,
          state.ids,
          (node) => node.kind === ts.SyntaxKind.VariableStatement,
        ),
        () => child,
      )),
    Match.when(false, () => child),
    Match.exhaustive,
  )
  const name = Snapshot.localName(state.snapshot, childAstDeclaration)
  const trimmingPrefix = Match.value(Snapshot.extractorConfig(state.snapshot).dtsRollup.omitTrimmingComments !== true)
    .pipe(
      Match.when(true, () => `/* Excluded from this release type: ${name} */`),
      Match.when(false, () => ''),
      Match.exhaustive,
    )
  const lastChildSeparator = Match.value(nodeToTrim.children.length > 0).pipe(
    Match.when(
      true,
      () => Option.getOrElse(Option.map(Arr.last(nodeToTrim.children), (lastChild) => lastChild.separator), () => ''),
    ),
    Match.when(false, () => ''),
    Match.exhaustive,
  )
  const commaSibling = Option.filter(
    SpanTreeModule.nextSiblingOf(nodeToTrim, state.ids),
    (sibling) => sibling.kind === ts.SyntaxKind.CommaToken,
  )
  const suffix = `${lastChildSeparator}${
    Option.getOrElse(Option.map(commaSibling, (sibling) => sibling.separator), () => '')
  }`
  const withTrim = SpanPlan.withSuffix(
    SpanPlan.withPrefix(SpanPlan.omitChildren(state.plan, nodeToTrim), nodeToTrim, trimmingPrefix),
    nodeToTrim,
    suffix,
  )
  const withSkippedComma = Option.match(commaSibling, {
    onNone: () => withTrim,
    onSome: (sibling) => SpanPlan.skipAll(withTrim, sibling),
  })
  const normalized = Match.value(suffix.trim().length === 0 && trimmingPrefix.trim().length === 0).pipe(
    Match.when(true, () => SpanPlan.withSuffix(SpanPlan.withPrefix(withSkippedComma, nodeToTrim, ''), nodeToTrim, '')),
    Match.when(false, () => withSkippedComma),
    Match.exhaustive,
  )
  return { state: { ...state, plan: normalized }, trimmed: true }
}

const trimChildSpan = (
  state: RollupPlanState,
  child: SpanTree,
  childAstDeclaration: Snapshot.AstDeclaration,
): Result.Result<TrimmedSpan, RenderFailure> =>
  Match.value(
    shouldIncludeReleaseTag(
      Snapshot.fetchApiItemMetadata(state.snapshot, childAstDeclaration).effectiveReleaseTag,
      state.dtsKind,
    ),
  ).pipe(
    Match.when(true, (): Result.Result<TrimmedSpan, RenderFailure> => Result.succeed({ state, trimmed: false })),
    Match.when(false, (): Result.Result<TrimmedSpan, RenderFailure> =>
      Result.succeed(trimmedSpanOf(state, child, childAstDeclaration))),
    Match.exhaustive,
  )

const plannedChildOf = (
  walk: RollupChildWalk,
  tree: SpanTree,
  child: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
): Result.Result<RollupChildWalk, RenderFailure> =>
  Match.value(Snapshot.isSupportedDeclarationKind(child.kind)).pipe(
    Match.when(true, (): Result.Result<RollupChildWalk, RenderFailure> =>
      Result.flatMap(
        Snapshot.childDeclarationByNode(walk.state.snapshot, child.node, astDeclaration),
        (childDeclaration) =>
          Result.flatMap(trimChildSpan(walk.state, child, childDeclaration), (trimmed) =>
            Match.value(trimmed.trimmed).pipe(
              Match.when(true, (): Result.Result<RollupChildWalk, RenderFailure> =>
                Result.succeed({ state: trimmed.state, previous: Option.some(child) })),
              Match.when(false, (): Result.Result<RollupChildWalk, RenderFailure> =>
                Result.map(
                  planSpanOf(trimmed.state, child, Option.some(tree), walk.previous, childDeclaration),
                  (state) => ({ state, previous: Option.some(child) }),
                )),
              Match.exhaustive,
            )),
      )),
    Match.when(false, (): Result.Result<RollupChildWalk, RenderFailure> =>
      Result.map(
        planSpanOf(walk.state, child, Option.some(tree), walk.previous, astDeclaration),
        (state) => ({ state, previous: Option.some(child) }),
      )),
    Match.exhaustive,
  )

const maxEffectiveReleaseTagOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  ref: Snapshot.AstEntityRef,
): ReleaseTag =>
  Option.match(Snapshot.tryFetchMetadataForAstEntity(snapshot, ref), {
    onNone: () => ReleaseTag.None,
    onSome: (symbolMetadata) => symbolMetadata.maxEffectiveReleaseTag,
  })

const excludedEntityOf = (
  state: RollupEmitState,
  entity: Snapshot.CollectorEntity,
): RollupEmitState =>
  Match.value(Snapshot.extractorConfig(state.snapshot).dtsRollup.omitTrimmingComments !== true).pipe(
    Match.when(true, () => ({
      ...state,
      writer: TextWriter.writeLine(
        TextWriter.ensureSkippedLine(state.writer),
        `/* Excluded from this release type: ${entityNameOf(entity)} */`,
      ),
    })),
    Match.when(false, () => state),
    Match.exhaustive,
  )

const excludedDeclarationOf = (
  state: RollupEmitState,
  entity: Snapshot.CollectorEntity,
): RollupEmitState =>
  Match.value(Snapshot.extractorConfig(state.snapshot).dtsRollup.omitTrimmingComments !== true).pipe(
    Match.when(true, () => ({
      ...state,
      writer: TextWriter.writeLine(
        TextWriter.ensureSkippedLine(state.writer),
        `/* Excluded declaration from this release type: ${entityNameOf(entity)} */`,
      ),
    })),
    Match.when(false, () => state),
    Match.exhaustive,
  )

const emitDeclarationOf = (
  state: RollupEmitState,
  entity: Snapshot.CollectorEntity,
  astDeclaration: Snapshot.AstDeclaration,
  dtsKind: DtsRollupKind,
): Result.Result<RollupEmitState, RenderFailure> =>
  Match.value(
    shouldIncludeReleaseTag(Snapshot.fetchApiItemMetadata(state.snapshot, astDeclaration).effectiveReleaseTag, dtsKind),
  ).pipe(
    Match.when(false, (): Result.Result<RollupEmitState, RenderFailure> =>
      Result.succeed(excludedDeclarationOf(state, entity))),
    Match.when(true, (): Result.Result<RollupEmitState, RenderFailure> =>
      Result.flatMap(Snapshot.declaration(state.snapshot, astDeclaration), (declarationNode) => {
        const tree = SpanTreeModule.build(declarationNode)
        return Result.map(
          planSpanOf(
            { snapshot: state.snapshot, entity, dtsKind, ids: SpanTreeModule.index(tree), plan: SpanPlan.empty },
            tree,
            Option.none(),
            Option.none(),
            astDeclaration,
          ),
          (planned) => ({
            ...state,
            snapshot: planned.snapshot,
            writer: TextWriter.ensureNewLine(
              RenderSpan.writeSpan(tree, planned.plan, TextWriter.ensureSkippedLine(state.writer)),
            ),
          }),
        )
      })),
    Match.exhaustive,
  )

const plannedNamespaceMemberOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  namespaceName: string,
  exportedName: string,
  exportedRef: Snapshot.AstEntityRef,
  dtsKind: DtsRollupKind,
): Result.Result<Option.Option<NamespaceMember>, RenderFailure> =>
  Option.match(Snapshot.tryGetCollectorEntity(snapshot, exportedRef), {
    onNone: () =>
      internalInvariantOf(
        `Cannot find collector entity for ${namespaceName}.${Snapshot.localName(snapshot, exportedRef)}`,
      ),
    onSome: (memberEntity) =>
      Match.value(shouldIncludeReleaseTag(maxEffectiveReleaseTagOf(snapshot, exportedRef), dtsKind)).pipe(
        Match.when(
          false,
          (): Result.Result<Option.Option<NamespaceMember>, RenderFailure> => Result.succeed(Option.none()),
        ),
        Match.when(
          true,
          (): Result.Result<Option.Option<NamespaceMember>, RenderFailure> =>
            Result.flatMap(
              classifyNamespaceMember(snapshot, exportedRef),
              (kind) =>
                Option.match(Option.filter(memberEntity.nameForEmit, (name) => name.length > 0), {
                  onNone: (): Result.Result<Option.Option<NamespaceMember>, RenderFailure> =>
                    internalInvariantOf(
                      `referencedEntry.nameForEmit is undefined for ${Snapshot.localName(snapshot, exportedRef)}`,
                    ),
                  onSome: (targetName): Result.Result<Option.Option<NamespaceMember>, RenderFailure> =>
                    Result.succeed(Option.some({ memberName: exportedName, targetName, kind })),
                }),
            ),
        ),
        Match.exhaustive,
      ),
  })

const plannedMembersOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  exportedLocalEntities: Chunk.Chunk<readonly [string, Snapshot.AstEntityRef]>,
  namespaceName: string,
  dtsKind: DtsRollupKind,
): Result.Result<ReadonlyArray<NamespaceMember>, RenderFailure> => {
  const initial: Result.Result<ReadonlyArray<NamespaceMember>, RenderFailure> = Result.succeed([])
  return Arr.reduce(
    Chunk.toReadonlyArray(exportedLocalEntities),
    initial,
    (accumulated, [exportedName, exportedRef]) =>
      Result.flatMap(accumulated, (members) =>
        Result.map(
          plannedNamespaceMemberOf(snapshot, namespaceName, exportedName, exportedRef, dtsKind),
          (member) =>
            Option.match(member, {
              onNone: () => members,
              onSome: (planned) => Arr.append(members, planned),
            }),
        )),
  )
}

const aliasedStateOf = (
  state: RollupEmitState,
  namespaceName: string,
  members: ReadonlyArray<NamespaceMember>,
): { readonly state: RollupEmitState; readonly aliases: ReadonlyArray<NamespaceAlias> } => {
  const aliases = planNamespaceAliases(namespaceName, members, state.reservedNames)
  return {
    state: {
      ...state,
      reservedNames: Arr.reduce(
        aliases,
        state.reservedNames,
        (reserved, alias) => HashSet.add(reserved, alias.aliasName),
      ),
    },
    aliases,
  }
}

const namespaceWriterOf = (
  state: RollupEmitState,
  entity: Snapshot.CollectorEntity,
  namespaceName: string,
  aliases: ReadonlyArray<NamespaceAlias>,
): RollupEmitState => {
  const afterDeclarations = Arr.reduce(
    aliases,
    TextWriter.ensureSkippedLine(state.writer),
    (writer, alias) =>
      Arr.reduce(
        formatAliasDeclarations(alias),
        writer,
        (current, declaration) => TextWriter.writeLine(current, declaration),
      ),
  )
  const afterGap = TextWriter.ensureSkippedLine(afterDeclarations)
  const afterInlineExport = Match.value(entity.shouldInlineExport).pipe(
    Match.when(true, () => TextWriter.write(afterGap, 'export ')),
    Match.when(false, () => afterGap),
    Match.exhaustive,
  )
  const afterHeader = TextWriter.writeLine(afterInlineExport, `declare namespace ${namespaceName} {`)
  const afterOpen = TextWriter.writeLine(TextWriter.increaseIndent(afterHeader), 'export {')
  const afterClauses = TextWriter.writeLine(
    TextWriter.increaseIndent(afterOpen),
    Arr.join(
      Arr.map(
        aliases,
        (alias) => formatAliasExportClause(alias, (name) => SyntaxHelpers.isSafeUnquotedMemberIdentifier(name)),
      ),
      ',\n',
    ),
  )
  return {
    ...state,
    writer: TextWriter.writeLine(
      TextWriter.decreaseIndent(TextWriter.writeLine(TextWriter.decreaseIndent(afterClauses), '}')),
      '}',
    ),
  }
}

const emitNamespaceBlock = (
  state: RollupEmitState,
  entity: Snapshot.CollectorEntity,
  astEntity: Snapshot.AstNamespaceImport,
  dtsKind: DtsRollupKind,
): Result.Result<RollupEmitState, RenderFailure> =>
  Option.match(Option.filter(entity.nameForEmit, (name) => name.length > 0), {
    onNone: () => internalInvariantOf('referencedEntry.nameForEmit is undefined'),
    onSome: (namespaceName) => {
      const exportInfo = Snapshot.fetchAstModuleExportInfo(state.snapshot, astEntity)
      return Match.value(Chunk.size(exportInfo.starExportedExternalModules) > 0).pipe(
        Match.when(
          true,
          (): Result.Result<RollupEmitState, RenderFailure> =>
            Result.flatMap(
              Snapshot.declaration(state.snapshot, astEntity),
              (declarationNode): Result.Result<RollupEmitState, RenderFailure> =>
                Result.fail(
                  new UnsupportedStarExportError({
                    namespaceName,
                    moduleSpecifier: SourceFileLocationFormatter.formatDeclaration(declarationNode),
                  }),
                ),
            ),
        ),
        Match.orElse(() =>
          Result.flatMap(
            plannedMembersOf(state.snapshot, exportInfo.exportedLocalEntities, namespaceName, dtsKind),
            (members) => {
              const aliased = aliasedStateOf(state, namespaceName, members)
              return Result.succeed(namespaceWriterOf(aliased.state, entity, namespaceName, aliased.aliases))
            },
          )
        ),
      )
    },
  })

const emitIncludedEntityOf = (
  state: RollupEmitState,
  entity: Snapshot.CollectorEntity,
  dtsKind: DtsRollupKind,
): Result.Result<RollupEmitState, RenderFailure> =>
  Match.value(entity.astEntity).pipe(
    Match.tag('AstSymbolRef', (): Result.Result<RollupEmitState, RenderFailure> =>
      Option.match(Snapshot.astSymbolOf(state.snapshot, entity.astEntity), {
        onNone: () =>
          internalInvariantOf('Missing AstSymbol for an AstSymbolRef'),
        onSome: (astSymbol) => {
          const initial: Result.Result<RollupEmitState, RenderFailure> = Result.succeed(state)
          return Arr.reduce(
            Snapshot.astDeclarations(state.snapshot, astSymbol),
            initial,
            (accumulated, astDeclaration) =>
              Result.flatMap(accumulated, (current) => emitDeclarationOf(current, entity, astDeclaration, dtsKind)),
          )
        },
      })),
    Match.tag('AstNamespaceImportRef', (): Result.Result<RollupEmitState, RenderFailure> =>
      Option.match(Snapshot.astNamespaceImportOf(state.snapshot, entity.astEntity), {
        onNone: () =>
          internalInvariantOf('Missing AstNamespaceImport for an AstNamespaceImportRef'),
        onSome: (astNamespaceImport) =>
          emitNamespaceBlock(state, entity, astNamespaceImport, dtsKind),
      })),
    Match.orElse((): Result.Result<RollupEmitState, RenderFailure> =>
      Result.succeed(state)
    ),
  )

const entitySuffixOf = (state: RollupEmitState, entity: Snapshot.CollectorEntity): RollupEmitState =>
  Match.value(entity.shouldInlineExport).pipe(
    Match.when(true, () => ({ ...state, writer: TextWriter.ensureSkippedLine(state.writer) })),
    Match.when(false, () => ({
      ...state,
      writer: TextWriter.ensureSkippedLine(
        Arr.reduce(
          Chunk.toReadonlyArray(entity.exportedNames),
          state.writer,
          (writer, exportName) => emitNamedExport(writer, exportName, entity),
        ),
      ),
    })),
    Match.exhaustive,
  )

const emitRollupEntity = (
  state: RollupEmitState,
  entity: Snapshot.CollectorEntity,
  dtsKind: DtsRollupKind,
): Result.Result<RollupEmitState, RenderFailure> =>
  Match.value(shouldIncludeReleaseTag(maxEffectiveReleaseTagOf(state.snapshot, entity.astEntity), dtsKind)).pipe(
    Match.when(
      false,
      (): Result.Result<RollupEmitState, RenderFailure> => Result.succeed(excludedEntityOf(state, entity)),
    ),
    Match.when(
      true,
      (): Result.Result<RollupEmitState, RenderFailure> =>
        Result.map(
          emitIncludedEntityOf(state, entity, dtsKind),
          (emitted) => entitySuffixOf(emitted, entity),
        ),
    ),
    Match.exhaustive,
  )

const reservedNamesOf = (snapshot: Snapshot.AnalysisSnapshot): HashSet.HashSet<string> =>
  Arr.reduce(Snapshot.entities(snapshot), HashSet.empty<string>(), (reserved, entity) =>
    Arr.reduce(
      Chunk.toReadonlyArray(entity.exportedNames),
      Option.match(Option.filter(entity.nameForEmit, (name) => name.length > 0), {
        onSome: (name) => HashSet.add(reserved, name),
        onNone: () => reserved,
      }),
      (current, exportName) => HashSet.add(current, exportName),
    ))

export interface RenderedDtsRollup {
  readonly text: string
  readonly log: MessageLog
}

export const generateTypingsFileContent = (
  snapshot: Snapshot.AnalysisSnapshot,
  dtsKind: DtsRollupKind,
): Result.Result<RenderedDtsRollup, RenderFailure> => {
  const initialWriter = TextWriter.make({ trimLeadingSpaces: true })
  const afterPackageComment = Option.match(
    Option.map(Snapshot.packageDocComment(snapshot), (comment) => comment.parserContext),
    {
      onNone: () => initialWriter,
      onSome: (parserContext) =>
        TextWriter.ensureSkippedLine({
          ...TextWriter.writeLine({ ...initialWriter, trimLeadingSpaces: false }, parserContext.sourceRange.toString()),
          trimLeadingSpaces: true,
        }),
    },
  )
  const withDirectives = TextWriter.ensureSkippedLine(
    Arr.reduce(
      Snapshot.dtsLibReferenceDirectives(snapshot),
      Arr.reduce(
        Snapshot.dtsTypeReferenceDirectives(snapshot),
        afterPackageComment,
        (writer, typeDirective) => TextWriter.writeLine(writer, `/// <reference types="${typeDirective}" />`),
      ),
      (writer, libDirective) => TextWriter.writeLine(writer, `/// <reference lib="${libDirective}" />`),
    ),
  )
  const initial: Result.Result<RollupEmitState, RenderFailure> = Result.flatMap(
    writeImports(withDirectives, snapshot),
    (afterImports) => Result.succeed({ snapshot, writer: afterImports, reservedNames: reservedNamesOf(snapshot) }),
  )
  return Result.map(
    Arr.reduce(
      Snapshot.entities(snapshot),
      initial,
      (accumulated, entity) => Result.flatMap(accumulated, (current) => emitRollupEntity(current, entity, dtsKind)),
    ),
    (state) => ({
      text: TextWriter.getText(
        TextWriter.writeLine(TextWriter.ensureSkippedLine(emitStarExports(state.writer, snapshot)), 'export { }'),
      ),
      log: Snapshot.messageLog(state.snapshot),
    }),
  )
}
