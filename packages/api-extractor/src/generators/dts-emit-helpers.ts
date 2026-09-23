import { HashMap, Option, Result } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import * as SourceFileLocationFormatter from '../analyzer/SourceFileLocationFormatter.js'
import * as TypeScriptHelpers from '../analyzer/TypeScriptHelpers.js'
import { getNodeId, type NodeId } from '../analyzer/TypeScriptInternals.js'
import * as Snapshot from '../collector/analysis-snapshot.js'
import type { CollectorEntity } from '../collector/CollectorEntity.js'
import { ExtractorMessageId } from '../collector/extractor-message-id.js'
import { InternalInvariantError, UnsupportedStarExportError } from '../errors/index.js'
import * as RenderSpan from './render-span.js'
import * as SpanPlan from './span-plan.js'
import * as SpanTreeModule from './span-tree.js'
import type { SpanTree } from './span-tree.js'
import * as TextWriter from './text-writer.js'

/** The typed failures a render returns: refusals the CLI reports, and defects it crashes on. */
export type RenderFailure = UnsupportedStarExportError | InternalInvariantError

export const internalInvariantOf = (message: string): Result.Result<never, RenderFailure> =>
  Result.fail(new InternalInvariantError({ message }))

export const entityNameOf = (entity: CollectorEntity): string => entity.nameForEmit ?? ''

// ---------------------------------------------------------------- import/export emit lines

const defaultImportLineOf = (prefix: string, entity: CollectorEntity, astImport: Snapshot.AstImport): string => {
  const name = entityNameOf(entity)
  return Match.value(name === astImport.exportName).pipe(
    Match.when(true, () => `${prefix} ${astImport.exportName} from '${astImport.modulePath}';`),
    Match.when(false, () => `${prefix} { default as ${name} } from '${astImport.modulePath}';`),
    Match.exhaustive,
  )
}

const namedImportLineOf = (prefix: string, entity: CollectorEntity, astImport: Snapshot.AstImport): string => {
  const name = entityNameOf(entity)
  return Match.value(name === astImport.exportName).pipe(
    Match.when(true, () => `${prefix} { ${astImport.exportName} } from '${astImport.modulePath}';`),
    Match.when(false, () => `${prefix} { ${astImport.exportName} as ${name} } from '${astImport.modulePath}';`),
    Match.exhaustive,
  )
}

const starImportLineOf = (prefix: string, entity: CollectorEntity, astImport: Snapshot.AstImport): string =>
  `${prefix} * as ${entityNameOf(entity)} from '${astImport.modulePath}';`

const equalsImportLineOf = (prefix: string, entity: CollectorEntity, astImport: Snapshot.AstImport): string =>
  `${prefix} ${entityNameOf(entity)} = require('${astImport.modulePath}');`

const importTypeLineOf = (prefix: string, entity: CollectorEntity, astImport: Snapshot.AstImport): string =>
  Match.value(astImport.exportName.length === 0).pipe(
    Match.when(true, () => `${prefix} * as ${entityNameOf(entity)} from '${astImport.modulePath}';`),
    Match.when(false, () => {
      const topExportName = Option.getOrElse(Arr.head(astImport.exportName.split('.')), () => '')
      const name = entityNameOf(entity)
      return Match.value(name === topExportName).pipe(
        Match.when(true, () => `${prefix} { ${topExportName} } from '${astImport.modulePath}';`),
        Match.when(false, () => `${prefix} { ${topExportName} as ${name} } from '${astImport.modulePath}';`),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )

type ImportLineBuilder = (prefix: string, entity: CollectorEntity, astImport: Snapshot.AstImport) => string

const importLineBuilders: Readonly<Record<Snapshot.AstImportKind, ImportLineBuilder>> = {
  [Snapshot.AstImportKind.DefaultImport]: defaultImportLineOf,
  [Snapshot.AstImportKind.NamedImport]: namedImportLineOf,
  [Snapshot.AstImportKind.StarImport]: starImportLineOf,
  [Snapshot.AstImportKind.EqualsImport]: equalsImportLineOf,
  [Snapshot.AstImportKind.ImportType]: importTypeLineOf,
}

const importPrefixOf = (astImport: Snapshot.AstImport): string =>
  Match.value(astImport.isTypeOnlyEverywhere).pipe(
    Match.when(true, () => 'import type'),
    Match.when(false, () => 'import'),
    Match.exhaustive,
  )

export const emitImport = (
  writer: TextWriter.TextWriter,
  collectorEntity: CollectorEntity,
  astImport: Snapshot.AstImport,
): TextWriter.TextWriter =>
  TextWriter.writeLine(
    writer,
    importLineBuilders[astImport.importKind](importPrefixOf(astImport), collectorEntity, astImport),
  )

export const writeImports = (
  writer: TextWriter.TextWriter,
  snapshot: Snapshot.AnalysisSnapshot,
): Result.Result<TextWriter.TextWriter, RenderFailure> => {
  const initial: Result.Result<TextWriter.TextWriter, RenderFailure> = Result.succeed(writer)
  const afterImports = Arr.reduce(
    Snapshot.entities(snapshot),
    initial,
    (accumulated, entity) =>
      Result.flatMap(accumulated, (current) =>
        Match.value(Snapshot.refOf(Snapshot.astEntityOf(entity))).pipe(
          Match.tag('AstImportRef', () =>
            Option.match(Snapshot.astImportOf(Snapshot.astEntityOf(entity)), {
              onNone: () => internalInvariantOf('Missing AstImport for an AstImportRef'),
              onSome: (astImport) => Result.succeed(emitImport(current, entity, astImport)),
            })),
          Match.orElse((): Result.Result<TextWriter.TextWriter, RenderFailure> => Result.succeed(current)),
        )),
  )
  return Result.map(afterImports, (current) => TextWriter.ensureSkippedLine(current))
}

export const formatNamedExport = (exportName: string, name: string): string =>
  Match.value(exportName === ts.InternalSymbolName.Default).pipe(
    Match.when(true, () => `export default ${name};`),
    Match.when(false, () =>
      Match.value(name === exportName).pipe(
        Match.when(true, () => `export { ${exportName} }`),
        Match.when(false, () => `export { ${name} as ${exportName} }`),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

export const emitNamedExport = (
  writer: TextWriter.TextWriter,
  exportName: string,
  collectorEntity: CollectorEntity,
): TextWriter.TextWriter => TextWriter.writeLine(writer, formatNamedExport(exportName, entityNameOf(collectorEntity)))

export const emitStarExports = (
  writer: TextWriter.TextWriter,
  snapshot: Snapshot.AnalysisSnapshot,
): TextWriter.TextWriter =>
  Match.value(Snapshot.starExportedExternalModulePaths(snapshot)).pipe(
    Match.when((modulePaths) => modulePaths.length === 0, () => writer),
    Match.orElse((modulePaths) =>
      Arr.reduce(
        modulePaths,
        TextWriter.writeLine(writer),
        (current, modulePath) => TextWriter.writeLine(current, `export * from "${modulePath}";`),
      )
    ),
  )

export const isExportKeywordInNamespaceExportDeclaration = (node: ts.Node): boolean =>
  Match.value(ts.isExportDeclaration(node.parent)).pipe(
    Match.when(
      true,
      () => TypeScriptHelpers.findFirstParent<ts.ModuleBlock>(node, ts.SyntaxKind.ModuleBlock) !== undefined,
    ),
    Match.when(false, () => false),
    Match.exhaustive,
  )

// ---------------------------------------------------------------- synthetic parameter names

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

interface SyntheticNameWalk {
  readonly names: HashMap.HashMap<NodeId, string>
  readonly used: ReadonlyArray<string>
}

const syntheticNameWalkOf = (walk: SyntheticNameWalk, parameter: ts.ParameterDeclaration): SyntheticNameWalk =>
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

/** Synthetic names for destructured parameters at or after the first binding pattern, keyed by name node id. */
export const syntheticParameterNames = (nodes: ReadonlyArray<ts.Node>): HashMap.HashMap<NodeId, string> => {
  const parameters = Arr.filter(Arr.fromIterable(nodes), ts.isParameter)
  return Arr.reduce(
    bindingParametersOf(parameters),
    { names: HashMap.empty<NodeId, string>(), used: usedParameterNamesOf(parameters) } satisfies SyntheticNameWalk,
    syntheticNameWalkOf,
  ).names
}

// ---------------------------------------------------------------- import-type span planning

export interface ImportTypePlanner<S extends { readonly plan: SpanPlan.SpanPlan }> {
  readonly state: S
  readonly snapshot: Snapshot.AnalysisSnapshot
  readonly tree: SpanTree
  readonly astDeclaration: Snapshot.AstDeclaration
  readonly planNestedSpan: (
    state: S,
    span: SpanTree,
    previousSibling: Option.Option<SpanTree>,
    astDeclaration: Snapshot.AstDeclaration,
  ) => Result.Result<S, RenderFailure>
}

export interface PlannedImportType<S> {
  readonly state: S
  readonly plan: SpanPlan.SpanPlan
}

const importTypeNestedDeclarationOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  tree: SpanTree,
  astDeclaration: Snapshot.AstDeclaration,
): Snapshot.AstDeclaration =>
  Match.value(Snapshot.isSupportedDeclarationKind(tree.kind)).pipe(
    Match.when(true, () => Snapshot.childDeclarationByNode(snapshot, tree.node, astDeclaration)),
    Match.when(false, () => astDeclaration),
    Match.exhaustive,
  )

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

const relativeModulePathOf = (node: ts.ImportTypeNode): Option.Option<string> =>
  Option.some(node.argument).pipe(
    Option.filter(ts.isLiteralTypeNode),
    Option.map((literalTypeNode) => literalTypeNode.literal),
    Option.filter(ts.isStringLiteral),
    Option.map((literal) => literal.text),
    Option.filter((modulePath) => modulePath.startsWith('.')),
  )

const unresolvedImportTypeOf = <S extends { readonly plan: SpanPlan.SpanPlan }>(
  planner: ImportTypePlanner<S>,
  node: ts.ImportTypeNode,
): PlannedImportType<S> => {
  Option.match(relativeModulePathOf(node), {
    onNone: () => undefined,
    onSome: (modulePath) => {
      Snapshot.addAnalyzerIssue(
        planner.snapshot,
        ExtractorMessageId.UnresolvedImportPath,
        `The inline import path "${modulePath}" could not be resolved, so it would be emitted unchanged` +
          ` into the .d.ts rollup, where it does not resolve to anything. Import the symbol at the top` +
          ` of the file instead of using an inline import() type.`,
        planner.astDeclaration,
      )
    },
  })
  return { state: planner.state, plan: planner.state.plan }
}

const nestedQualifiersOf = (
  snapshot: Snapshot.AnalysisSnapshot,
  node: ts.ImportTypeNode,
  entity: CollectorEntity,
): Result.Result<string, RenderFailure> =>
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

interface NestedWalk<S> {
  readonly state: S
  readonly previous: Option.Option<SpanTree>
}

const plannedNestedOf = <S extends { readonly plan: SpanPlan.SpanPlan }>(
  planner: ImportTypePlanner<S>,
  walk: NestedWalk<S>,
  span: SpanTree,
): Result.Result<NestedWalk<S>, RenderFailure> =>
  Result.map(
    planner.planNestedSpan(
      walk.state,
      span,
      walk.previous,
      importTypeNestedDeclarationOf(planner.snapshot, span, planner.astDeclaration),
    ),
    (state) => ({ state, previous: Option.some(span) }),
  )

const plannedNestedStateOf = <S extends { readonly plan: SpanPlan.SpanPlan }>(
  planner: ImportTypePlanner<S>,
  typeArgumentSpans: ReadonlyArray<SpanTree>,
): Result.Result<S, RenderFailure> => {
  const initial: Result.Result<NestedWalk<S>, RenderFailure> = Result.succeed({
    state: planner.state,
    previous: Option.none(),
  })
  return Result.map(
    Arr.reduce(
      typeArgumentSpans,
      initial,
      (accumulated, span) => Result.flatMap(accumulated, (walk) => plannedNestedOf(planner, walk, span)),
    ),
    (walk) => walk.state,
  )
}

interface TypeArgumentsPlan<S> {
  readonly state: S
  readonly text: string
}

const typeArgumentsPlanOf = <S extends { readonly plan: SpanPlan.SpanPlan }>(
  planner: ImportTypePlanner<S>,
  node: ts.ImportTypeNode,
): Result.Result<TypeArgumentsPlan<S>, RenderFailure> =>
  Option.match(
    Option.filter(Option.fromUndefinedOr(node.typeArguments), (typeArguments) => typeArguments.length > 0),
    {
      onNone: () => Result.succeed({ state: planner.state, text: '' }),
      onSome: () =>
        Option.match(extractTypeArgumentSpans(planner.tree), {
          onNone: () =>
            internalInvariantOf(
              `Invalid type arguments: ${node.getText()}\n${SourceFileLocationFormatter.formatDeclaration(node)}`,
            ),
          onSome: (typeArgumentSpans) =>
            Result.map(plannedNestedStateOf(planner, typeArgumentSpans), (plannedState) => ({
              state: plannedState,
              text: `<${
                Arr.join(Arr.map(typeArgumentSpans, (span) => RenderSpan.renderText(span, plannedState.plan)), ', ')
              }>`,
            })),
        }),
    },
  )

const resolvedImportTypeOf = <S extends { readonly plan: SpanPlan.SpanPlan }>(
  planner: ImportTypePlanner<S>,
  node: ts.ImportTypeNode,
  referencedEntity: CollectorEntity,
): Result.Result<PlannedImportType<S>, RenderFailure> =>
  Option.match(Option.filter(Option.fromNullishOr(referencedEntity.nameForEmit), (name) => name.length > 0), {
    onNone: () => internalInvariantOf('referencedEntry.nameForEmit is undefined'),
    onSome: (nameForEmit) =>
      Result.flatMap(
        typeArgumentsPlanOf(planner, node),
        ({ state: plannedState, text: typeArgumentsText }) =>
          Result.map(nestedQualifiersOf(planner.snapshot, node, referencedEntity), (nestedQualifiers) => ({
            state: plannedState,
            plan: SpanPlan.withPrefix(
              SpanPlan.skipAll(plannedState.plan, planner.tree),
              planner.tree,
              `${nameForEmit}${nestedQualifiers}${typeArgumentsText}${separatorAfterOf(planner.tree)}`,
            ),
          })),
      ),
  })

export const planImportTypeSpan = <S extends { readonly plan: SpanPlan.SpanPlan }>(
  planner: ImportTypePlanner<S>,
): Result.Result<PlannedImportType<S>, RenderFailure> =>
  Match.value(planner.tree.node).pipe(
    Match.when(ts.isImportTypeNode, (node) =>
      Option.match(Snapshot.tryGetEntityForNode(planner.snapshot, node), {
        onNone: (): Result.Result<PlannedImportType<S>, RenderFailure> =>
          Result.succeed(unresolvedImportTypeOf(planner, node)),
        onSome: (referencedEntity) => resolvedImportTypeOf(planner, node, referencedEntity),
      })),
    Match.orElse((): Result.Result<PlannedImportType<S>, RenderFailure> =>
      Result.succeed({ state: planner.state, plan: planner.state.plan })
    ),
  )
