import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import { getSymbolId, type NodeId, type SymbolId } from '../TypeScriptInternals.js'
import * as TypeScriptInternals from '../TypeScriptInternals.js'
import type { AnalysisGraph } from './analysis-graph.js'
import { nodeValueOf } from './analysis-graph.js'
import type { AstDeclaration } from './ast-declaration.js'
import type { AstEntityRef } from './ast-entity.js'
import type { AstModule } from './ast-module.js'

export interface ReferenceResolutionContext {
  readonly isAncillary: (declarationId: NodeId) => boolean
}

const workingPackageNameOf = (graph: AnalysisGraph): string =>
  Option.getOrElse(Option.map(graph.workingPackage, (workingPackage) => workingPackage.name), () => '')

const isForeignPackageReference = (
  graph: AnalysisGraph,
  declarationReference: tsdoc.DocDeclarationReference,
): boolean =>
  declarationReference.packageName !== undefined &&
  declarationReference.packageName !== workingPackageNameOf(graph)

const entryModuleOf = (graph: AnalysisGraph): Option.Option<AstModule> =>
  Option.flatMap(graph.workingPackage, (workingPackage) =>
    Option.flatMap(
      Option.fromUndefinedOr(
        TypeScriptInternals.tryGetSymbolForDeclaration(workingPackage.entryPointSourceFile, graph.typeChecker),
      ),
      (moduleSymbol) => HashMap.get(graph.modules, getSymbolId(moduleSymbol)),
    ))

const exportedEntityRefOf = (graph: AnalysisGraph, exportName: string): Option.Option<AstEntityRef> =>
  Option.flatMap(
    entryModuleOf(graph),
    (entryModule) =>
      Option.flatMap(HashMap.get(graph.moduleExportInfo, entryModule.moduleSymbolId), (exportInfo) =>
        Option.flatMap(
          Arr.findFirst(Chunk.toReadonlyArray(exportInfo.exportedLocalEntities), (entry) => entry[0] === exportName),
          (entry) => Option.some(entry[1]),
        )),
  )

const localNameOfDeclaration = (graph: AnalysisGraph, astDeclaration: AstDeclaration): string =>
  Option.getOrElse(
    Option.map(HashMap.get(graph.symbols, astDeclaration.astSymbolId), (astSymbol) => astSymbol.localName),
    () => '',
  )

const localNameOfSymbol = (graph: AnalysisGraph, symbolId: SymbolId): string =>
  Option.getOrElse(
    Option.map(HashMap.get(graph.symbols, symbolId), (astSymbol) => astSymbol.localName),
    () => '',
  )

const declarationsOfSymbol = (graph: AnalysisGraph, symbolId: SymbolId): ReadonlyArray<AstDeclaration> =>
  Option.getOrElse(
    Option.map(
      HashMap.get(graph.symbols, symbolId),
      (astSymbol) =>
        Arr.filterMap(
          Chunk.toReadonlyArray(astSymbol.declarationIds),
          (declarationId) => Result.fromOption(HashMap.get(graph.declarations, declarationId), () => undefined),
        ),
    ),
    () => [],
  )

const declarationKindOf = (graph: AnalysisGraph, astDeclaration: AstDeclaration): Option.Option<ts.SyntaxKind> =>
  Option.map(nodeValueOf(graph, astDeclaration.declarationId), (node) => node.kind)

const childDeclarationsOf = (graph: AnalysisGraph, declarationId: NodeId): ReadonlyArray<AstDeclaration> =>
  Option.match(HashMap.get(graph.declarations, declarationId), {
    onNone: () => [],
    onSome: (astDeclaration) =>
      Match.value(HashSet.has(graph.analyzedSymbols, astDeclaration.rootAstSymbolId)).pipe(
        Match.when(false, () => []),
        Match.when(true, () =>
          Arr.filterMap(
            Option.getOrElse(
              Option.map(HashMap.get(graph.childrenByDeclaration, declarationId), Chunk.toReadonlyArray),
              () => [],
            ),
            (childId) => Result.fromOption(HashMap.get(graph.declarations, childId), () => undefined),
          )),
        Match.exhaustive,
      ),
  })

const childrenWithName = (
  graph: AnalysisGraph,
  declarationId: NodeId,
  name: string,
): ReadonlyArray<AstDeclaration> =>
  Arr.filterMap(childDeclarationsOf(graph, declarationId), (child) =>
    Result.fromOption(
      Option.filter(Option.some(child), (candidate) => localNameOfDeclaration(graph, candidate) === name),
      () => undefined,
    ))

interface OverloadScan {
  readonly found: Option.Option<number>
  readonly position: number
}

const overloadScanOf =
  (astDeclaration: AstDeclaration) => (scan: OverloadScan, declaration: AstDeclaration): OverloadScan => ({
    found: Option.match(scan.found, {
      onSome: (found) => Option.some(found),
      onNone: () =>
        Option.filter(
          Option.some(scan.position + 1),
          () => declaration.declarationId === astDeclaration.declarationId,
        ),
    }),
    position: scan.position + 1,
  })

const sameKindDeclarations = (
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
): ReadonlyArray<AstDeclaration> =>
  Option.match(declarationKindOf(graph, astDeclaration), {
    onNone: () => [astDeclaration],
    onSome: (kind) =>
      Arr.filter(declarationsOfSymbol(graph, astDeclaration.astSymbolId), (candidate) =>
        Option.exists(declarationKindOf(graph, candidate), (candidateKind) => candidateKind === kind)),
  })

const overloadIndexOf = (graph: AnalysisGraph, astDeclaration: AstDeclaration): number => {
  const scan: OverloadScan = Arr.reduce(
    sameKindDeclarations(graph, astDeclaration),
    { found: Option.none<number>(), position: 0 } satisfies OverloadScan,
    overloadScanOf(astDeclaration),
  )
  return Option.getOrElse(scan.found, () => 1)
}

const tryDisambiguateAncillaryMatches = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  matches: ReadonlyArray<AstDeclaration>,
): Option.Option<AstDeclaration> => {
  const nonAncillaryMatches: ReadonlyArray<AstDeclaration> = Arr.filter(
    matches,
    (match) => !context.isAncillary(match.declarationId),
  )
  return Match.value(nonAncillaryMatches.length === 1).pipe(
    Match.when(true, () => Option.flatMap(Arr.head(nonAncillaryMatches), (match) => Option.some(match))),
    Match.when(false, () => Option.none()),
    Match.exhaustive,
  )
}

const ambiguousFailure = (astSymbolName: string): string =>
  `The reference is ambiguous because "${astSymbolName}"` +
  ' has more than one declaration; you need to add a TSDoc member reference selector'

const selectWithoutSelector = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  astDeclarations: ReadonlyArray<AstDeclaration>,
  astSymbolName: string,
): Result.Result<AstDeclaration, string> =>
  Match.value(astDeclarations.length === 1).pipe(
    Match.when(true, () => Result.fromOption(Arr.head(astDeclarations), () => 'No declaration found')),
    Match.when(false, () =>
      Option.match(tryDisambiguateAncillaryMatches(graph, context, astDeclarations), {
        onSome: (match) => Result.succeed(match),
        onNone: () => Result.fail(ambiguousFailure(astSymbolName)),
      })),
    Match.exhaustive,
  )

const systemSelectorKindOf = (selectorName: string): Option.Option<ts.SyntaxKind> =>
  Match.value(selectorName).pipe(
    Match.when('class', () => Option.some(ts.SyntaxKind.ClassDeclaration)),
    Match.when('enum', () => Option.some(ts.SyntaxKind.EnumDeclaration)),
    Match.when('function', () => Option.some(ts.SyntaxKind.FunctionDeclaration)),
    Match.when('interface', () => Option.some(ts.SyntaxKind.InterfaceDeclaration)),
    Match.when('namespace', () => Option.some(ts.SyntaxKind.ModuleDeclaration)),
    Match.when('type', () => Option.some(ts.SyntaxKind.TypeAliasDeclaration)),
    Match.when('variable', () => Option.some(ts.SyntaxKind.VariableDeclaration)),
    Match.orElse(() => Option.none()),
  )

const selectUsingSystemSelector = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  astDeclarations: ReadonlyArray<AstDeclaration>,
  memberSelector: tsdoc.DocMemberSelector,
  astSymbolName: string,
): Result.Result<AstDeclaration, string> =>
  Option.match(systemSelectorKindOf(memberSelector.selector), {
    onNone: () => Result.fail(`Unsupported system selector "${memberSelector.selector}"`),
    onSome: (selectorSyntaxKind) => {
      const matches: ReadonlyArray<AstDeclaration> = Arr.filter(astDeclarations, (astDeclaration) =>
        Option.exists(declarationKindOf(graph, astDeclaration), (kind) =>
          kind === selectorSyntaxKind))
      return Match.value(matches.length).pipe(
        Match.when(0, () =>
          Result.fail(
            `A declaration for "${astSymbolName}" was not found that matches the` +
              ` TSDoc selector "${memberSelector.selector}"`,
          )),
        Match.when(1, () =>
          Result.fromOption(Arr.head(matches), () => 'No matching declaration')),
        Match.orElse(() =>
          Option.match(tryDisambiguateAncillaryMatches(graph, context, matches), {
            onSome: (match) => Result.succeed(match),
            onNone: () =>
              Result.fail(
                `More than one declaration "${astSymbolName}" matches the TSDoc selector "${memberSelector.selector}"`,
              ),
          })
        ),
      )
    },
  })

const selectUsingIndexSelector = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  astDeclarations: ReadonlyArray<AstDeclaration>,
  memberSelector: tsdoc.DocMemberSelector,
  astSymbolName: string,
): Result.Result<AstDeclaration, string> => {
  const selectorOverloadIndex: number = parseInt(memberSelector.selector, 10)
  const matches: ReadonlyArray<AstDeclaration> = Arr.filter(
    astDeclarations,
    (astDeclaration) => overloadIndexOf(graph, astDeclaration) === selectorOverloadIndex,
  )
  return Match.value(matches.length).pipe(
    Match.when(0, () =>
      Result.fail(
        `An overload for "${astSymbolName}" was not found that matches the` +
          ` TSDoc selector ":${selectorOverloadIndex}"`,
      )),
    Match.when(1, () => Result.fromOption(Arr.head(matches), () => 'No matching declaration')),
    Match.orElse(() =>
      Option.match(tryDisambiguateAncillaryMatches(graph, context, matches), {
        onSome: (match) => Result.succeed(match),
        onNone: () =>
          Result.fail(
            `More than one declaration for "${astSymbolName}" matches the` +
              ` TSDoc selector ":${selectorOverloadIndex}"`,
          ),
      })
    ),
  )
}

const selectDeclaration = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  astDeclarations: ReadonlyArray<AstDeclaration>,
  memberReference: tsdoc.DocMemberReference,
  astSymbolName: string,
): Result.Result<AstDeclaration, string> =>
  Option.match(Option.fromNullishOr(memberReference.selector), {
    onNone: () => selectWithoutSelector(graph, context, astDeclarations, astSymbolName),
    onSome: (memberSelector) =>
      Match.value(memberSelector.selectorKind).pipe(
        Match.when(
          tsdoc.SelectorKind.System,
          () => selectUsingSystemSelector(graph, context, astDeclarations, memberSelector, astSymbolName),
        ),
        Match.when(
          tsdoc.SelectorKind.Index,
          () => selectUsingIndexSelector(graph, context, astDeclarations, memberSelector, astSymbolName),
        ),
        Match.orElse(() => Result.fail(`The selector "${memberSelector.selector}" is not a supported selector type`)),
      ),
  })

const memberReferenceIdentifierOf = (
  memberReference: tsdoc.DocMemberReference,
): Result.Result<string, string> =>
  Match.value(memberReference.memberSymbol !== undefined).pipe(
    Match.when(true, () => Result.fail('ECMAScript symbol selectors are not supported')),
    Match.when(false, () =>
      Option.match(Option.fromNullishOr(memberReference.memberIdentifier), {
        onSome: (memberIdentifier) => Result.succeed(memberIdentifier.identifier),
        onNone: () => Result.fail('The member identifier is missing in the root member reference'),
      })),
    Match.exhaustive,
  )

const resolveMemberReference = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  currentDeclaration: AstDeclaration,
  memberReference: Option.Option<tsdoc.DocMemberReference>,
): Result.Result<AstDeclaration, string> =>
  Option.match(memberReference, {
    onNone: () => Result.succeed(currentDeclaration),
    onSome: (memberReferenceValue) =>
      Result.flatMap(memberReferenceIdentifierOf(memberReferenceValue), (memberName) => {
        const matches: ReadonlyArray<AstDeclaration> = childrenWithName(
          graph,
          currentDeclaration.declarationId,
          memberName,
        )
        return Match.value(matches.length === 0).pipe(
          Match.when(true, () => Result.fail(`No member was found with name "${memberName}"`)),
          Match.when(false, () => selectDeclaration(graph, context, matches, memberReferenceValue, memberName)),
          Match.exhaustive,
        )
      }),
  })

const resolveMemberReferences = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  declarationReference: tsdoc.DocDeclarationReference,
  currentDeclaration: AstDeclaration,
): Result.Result<AstDeclaration, string> =>
  Arr.reduce<tsdoc.DocMemberReference, Result.Result<AstDeclaration, string>>(
    declarationReference.memberReferences.slice(1),
    Result.succeed(currentDeclaration),
    (accumulated, memberReference) =>
      Result.flatMap(accumulated, (declaration) =>
        resolveMemberReference(
          graph,
          context,
          declaration,
          Option.fromNullishOr(memberReference),
        )),
  )

const resolveRootMember = (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  declarationReference: tsdoc.DocDeclarationReference,
): Result.Result<AstDeclaration, string> =>
  Match.value(declarationReference.memberReferences.length === 0).pipe(
    Match.when(true, () => Result.fail('Package references are not supported')),
    Match.when(false, () =>
      Option.match(Arr.head(declarationReference.memberReferences), {
        onNone: () => Result.fail('Package references are not supported'),
        onSome: (rootMemberReference) =>
          Result.flatMap(memberReferenceIdentifierOf(rootMemberReference), (exportName) =>
            Option.match(exportedEntityRefOf(graph, exportName), {
              onNone: () =>
                Result.fail(
                  `The package "${workingPackageNameOf(graph)}" does not have an export "${exportName}"`,
                ),
              onSome: (rootEntityRef) =>
                Match.value(rootEntityRef).pipe(
                  Match.tag('AstSymbolRef', (symbolRef) =>
                    selectDeclaration(
                      graph,
                      context,
                      declarationsOfSymbol(graph, symbolRef.symbolId),
                      rootMemberReference,
                      localNameOfSymbol(graph, symbolRef.symbolId),
                    )),
                  Match.orElse(() => Result.fail('This type of declaration is not supported yet by the resolver')),
                ),
            })),
      })),
    Match.exhaustive,
  )

export const resolveDeclarationReference = dual<
  (
    context: ReferenceResolutionContext,
    declarationReference: tsdoc.DocDeclarationReference,
  ) => (graph: AnalysisGraph) => Result.Result<AstDeclaration, string>,
  (
    graph: AnalysisGraph,
    context: ReferenceResolutionContext,
    declarationReference: tsdoc.DocDeclarationReference,
  ) => Result.Result<AstDeclaration, string>
>(3, (
  graph: AnalysisGraph,
  context: ReferenceResolutionContext,
  declarationReference: tsdoc.DocDeclarationReference,
): Result.Result<AstDeclaration, string> =>
  Match.value(isForeignPackageReference(graph, declarationReference)).pipe(
    Match.when(true, () => Result.fail('External package references are not supported')),
    Match.when(false, () =>
      Match.value(declarationReference.importPath !== undefined).pipe(
        Match.when(true, () => Result.fail('Import paths are not supported')),
        Match.when(false, () =>
          Result.flatMap(
            resolveRootMember(graph, context, declarationReference),
            (rootDeclaration) => resolveMemberReferences(graph, context, declarationReference, rootDeclaration),
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  ))
