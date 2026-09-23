import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import { type ExtractorError, InternalInvariantError, UnsupportedSyntaxError } from '../../errors/index.js'
import * as SourceFileLocationFormatter from '../SourceFileLocationFormatter.js'
import * as SyntaxHelpers from '../SyntaxHelpers.js'
import * as TypeScriptHelpers from '../TypeScriptHelpers.js'
import { getNodeId, getSymbolId, type SymbolId } from '../TypeScriptInternals.js'
import * as TypeScriptInternals from '../TypeScriptInternals.js'
import type { AnalysisGraph, AnalysisRef } from './analysis-graph.js'
import { nodeValueOf, symbolValueOf } from './analysis-graph.js'
import { type AstEntityRef, AstImportRef, AstNamespaceImportRef, type AstSymbolRef } from './ast-entity.js'
import {
  type AstImport,
  astImportKeyOf,
  AstImportKind,
  astImportOf,
  type IAstImportOptions,
  withAstSymbolRef,
  withoutTypeOnlyEverywhere,
} from './ast-import.js'
import { AstModule, AstModuleExportInfo } from './ast-module.js'
import { isExternalModule } from './ast-module.js'
import { AstNamespaceImport } from './ast-namespace-import.js'

export interface IFetchAstSymbolOptions {
  readonly followedSymbol: ts.Symbol
  readonly isExternal: boolean
  readonly includeNominalAnalysis: boolean
  readonly addIfMissing: boolean
  readonly localName?: string | undefined
}

export interface IAstModuleReference {
  readonly moduleSpecifier: string
  readonly moduleSpecifierSymbol: ts.Symbol
}

export interface IAstSymbolTable {
  readonly fetchAstSymbol: (
    ref: AnalysisRef,
    options: IFetchAstSymbolOptions,
  ) => Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError>
  readonly analyze: (ref: AnalysisRef, astEntityRef: AstEntityRef) => Effect.Effect<void, ExtractorError>
}

const invariantDefect = (message: string): InternalInvariantError => new InternalInvariantError({ message })

const moduleOf = (graph: AnalysisGraph, moduleSymbolId: SymbolId): Option.Option<AstModule> =>
  HashMap.get(graph.modules, moduleSymbolId)

const exportInfoOf = (graph: AnalysisGraph, moduleSymbolId: SymbolId): Option.Option<AstModuleExportInfo> =>
  HashMap.get(graph.moduleExportInfo, moduleSymbolId)

const cachedExportOf = (
  graph: AnalysisGraph,
  moduleSymbolId: SymbolId,
  exportName: string,
): Option.Option<AstEntityRef> =>
  Option.flatMap(
    HashMap.get(graph.cachedExportedEntities, moduleSymbolId),
    (exports) => HashMap.get(exports, exportName),
  )

const emptyExportMap: HashMap.HashMap<string, AstEntityRef> = HashMap.empty()

const withCachedExport = (
  graph: AnalysisGraph,
  moduleSymbolId: SymbolId,
  exportName: string,
  astEntityRef: AstEntityRef,
): AnalysisGraph => ({
  ...graph,
  cachedExportedEntities: HashMap.modifyAt(
    graph.cachedExportedEntities,
    moduleSymbolId,
    Option.match({
      onNone: () => Option.some(HashMap.set(emptyExportMap, exportName, astEntityRef)),
      onSome: (exports) => Option.some(HashMap.set(exports, exportName, astEntityRef)),
    }),
  ),
})

const starModulesOf = (graph: AnalysisGraph, moduleSymbolId: SymbolId): ReadonlyArray<AstModule> =>
  Option.match(HashMap.get(graph.starExportedModules, moduleSymbolId), {
    onNone: () => [],
    onSome: (starIds) =>
      Arr.filterMap(
        Chunk.toReadonlyArray(starIds),
        (starId) => Result.fromOption(moduleOf(graph, starId), () => undefined),
      ),
  })

const withStarModule = (
  graph: AnalysisGraph,
  moduleSymbolId: SymbolId,
  starModuleSymbolId: SymbolId,
): AnalysisGraph => ({
  ...graph,
  starExportedModules: HashMap.modifyAt(
    graph.starExportedModules,
    moduleSymbolId,
    Option.match({
      onNone: () => Option.some(Chunk.of(starModuleSymbolId)),
      onSome: (stars) => Option.some(Chunk.append(stars, starModuleSymbolId)),
    }),
  ),
})

const sourceFileOfModule = (graph: AnalysisGraph, astModule: AstModule): Option.Option<ts.SourceFile> =>
  Option.flatMap(
    nodeValueOf(graph, astModule.sourceFileId),
    (node) => Option.filter(Option.some(node), ts.isSourceFile),
  )

const specifierExpressionOf = (
  node: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportTypeNode,
): Option.Option<ts.TypeNode | ts.Expression> =>
  Match.value(node).pipe(
    Match.when(ts.isImportTypeNode, (importTypeNode) => Option.some(importTypeNode.argument)),
    Match.orElse((declaration) => Option.fromNullishOr(declaration.moduleSpecifier)),
  )

const literalSpecifierOf = (specifier: ts.TypeNode | ts.Expression): ts.TypeNode | ts.Expression =>
  Match.value(specifier).pipe(
    Match.when(ts.isLiteralTypeNode, (literalTypeNode) => literalTypeNode.literal),
    Match.orElse((expression) => expression),
  )

const usageModeOf = (
  graph: AnalysisGraph,
  node: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportTypeNode,
): ts.ResolutionMode | undefined =>
  Option.filter(Option.map(specifierExpressionOf(node), literalSpecifierOf), ts.isStringLiteralLike).pipe(
    Option.map((literal) =>
      TypeScriptInternals.getModeForUsageLocation(node.getSourceFile(), literal, graph.program.getCompilerOptions())
    ),
    Option.getOrUndefined,
  )

const moduleSymbolDefect = (sourceFile: ts.SourceFile): InternalInvariantError =>
  invariantDefect('Unable to determine module for: ' + sourceFile.fileName)

const aliasedModuleSymbolOf = (
  ref: AnalysisRef,
  sourceFile: ts.SourceFile,
  moduleReference: IAstModuleReference,
): Effect.Effect<ts.Symbol, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) => {
    const immediate = Option.fromUndefinedOr(
      TypeScriptInternals.getImmediateAliasedSymbol(moduleReference.moduleSpecifierSymbol, graph.typeChecker),
    )
    const followedSymbol = Option.match(immediate, {
      onSome: (symbol) => Option.some(symbol),
      onNone: () => Option.fromNullishOr(graph.typeChecker.getAliasedSymbol(moduleReference.moduleSpecifierSymbol)),
    })
    const candidate = Option.filter(followedSymbol, (symbol) => symbol !== moduleReference.moduleSpecifierSymbol)
    const parentSymbol = Option.flatMap(candidate, (symbol) =>
      Option.fromUndefinedOr(TypeScriptInternals.getSymbolParent(symbol)))
    const valueModule = Option.filter(parentSymbol, (symbol) =>
      (symbol.flags & ts.SymbolFlags.ValueModule) !== 0)
    return Option.match(valueModule, {
      onSome: (moduleSymbol) =>
        Effect.map(
          Ref.update(ref, (next) => ({
            ...next,
            importableAmbientSourceFiles: HashSet.add(next.importableAmbientSourceFiles, getNodeId(sourceFile)),
          })),
          () => moduleSymbol,
        ),
      onNone: () => Effect.die(moduleSymbolDefect(sourceFile)),
    })
  })

const getModuleSymbolFromSourceFile = (
  ref: AnalysisRef,
  sourceFile: ts.SourceFile,
  moduleReference: Option.Option<IAstModuleReference>,
): Effect.Effect<ts.Symbol, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Option.match(
        Option.fromUndefinedOr(TypeScriptInternals.tryGetSymbolForDeclaration(sourceFile, graph.typeChecker)),
        {
          onSome: (moduleSymbol) => Effect.succeed(moduleSymbol),
          onNone: () =>
            Option.match(moduleReference, {
              onNone: () => Effect.die(moduleSymbolDefect(sourceFile)),
              onSome: (reference) =>
                Match.value((reference.moduleSpecifierSymbol.flags & ts.SymbolFlags.Alias) !== 0).pipe(
                  Match.when(true, () => aliasedModuleSymbolOf(ref, sourceFile, reference)),
                  Match.when(false, () => Effect.die(moduleSymbolDefect(sourceFile))),
                  Match.exhaustive,
                ),
            }),
        },
      ),
  )

export const isImportableAmbientSourceFile = (graph: AnalysisGraph, sourceFile: ts.SourceFile): boolean =>
  HashSet.has(graph.importableAmbientSourceFiles, getNodeId(sourceFile))

export const fetchAstModuleFromSourceFile = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  sourceFile: ts.SourceFile,
  moduleReference: Option.Option<IAstModuleReference>,
  isExternal: boolean,
): Effect.Effect<AstModule, ExtractorError> =>
  Effect.flatMap(
    getModuleSymbolFromSourceFile(ref, sourceFile, moduleReference),
    (moduleSymbol) =>
      Effect.flatMap(Ref.get(ref), (graph) =>
        Option.match(moduleOf(graph, getSymbolId(moduleSymbol)), {
          onSome: (astModule) => Effect.succeed(astModule),
          onNone: () => createAstModule(table, ref, sourceFile, moduleSymbol, moduleReference, isExternal),
        })),
  )

const createAstModule = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  sourceFile: ts.SourceFile,
  moduleSymbol: ts.Symbol,
  moduleReference: Option.Option<IAstModuleReference>,
  isExternal: boolean,
): Effect.Effect<AstModule, ExtractorError> =>
  Effect.gen(function*() {
    const externalModulePath = Option.filter(
      Option.map(moduleReference, (reference) => reference.moduleSpecifier),
      () => isExternal,
    )
    const astModule = new AstModule({
      sourceFileId: getNodeId(sourceFile),
      moduleSymbolId: getSymbolId(moduleSymbol),
      externalModulePath,
    })
    yield* Ref.update(ref, (graph) => ({
      ...graph,
      modules: HashMap.set(graph.modules, astModule.moduleSymbolId, astModule),
      symbolValues: HashMap.set(graph.symbolValues, astModule.moduleSymbolId, moduleSymbol),
      declarationValues: HashMap.set(graph.declarationValues, astModule.sourceFileId, sourceFile),
    }))

    const externalCrawl: Effect.Effect<void, ExtractorError> = Option.match(externalModulePath, {
      onNone: () =>
        Effect.die(
          invariantDefect('Failed assertion: externalModulePath=undefined but astModule.isExternal=true'),
        ),
      onSome: () => crawlExternalModuleExports(table, ref, astModule, moduleSymbol),
    })
    yield* Match.value(isExternalModule(astModule)).pipe(
      Match.when(true, () => externalCrawl),
      Match.when(false, () => crawlLocalModuleExports(table, ref, moduleSymbol, astModule)),
      Match.exhaustive,
    )
    return astModule
  })

const cacheExternalExport = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  astModule: AstModule,
  exportedSymbol: ts.Symbol,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) => {
    const followedSymbol = TypeScriptHelpers.followAliases(exportedSymbol, graph.typeChecker)
    const arbitraryDeclaration = Option.fromUndefinedOr(TypeScriptHelpers.tryGetADeclaration(followedSymbol))
    return Option.match(arbitraryDeclaration, {
      onNone: () => Effect.void,
      onSome: (declaration) =>
        Effect.flatMap(
          table.fetchAstSymbol(ref, {
            followedSymbol,
            isExternal: true,
            includeNominalAnalysis: true,
            addIfMissing: true,
          }),
          (astSymbolRef) =>
            Option.match(astSymbolRef, {
              onSome: (symbolRef) =>
                Ref.update(ref, (next) =>
                  withCachedExport(next, astModule.moduleSymbolId, exportedSymbol.name, symbolRef)),
              onNone: () => {
                const unsupportedSourceFile = declaration.getSourceFile()
                const { line } = unsupportedSourceFile.getLineAndCharacterOfPosition(declaration.getStart())
                return Effect.fail(
                  new UnsupportedSyntaxError({
                    file: unsupportedSourceFile.fileName,
                    line: line + 1,
                    message: `Unsupported export ${JSON.stringify(exportedSymbol.name)}:\n` +
                      SourceFileLocationFormatter.formatDeclaration(declaration),
                  }),
                )
              },
            }),
        ),
    })
  })

const crawlExternalModuleExports = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  astModule: AstModule,
  moduleSymbol: ts.Symbol,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Effect.forEach(
      graph.typeChecker.getExportsOfModule(moduleSymbol),
      (exportedSymbol) => cacheExternalExport(table, ref, astModule, exportedSymbol),
      { discard: true },
    ))

const crawlLocalModuleExports = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  moduleSymbol: ts.Symbol,
  astModule: AstModule,
): Effect.Effect<void, ExtractorError> =>
  Option.match(
    Option.flatMap(
      Option.fromNullishOr(moduleSymbol.exports),
      (exports) => Option.fromUndefinedOr(exports.get(ts.InternalSymbolName.ExportStar)),
    ),
    {
      onNone: () => Effect.void,
      onSome: (exportStarSymbol) =>
        Effect.forEach(
          Option.getOrElse(Option.fromNullishOr(exportStarSymbol.getDeclarations()), () => []),
          (exportStarDeclaration) =>
            Match.value(exportStarDeclaration).pipe(
              Match.when(ts.isExportDeclaration, (exportDeclaration) =>
                Effect.flatMap(
                  fetchSpecifierAstModule(table, ref, exportDeclaration, exportStarSymbol),
                  (starExportedModule) =>
                    Ref.update(
                      ref,
                      (graph) => withStarModule(graph, astModule.moduleSymbolId, starExportedModule.moduleSymbolId),
                    ),
                )),
              Match.orElse(() => Effect.void),
            ),
          { discard: true },
        ),
    },
  )

interface ExportAccumulator {
  readonly visitedAstModules: HashSet.HashSet<SymbolId>
  readonly visitedOrder: Chunk.Chunk<SymbolId>
  readonly exportedNames: HashSet.HashSet<string>
  readonly exportedLocalEntities: Chunk.Chunk<readonly [string, AstEntityRef]>
  readonly starExportedExternalModules: Chunk.Chunk<SymbolId>
}

const emptyAccumulator: ExportAccumulator = {
  visitedAstModules: HashSet.empty(),
  visitedOrder: Chunk.empty(),
  exportedNames: HashSet.empty(),
  exportedLocalEntities: Chunk.empty(),
  starExportedExternalModules: Chunk.empty(),
}

const accumulatorExportInfoOf = (accumulator: ExportAccumulator): AstModuleExportInfo =>
  new AstModuleExportInfo({
    visitedAstModules: accumulator.visitedOrder,
    exportedLocalEntities: accumulator.exportedLocalEntities,
    starExportedExternalModules: accumulator.starExportedExternalModules,
  })

const withVisitedModule = (accumulator: ExportAccumulator, moduleSymbolId: SymbolId): ExportAccumulator => ({
  ...accumulator,
  visitedAstModules: HashSet.add(accumulator.visitedAstModules, moduleSymbolId),
  visitedOrder: Chunk.append(accumulator.visitedOrder, moduleSymbolId),
})

const moduleSymbolOfEffect = (
  ref: AnalysisRef,
  astModule: AstModule,
): Effect.Effect<Option.Option<ts.Symbol>> =>
  Effect.map(Ref.get(ref), (graph) => symbolValueOf(graph, astModule.moduleSymbolId))

const exportEntriesOf = (moduleSymbol: ts.Symbol): ReadonlyArray<readonly [ts.Symbol, ts.__String]> =>
  Option.match(Option.fromNullishOr(moduleSymbol.exports), {
    onNone: () => [],
    onSome: (exports) =>
      Arr.map(Array.from(exports.entries()), (entry): readonly [ts.Symbol, ts.__String] => [entry[1], entry[0]]),
  })

export const fetchAstModuleExportInfo = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  entryPointAstModule: AstModule,
): Effect.Effect<AstModuleExportInfo, ExtractorError> =>
  Match.value(isExternalModule(entryPointAstModule)).pipe(
    Match.when(
      true,
      () => Effect.die(invariantDefect('fetchAstModuleExportInfo() is not supported for external modules')),
    ),
    Match.when(false, (): Effect.Effect<AstModuleExportInfo, ExtractorError> =>
      Effect.flatMap(Ref.get(ref), (graph) =>
        Option.match(exportInfoOf(graph, entryPointAstModule.moduleSymbolId), {
          onSome: (astModuleExportInfo) =>
            Effect.succeed(astModuleExportInfo),
          onNone: () =>
            Effect.flatMap(
              collectAllExportsRecursive(table, ref, entryPointAstModule, emptyAccumulator),
              (accumulator) =>
                Effect.map(
                  Ref.update(ref, (next) => ({
                    ...next,
                    moduleExportInfo: HashMap.set(
                      next.moduleExportInfo,
                      entryPointAstModule.moduleSymbolId,
                      accumulatorExportInfoOf(accumulator),
                    ),
                  })),
                  () => accumulatorExportInfoOf(accumulator),
                ),
            ),
        }))),
    Match.exhaustive,
  )

const collectAllExportsRecursive = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  astModule: AstModule,
  accumulator: ExportAccumulator,
): Effect.Effect<ExportAccumulator, ExtractorError> =>
  Match.value(HashSet.has(accumulator.visitedAstModules, astModule.moduleSymbolId)).pipe(
    Match.when(true, (): Effect.Effect<ExportAccumulator, ExtractorError> => Effect.succeed(accumulator)),
    Match.when(false, () =>
      Match.value(isExternalModule(astModule)).pipe(
        Match.when(true, (): Effect.Effect<ExportAccumulator, ExtractorError> =>
          Effect.succeed({
            ...withVisitedModule(accumulator, astModule.moduleSymbolId),
            starExportedExternalModules: Chunk.append(
              accumulator.starExportedExternalModules,
              astModule.moduleSymbolId,
            ),
          })),
        Match.when(false, () => collectLocalExports(table, ref, astModule, accumulator)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const collectLocalExports = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  astModule: AstModule,
  accumulator: ExportAccumulator,
): Effect.Effect<ExportAccumulator, ExtractorError> =>
  Effect.flatMap(moduleSymbolOfEffect(ref, astModule), (moduleSymbolOption) => {
    const initial: Effect.Effect<ExportAccumulator, ExtractorError> = Effect.succeed(
      withVisitedModule(accumulator, astModule.moduleSymbolId),
    )
    return Effect.flatMap(
      Arr.reduce(
        Option.getOrElse(Option.map(moduleSymbolOption, exportEntriesOf), () => []),
        initial,
        (accumulatedEffect, entry) =>
          Effect.flatMap(
            accumulatedEffect,
            (accumulated) => collectExplicitExport(table, ref, astModule, accumulated, entry),
          ),
      ),
      (collected) => foldStarModules(table, ref, astModule, collected),
    )
  })

const isStarOrEqualsExportName = (exportName: ts.__String): boolean =>
  exportName === ts.InternalSymbolName.ExportStar || exportName === ts.InternalSymbolName.ExportEquals

const isDefaultedOrEntryModule = (exportName: ts.__String, visitedModuleCount: number): boolean =>
  exportName !== ts.InternalSymbolName.Default || visitedModuleCount === 1

const collectExplicitExport = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  astModule: AstModule,
  accumulator: ExportAccumulator,
  entry: readonly [ts.Symbol, ts.__String],
): Effect.Effect<ExportAccumulator, ExtractorError> => {
  const exportSymbol: ts.Symbol = entry[0]
  const exportName: ts.__String = entry[1]
  const notYetCollected: boolean = !HashSet.has(accumulator.exportedNames, exportSymbol.name)
  return Match.value(isStarOrEqualsExportName(exportName)).pipe(
    Match.when(true, () => Effect.succeed(accumulator)),
    Match.when(
      false,
      () =>
        Match.value(isDefaultedOrEntryModule(exportName, HashSet.size(accumulator.visitedAstModules))).pipe(
          Match.when(false, () => Effect.succeed(accumulator)),
          Match.when(true, () =>
            Match.value(notYetCollected).pipe(
              Match.when(false, () => Effect.succeed(accumulator)),
              Match.when(true, () =>
                Effect.flatMap(getExportOfAstModule(table, ref, exportSymbol.name, astModule), (astEntityRef) => {
                  const collected: readonly [string, AstEntityRef] = [exportSymbol.name, astEntityRef]
                  return Effect.map(analyzeCollectedEntity(table, ref, astEntityRef), () => ({
                    ...accumulator,
                    exportedNames: HashSet.add(accumulator.exportedNames, exportSymbol.name),
                    exportedLocalEntities: Chunk.append(accumulator.exportedLocalEntities, collected),
                  }))
                })),
              Match.exhaustive,
            )),
          Match.exhaustive,
        ),
    ),
    Match.exhaustive,
  )
}

const analyzeCollectedEntity = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  astEntityRef: AstEntityRef,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Match.value(astEntityRef).pipe(
      Match.tag('AstSymbolRef', (astSymbolRef) =>
        Option.match(HashMap.get(graph.symbols, astSymbolRef.symbolId), {
          onNone: () => Effect.void,
          onSome: (astSymbol) =>
            Match.value(astSymbol.isExternal).pipe(
              Match.when(true, () => Effect.void),
              Match.when(false, () => table.analyze(ref, astEntityRef)),
              Match.exhaustive,
            ),
        })),
      Match.tag('AstNamespaceImportRef', (namespaceRef) =>
        Option.match(HashMap.get(graph.namespaceImports, namespaceRef.symbolId), {
          onNone: () => Effect.void,
          onSome: (astNamespaceImport) =>
            Option.match(moduleOf(graph, astNamespaceImport.astModuleId), {
              onNone: () => Effect.void,
              onSome: (astModule) =>
                Match.value(isExternalModule(astModule)).pipe(
                  Match.when(true, () => Effect.void),
                  Match.when(false, () => table.analyze(ref, astEntityRef)),
                  Match.exhaustive,
                ),
            }),
        })),
      Match.orElse(() =>
        Effect.void
      ),
    ))

const foldStarModules = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  astModule: AstModule,
  accumulator: ExportAccumulator,
): Effect.Effect<ExportAccumulator, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) => {
    const initial: Effect.Effect<ExportAccumulator, ExtractorError> = Effect.succeed(accumulator)
    return Arr.reduce(
      starModulesOf(graph, astModule.moduleSymbolId),
      initial,
      (accumulatedEffect, starModule) =>
        Effect.flatMap(accumulatedEffect, (accumulated) =>
          collectAllExportsRecursive(table, ref, starModule, accumulated)),
    )
  })

export const tryGetExportOfAstModule = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportName: string,
  astModule: AstModule,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  tryGetExportOfAstModuleRecursive(table, ref, exportName, astModule, HashSet.empty())

const tryGetExportOfAstModuleRecursive = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportName: string,
  astModule: AstModule,
  visitedAstModules: HashSet.HashSet<SymbolId>,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Match.value(HashSet.has(visitedAstModules, astModule.moduleSymbolId)).pipe(
    Match.when(true, (): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> => Effect.succeedNone),
    Match.when(
      false,
      () =>
        Effect.flatMap(
          Ref.get(ref),
          (graph) =>
            Option.match(cachedExportOf(graph, astModule.moduleSymbolId, exportName), {
              onSome: (astEntityRef) => Effect.succeedSome(astEntityRef),
              onNone: () =>
                Effect.flatMap(explicitExportOf(table, ref, exportName, astModule), (explicit) =>
                  Option.match(explicit, {
                    onSome: (astEntityRef) => Effect.succeedSome(astEntityRef),
                    onNone: () =>
                      Effect.flatMap(Ref.get(ref), (next) =>
                        foldStarExportLookup(
                          table,
                          ref,
                          exportName,
                          starModulesOf(next, astModule.moduleSymbolId),
                          HashSet.add(visitedAstModules, astModule.moduleSymbolId),
                        )),
                  })),
            }),
        ),
    ),
    Match.exhaustive,
  )

const explicitExportOf = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportName: string,
  astModule: AstModule,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(astModuleSymbolExportsOf(graph, astModule, exportName), {
      onNone: () => Effect.succeedNone,
      onSome: (exportSymbol) =>
        Effect.flatMap(
          fetchReferencedAstEntity(table, ref, exportSymbol, isExternalModule(astModule)),
          (astEntityRef) =>
            Option.match(astEntityRef, {
              onNone: () => Effect.succeedNone,
              onSome: (entityRef) =>
                Effect.map(
                  Ref.update(ref, (next) => withCachedExport(next, astModule.moduleSymbolId, exportName, entityRef)),
                  () => Option.some(entityRef),
                ),
            }),
        ),
    }))

const astModuleSymbolExportsOf = (
  graph: AnalysisGraph,
  astModule: AstModule,
  exportName: string,
): Option.Option<ts.Symbol> =>
  Option.flatMap(symbolValueOf(graph, astModule.moduleSymbolId), (moduleSymbol) =>
    Option.flatMap(
      Option.fromNullishOr(moduleSymbol.exports),
      (exports) => Option.fromUndefinedOr(exports.get(ts.escapeLeadingUnderscores(exportName))),
    ))

const foldStarExportLookup = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportName: string,
  starModules: ReadonlyArray<AstModule>,
  visitedAstModules: HashSet.HashSet<SymbolId>,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> => {
  const initial: Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> = Effect.succeedNone
  return Arr.reduce(
    starModules,
    initial,
    (accumulatedEffect, starModule) =>
      Effect.flatMap(accumulatedEffect, (accumulated) =>
        Option.match(accumulated, {
          onSome: (astEntityRef) => Effect.succeedSome(astEntityRef),
          onNone: () =>
            Effect.flatMap(
              tryGetExportOfAstModuleRecursive(table, ref, exportName, starModule, visitedAstModules),
              (found) =>
                Option.match(found, {
                  onNone: () => Effect.succeedNone,
                  onSome: (astEntityRef) =>
                    starEntityFromExternalModule(table, ref, exportName, starModule, astEntityRef),
                }),
            ),
        })),
  )
}

const starEntityFromExternalModule = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportName: string,
  starModule: AstModule,
  astEntityRef: AstEntityRef,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Match.value(starModule.externalModulePath).pipe(
    Match.when(Option.isSome, (externalPath) =>
      Effect.flatMap(Ref.get(ref), (graph) =>
        Effect.flatMap(
          symbolValueFor(graph, astEntityRef),
          (importSymbol) =>
            Effect.map(
              fetchAstImport(table, ref, importSymbol, {
                importKind: AstImportKind.NamedImport,
                modulePath: externalPath.value,
                exportName,
                isTypeOnly: false,
              }),
              (astImport) => Option.some<AstEntityRef>(new AstImportRef({ key: astImport.key })),
            ),
        ))),
    Match.when(Option.isNone, () => Effect.succeedSome(astEntityRef)),
    Match.exhaustive,
  )

const symbolValueFor = (
  graph: AnalysisGraph,
  astEntityRef: AstEntityRef,
): Effect.Effect<Option.Option<ts.Symbol>> =>
  Match.value(astEntityRef).pipe(
    Match.tag('AstSymbolRef', (astSymbolRef) => Effect.succeed(symbolValueOf(graph, astSymbolRef.symbolId))),
    Match.orElse(() => Effect.succeedNone),
  )

export const getExportOfAstModule = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportName: string,
  astModule: AstModule,
): Effect.Effect<AstEntityRef, ExtractorError> =>
  Effect.flatMap(
    tryGetExportOfAstModuleRecursive(table, ref, exportName, astModule, HashSet.empty()),
    (astEntityRef) =>
      Option.match(astEntityRef, {
        onSome: (entityRef) => Effect.succeed(entityRef),
        onNone: () =>
          Effect.flatMap(Ref.get(ref), (graph) =>
            Effect.die(
              invariantDefect(
                `Unable to analyze the export ${JSON.stringify(exportName)} in\n` +
                  Option.getOrElse(Option.map(sourceFileOfModule(graph, astModule), (file) => file.fileName), () => ''),
              ),
            )),
      }),
  )

export const fetchReferencedAstEntity = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  symbol: ts.Symbol,
  referringModuleIsExternal: boolean,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Match.value((symbol.flags & ts.SymbolFlags.FunctionScopedVariable) !== 0).pipe(
    Match.when(true, (): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> => Effect.succeedNone),
    Match.when(false, () =>
      Match.value(referringModuleIsExternal).pipe(
        Match.when(true, () =>
          Effect.flatMap(Ref.get(ref), (graph) =>
            table.fetchAstSymbol(ref, {
              followedSymbol: TypeScriptHelpers.followAliases(symbol, graph.typeChecker),
              isExternal: true,
              includeNominalAnalysis: false,
              addIfMissing: true,
            }))),
        Match.when(false, () => followReferencedAliasChain(table, ref, symbol)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const followReferencedAliasChain = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  current: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) => followAliasChainWithChecker(table, ref, graph.typeChecker, current))

const followAliasChainWithChecker = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  typeChecker: ts.TypeChecker,
  current: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(matchReferencedDeclaration(table, ref, current), (matched) =>
    Option.match(matched, {
      onSome: (astEntityRef) => Effect.succeedSome(astEntityRef),
      onNone: () =>
        Match.value((current.flags & ts.SymbolFlags.Alias) !== 0).pipe(
          Match.when(false, () => fetchReferencedSymbol(table, ref, current)),
          Match.when(true, () => {
            const currentAlias = Option.fromUndefinedOr(
              TypeScriptInternals.getImmediateAliasedSymbol(current, typeChecker),
            )
            return Option.match(currentAlias, {
              onNone: () => fetchReferencedSymbol(table, ref, current),
              onSome: (alias) =>
                Match.value(alias === current).pipe(
                  Match.when(true, () => fetchReferencedSymbol(table, ref, current)),
                  Match.when(false, () => followAliasChainWithChecker(table, ref, typeChecker, alias)),
                  Match.exhaustive,
                ),
            })
          }),
          Match.exhaustive,
        ),
    }))

const fetchReferencedSymbol = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  followedSymbol: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  table.fetchAstSymbol(ref, {
    followedSymbol,
    isExternal: false,
    includeNominalAnalysis: false,
    addIfMissing: true,
  })

const matchReferencedDeclaration = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  current: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  followReferencedDeclarations(
    table,
    ref,
    current,
    Option.getOrElse(Option.fromNullishOr(current.declarations), () => []),
  )

const followReferencedDeclarations = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  current: ts.Symbol,
  declarations: ReadonlyArray<ts.Declaration>,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> => {
  const initial: Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> = Effect.succeedNone
  return Arr.reduce(
    declarations,
    initial,
    (accumulatedEffect, declaration) =>
      Effect.flatMap(accumulatedEffect, (accumulated) =>
        Option.match(accumulated, {
          onSome: (astEntityRef) => Effect.succeedSome(astEntityRef),
          onNone: () =>
            Effect.flatMap(
              tryMatchExportDeclaration(table, ref, declaration, current),
              (exportMatch) =>
                Option.match(exportMatch, {
                  onSome: (astEntityRef) => Effect.succeedSome(astEntityRef),
                  onNone: () => tryMatchImportDeclaration(table, ref, declaration, current),
                }),
            ),
        })),
  )
}

const getIsTypeOnly = (importDeclaration: ts.ImportDeclaration): boolean =>
  Option.match(Option.fromNullishOr(importDeclaration.importClause), {
    onNone: () => false,
    onSome: (importClause) => importClause.isTypeOnly === true,
  })

const tryMatchExportDeclaration = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  declaration: ts.Declaration,
  declarationSymbol: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Option.match(
    Option.fromUndefinedOr(
      TypeScriptHelpers.findFirstParent<ts.ExportDeclaration>(declaration, ts.SyntaxKind.ExportDeclaration),
    ),
    {
      onNone: () => Effect.succeedNone,
      onSome: (exportDeclaration) =>
        Match.value(declaration).pipe(
          Match.when(ts.isExportSpecifier, (exportSpecifier) =>
            exportNameFollowUp(
              table,
              ref,
              exportDeclaration,
              declarationSymbol,
              Option.some(
                Option.getOrElse(Option.fromNullishOr(exportSpecifier.propertyName), () => exportSpecifier.name)
                  .getText()
                  .trim(),
              ),
            )),
          Match.when(ts.isNamespaceExport, () =>
            Effect.flatMap(
              fetchSpecifierAstModule(table, ref, exportDeclaration, declarationSymbol),
              (astModule) => exportNamespaceEntityOf(ref, astModule, declarationSymbol, declaration),
            )),
          Match.orElse(() =>
            Effect.die(
              invariantDefect(
                `Unimplemented export declaration kind: ${declaration.getText()}\n` +
                  SourceFileLocationFormatter.formatDeclaration(declaration),
              ),
            )
          ),
        ),
    },
  )

const exportNameFollowUp = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportDeclaration: ts.ExportDeclaration,
  declarationSymbol: ts.Symbol,
  exportName: Option.Option<string>,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Match.value(exportDeclaration.moduleSpecifier !== undefined).pipe(
    Match.when(false, () => Effect.succeedNone),
    Match.when(true, () =>
      Option.match(exportName, {
        onNone: () => Effect.succeedNone,
        onSome: (name) =>
          Effect.flatMap(tryGetExternalModulePath(ref, exportDeclaration), (externalModulePath) =>
            Option.match(externalModulePath, {
              onSome: (modulePath) =>
                Effect.map(
                  fetchAstImport(table, ref, Option.some(declarationSymbol), {
                    importKind: AstImportKind.NamedImport,
                    modulePath,
                    exportName: name,
                    isTypeOnly: false,
                  }),
                  (astImport) =>
                    Option.some<AstEntityRef>(new AstImportRef({ key: astImport.key })),
                ),
              onNone: () => getExportOfSpecifierAstModule(table, ref, name, exportDeclaration, declarationSymbol),
            })),
      })),
    Match.exhaustive,
  )

const exportNamespaceEntityOf = (
  ref: AnalysisRef,
  astModule: AstModule,
  declarationSymbol: ts.Symbol,
  declaration: ts.Declaration,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(
    getAstNamespaceImport(ref, astModule, declarationSymbol, declaration),
    (astNamespaceImport) =>
      Effect.map(
        Ref.update(ref, (graph) => withNamespaceExportFlag(graph, astNamespaceImport)),
        () => Option.some<AstEntityRef>(new AstNamespaceImportRef({ symbolId: astNamespaceImport.symbolId })),
      ),
  )

const withNamespaceExportFlag = (
  graph: AnalysisGraph,
  astNamespaceImport: AstNamespaceImport,
): AnalysisGraph =>
  Match.value(astNamespaceImport.isExport).pipe(
    Match.when(true, () => graph),
    Match.when(false, () => ({
      ...graph,
      namespaceImports: HashMap.set(
        graph.namespaceImports,
        astNamespaceImport.symbolId,
        new AstNamespaceImport({
          localName: astNamespaceImport.localName,
          astModuleId: astNamespaceImport.astModuleId,
          declarationId: astNamespaceImport.declarationId,
          symbolId: astNamespaceImport.symbolId,
          isExport: true,
        }),
      ),
    })),
    Match.exhaustive,
  )

const getAstNamespaceImport = (
  ref: AnalysisRef,
  astModule: AstModule,
  declarationSymbol: ts.Symbol,
  declaration: ts.Declaration,
): Effect.Effect<AstNamespaceImport, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Option.match(HashMap.get(graph.namespaceImportByModule, astModule.moduleSymbolId), {
        onSome: (symbolId) =>
          Option.match(HashMap.get(graph.namespaceImports, symbolId), {
            onSome: (astNamespaceImport) => Effect.succeed(astNamespaceImport),
            onNone: () => Effect.die(invariantDefect('Namespace import record missing for module')),
          }),
        onNone: () => {
          const astNamespaceImport = new AstNamespaceImport({
            localName: declarationSymbol.name,
            astModuleId: astModule.moduleSymbolId,
            declarationId: getNodeId(declaration),
            symbolId: getSymbolId(declarationSymbol),
            isExport: false,
          })
          return Effect.map(
            Ref.update(ref, (next) => ({
              ...next,
              namespaceImportByModule: HashMap.set(
                next.namespaceImportByModule,
                astModule.moduleSymbolId,
                astNamespaceImport.symbolId,
              ),
              namespaceImports: HashMap.set(next.namespaceImports, astNamespaceImport.symbolId, astNamespaceImport),
              symbolValues: HashMap.set(next.symbolValues, astNamespaceImport.symbolId, declarationSymbol),
              declarationValues: HashMap.set(next.declarationValues, astNamespaceImport.declarationId, declaration),
            })),
            () => astNamespaceImport,
          )
        },
      }),
  )

const tryMatchImportDeclaration = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  declaration: ts.Declaration,
  declarationSymbol: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Option.match(
    Option.fromUndefinedOr(
      TypeScriptHelpers.findFirstParent<ts.ImportDeclaration>(declaration, ts.SyntaxKind.ImportDeclaration),
    ),
    {
      onNone: () => importEqualsDeclarationOf(table, ref, declaration, declarationSymbol),
      onSome: (importDeclaration) =>
        Effect.flatMap(tryGetExternalModulePath(ref, importDeclaration), (externalModulePath) =>
          Match.value(declaration).pipe(
            Match.when(ts.isNamespaceImport, () =>
              namespaceImportDeclarationOf(
                table,
                ref,
                importDeclaration,
                declarationSymbol,
                declaration,
                externalModulePath,
              )),
            Match.when(ts.isImportSpecifier, (importSpecifier) =>
              importSpecifierDeclarationOf(
                table,
                ref,
                importSpecifier,
                importDeclaration,
                declarationSymbol,
                externalModulePath,
              )),
            Match.when(ts.isImportClause, (importClause) =>
              importClauseDeclarationOf(
                table,
                ref,
                importClause,
                importDeclaration,
                declarationSymbol,
                externalModulePath,
              )),
            Match.orElse(() =>
              Effect.die(
                invariantDefect(
                  `Unimplemented import declaration kind: ${declaration.getText()}\n` +
                    SourceFileLocationFormatter.formatDeclaration(declaration),
                ),
              )
            ),
          )),
    },
  )

const namespaceImportDeclarationOf = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  importDeclaration: ts.ImportDeclaration,
  declarationSymbol: ts.Symbol,
  declaration: ts.Declaration,
  externalModulePath: Option.Option<string>,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Option.match(externalModulePath, {
    onNone: () =>
      Effect.flatMap(
        fetchSpecifierAstModule(table, ref, importDeclaration, declarationSymbol),
        (astModule) =>
          Effect.map(
            getAstNamespaceImport(ref, astModule, declarationSymbol, declaration),
            () => Option.some<AstEntityRef>(new AstNamespaceImportRef({ symbolId: getSymbolId(declarationSymbol) })),
          ),
      ),
    onSome: (modulePath) =>
      Effect.map(
        fetchAstImport(table, ref, Option.none(), {
          importKind: AstImportKind.StarImport,
          exportName: declarationSymbol.name,
          modulePath,
          isTypeOnly: getIsTypeOnly(importDeclaration),
        }),
        (astImport) => Option.some<AstEntityRef>(new AstImportRef({ key: astImport.key })),
      ),
  })

const importSpecifierDeclarationOf = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  importSpecifier: ts.ImportSpecifier,
  importDeclaration: ts.ImportDeclaration,
  declarationSymbol: ts.Symbol,
  externalModulePath: Option.Option<string>,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> => {
  const exportName: string = Option.getOrElse(
    Option.fromNullishOr(importSpecifier.propertyName),
    () => importSpecifier.name,
  )
    .getText()
    .trim()
  return Option.match(externalModulePath, {
    onSome: (modulePath) =>
      Effect.map(
        fetchAstImport(table, ref, Option.some(declarationSymbol), {
          importKind: AstImportKind.NamedImport,
          modulePath,
          exportName,
          isTypeOnly: getIsTypeOnly(importDeclaration),
        }),
        (astImport) => Option.some<AstEntityRef>(new AstImportRef({ key: astImport.key })),
      ),
    onNone: () => getExportOfSpecifierAstModule(table, ref, exportName, importDeclaration, declarationSymbol),
  })
}

const importClauseDeclarationOf = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  importClause: ts.ImportClause,
  importDeclaration: ts.ImportDeclaration,
  declarationSymbol: ts.Symbol,
  externalModulePath: Option.Option<string>,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> => {
  const exportName: string = Option.match(Option.fromNullishOr(importClause.name), {
    onSome: (identifier) => identifier.getText().trim(),
    onNone: () => ts.InternalSymbolName.Default,
  })
  return Option.match(externalModulePath, {
    onSome: (modulePath) =>
      Effect.map(
        fetchAstImport(table, ref, Option.some(declarationSymbol), {
          importKind: AstImportKind.DefaultImport,
          modulePath,
          exportName,
          isTypeOnly: getIsTypeOnly(importDeclaration),
        }),
        (astImport) => Option.some<AstEntityRef>(new AstImportRef({ key: astImport.key })),
      ),
    onNone: () =>
      getExportOfSpecifierAstModule(
        table,
        ref,
        ts.InternalSymbolName.Default,
        importDeclaration,
        declarationSymbol,
      ),
  })
}

const importEqualsDeclarationOf = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  declaration: ts.Declaration,
  declarationSymbol: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Match.value(declaration).pipe(
    Match.when(ts.isImportEqualsDeclaration, (importEqualsDeclaration) =>
      Match.value(importEqualsDeclaration.moduleReference).pipe(
        Match.when(ts.isExternalModuleReference, (moduleReference) =>
          Match.value(moduleReference.expression).pipe(
            Match.when(ts.isStringLiteralLike, (expression) =>
              Effect.map(
                fetchAstImport(table, ref, Option.some(declarationSymbol), {
                  importKind: AstImportKind.EqualsImport,
                  modulePath: TypeScriptInternals.getTextOfIdentifierOrLiteral(expression),
                  exportName: TypeScriptInternals.getTextOfIdentifierOrLiteral(importEqualsDeclaration.name),
                  isTypeOnly: false,
                }),
                (astImport) =>
                  Option.some<AstEntityRef>(new AstImportRef({ key: astImport.key })),
              )),
            Match.orElse(() => Effect.succeedNone),
          )),
        Match.orElse(() => Effect.succeedNone),
      )),
    Match.orElse(() =>
      Effect.succeedNone
    ),
  )

const getExportOfSpecifierAstModule = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  exportName: string,
  importOrExportDeclaration: ts.ImportDeclaration | ts.ExportDeclaration,
  exportSymbol: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(
    fetchSpecifierAstModule(table, ref, importOrExportDeclaration, exportSymbol),
    (specifierAstModule) => Effect.asSome(getExportOfAstModule(table, ref, exportName, specifierAstModule)),
  )

const tryGetExternalModulePath = (
  ref: AnalysisRef,
  importOrExportDeclaration: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportTypeNode,
): Effect.Effect<Option.Option<string>, ExtractorError> =>
  Effect.flatMap(getModuleSpecifier(importOrExportDeclaration), (moduleSpecifier) =>
    Effect.map(
      isExternalModulePath(ref, importOrExportDeclaration, moduleSpecifier),
      (isExternal) => Option.filter(Option.some(moduleSpecifier), () => isExternal),
    ))

const packageNameOf = (resolvedModule: ts.ResolvedModuleFull): string | undefined => resolvedModule.packageId?.name

const isBundledPackageName = (graph: AnalysisGraph, packageName: string | undefined): boolean =>
  packageName !== undefined && HashSet.has(graph.bundledPackageNames, packageName)

const isExternalModulePath = (
  ref: AnalysisRef,
  importOrExportDeclaration: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportTypeNode,
  moduleSpecifier: string,
): Effect.Effect<boolean, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) => {
    const resolvedModule = TypeScriptInternals.getResolvedModule(
      graph.program,
      importOrExportDeclaration.getSourceFile(),
      moduleSpecifier,
      usageModeOf(graph, importOrExportDeclaration),
    )
    return Option.match(Option.fromNullishOr(resolvedModule), {
      onNone: () => Effect.succeed(true),
      onSome: (resolved) => {
        const bundled: boolean = isBundledPackageName(graph, packageNameOf(resolved))
        return Match.value(bundled).pipe(
          Match.when(true, () => Effect.succeed(false)),
          Match.when(false, () =>
            Option.match(Option.fromNullishOr(resolved.isExternalLibraryImport), {
              onNone: () =>
                Effect.die(
                  invariantDefect(
                    `Cannot determine whether the module ${JSON.stringify(moduleSpecifier)} is external\n` +
                      SourceFileLocationFormatter.formatDeclaration(importOrExportDeclaration),
                  ),
                ),
              onSome: (isExternalLibraryImport) => Effect.succeed(isExternalLibraryImport),
            })),
          Match.exhaustive,
        )
      },
    })
  })

const getModuleSpecifier = (
  importOrExportDeclaration: ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportTypeNode,
): Effect.Effect<string, ExtractorError> => {
  const moduleSpecifier = TypeScriptHelpers.getModuleSpecifier(importOrExportDeclaration)
  return Option.match(Option.fromNullishOr(moduleSpecifier), {
    onSome: (specifier) => Effect.succeed(specifier),
    onNone: () =>
      Effect.die(
        invariantDefect(
          'Unable to parse module specifier\n' +
            SourceFileLocationFormatter.formatDeclaration(importOrExportDeclaration),
        ),
      ),
  })
}

const fetchSpecifierAstModule = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  importOrExportDeclaration: ts.ImportDeclaration | ts.ExportDeclaration,
  exportSymbol: ts.Symbol,
): Effect.Effect<AstModule, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Effect.flatMap(getModuleSpecifier(importOrExportDeclaration), (moduleSpecifier) => {
        const mode = usageModeOf(graph, importOrExportDeclaration)
        const resolvedModule = TypeScriptInternals.getResolvedModule(
          graph.program,
          importOrExportDeclaration.getSourceFile(),
          moduleSpecifier,
          mode,
        )
        const resolved = Option.fromNullishOr(resolvedModule)
        const moduleSourceFile = Option.flatMap(
          resolved,
          (module) => Option.fromNullishOr(graph.program.getSourceFile(module.resolvedFileName)),
        )
        const moduleReference: IAstModuleReference = {
          moduleSpecifier,
          moduleSpecifierSymbol: exportSymbol,
        }
        return Option.match(moduleSourceFile, {
          onNone: () =>
            Effect.die(
              invariantDefect(
                `getSourceFile() failed to locate ${
                  JSON.stringify(
                    Option.getOrElse(Option.map(resolved, (module) => module.resolvedFileName), () => ''),
                  )
                }\n` + SourceFileLocationFormatter.formatDeclaration(importOrExportDeclaration),
              ),
            ),
          onSome: (sourceFile) =>
            Effect.flatMap(
              isExternalModulePath(ref, importOrExportDeclaration, moduleSpecifier),
              (isExternal) =>
                Effect.flatMap(
                  Option.match(Option.fromNullishOr(resolvedModule), {
                    onNone: () =>
                      Effect.die(
                        invariantDefect(
                          `getResolvedModule() could not resolve module name ${JSON.stringify(moduleSpecifier)}\n` +
                            SourceFileLocationFormatter.formatDeclaration(importOrExportDeclaration),
                        ),
                      ),
                    onSome: () => Effect.void,
                  }),
                  () =>
                    fetchAstModuleFromSourceFile(
                      table,
                      ref,
                      sourceFile,
                      Option.some(moduleReference),
                      isExternal,
                    ),
                ),
            ),
        })
      }),
  )

export const fetchAstImport = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  importSymbol: Option.Option<ts.Symbol>,
  options: IAstImportOptions,
): Effect.Effect<AstImport, ExtractorError> => {
  const key: string = astImportKeyOf(options)
  return Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(HashMap.get(graph.imports, key), {
      onSome: (astImport) =>
        Match.value(options.isTypeOnly).pipe(
          Match.when(true, () => Effect.succeed(astImport)),
          Match.when(false, () => {
            const widened = withoutTypeOnlyEverywhere(astImport)
            return Effect.map(
              Ref.update(ref, (next) => ({
                ...next,
                imports: HashMap.set(next.imports, key, widened),
              })),
              () => widened,
            )
          }),
          Match.exhaustive,
        ),
      onNone: () =>
        Effect.flatMap(
          Ref.update(ref, (next) => ({
            ...next,
            imports: HashMap.set(next.imports, key, astImportOf(options)),
          })),
          () =>
            Effect.flatMap(
              Option.match(importSymbol, {
                onNone: () => Effect.succeedNone,
                onSome: (symbol) =>
                  Effect.flatMap(Ref.get(ref), (next) =>
                    table.fetchAstSymbol(ref, {
                      followedSymbol: TypeScriptHelpers.followAliases(symbol, next.typeChecker),
                      isExternal: true,
                      includeNominalAnalysis: false,
                      addIfMissing: true,
                    })),
              }),
              (astSymbolRef) =>
                Effect.flatMap(Ref.get(ref), (next) => {
                  const created = Option.getOrElse(HashMap.get(next.imports, key), () => astImportOf(options))
                  const merged: AstImport = Option.match(astSymbolRef, {
                    onNone: () => created,
                    onSome: (symbolRef) => withAstSymbolRef(created, symbolRef),
                  })
                  return Effect.map(
                    Ref.update(ref, (last) => ({
                      ...last,
                      imports: HashMap.set(last.imports, key, merged),
                    })),
                    () => merged,
                  )
                }),
            ),
        ),
    }))
}

export const fetchReferencedAstEntityFromImportTypeNode = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  node: ts.ImportTypeNode,
  referringModuleIsExternal: boolean,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(tryGetExternalModulePath(ref, node), (externalModulePath) =>
    Option.match(externalModulePath, {
      onSome: (modulePath) => {
        const exportName: string = Option.match(Option.fromNullishOr(node.qualifier), {
          onSome: (qualifier) => qualifier.getText().trim(),
          onNone: () => SyntaxHelpers.makeCamelCaseIdentifier(modulePath),
        })
        return Effect.map(
          fetchAstImport(table, ref, Option.none(), {
            importKind: AstImportKind.ImportType,
            exportName,
            modulePath,
            isTypeOnly: false,
          }),
          (astImport) => Option.some<AstEntityRef>(new AstImportRef({ key: astImport.key })),
        )
      },
      onNone: () =>
        Effect.flatMap(Ref.get(ref), (graph) => {
          const rightMostToken: ts.Identifier | ts.ImportTypeNode = Option.match(
            Option.fromNullishOr(node.qualifier),
            {
              onSome: (qualifier) =>
                Match.value(qualifier).pipe(
                  Match.when(ts.isQualifiedName, (qualified) => qualified.right),
                  Match.orElse((identifier) => identifier),
                ),
              onNone: () => node,
            },
          )
          const exportSymbol = Option.fromNullishOr(graph.typeChecker.getSymbolAtLocation(rightMostToken))
          return Option.match(exportSymbol, {
            onNone: () =>
              Effect.die(
                invariantDefect(
                  `Symbol not found for identifier: ${node.getText()}\n` +
                    SourceFileLocationFormatter.formatDeclaration(node),
                ),
              ),
            onSome: (symbol) => followImportTypeAliasChain(table, ref, symbol, referringModuleIsExternal),
          })
        }),
    }))

const followImportTypeAliasChain = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  followedSymbol: ts.Symbol,
  referringModuleIsExternal: boolean,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(
    fetchReferencedAstEntity(table, ref, followedSymbol, referringModuleIsExternal),
    (referencedAstEntity) =>
      Option.match(referencedAstEntity, {
        onSome: (astEntityRef) => Effect.succeedSome(astEntityRef),
        onNone: () => {
          const followedSymbolNode = Option.flatMap(Option.fromNullishOr(followedSymbol.declarations), Arr.head)
          return Option.match(Option.filter(followedSymbolNode, ts.isImportTypeNode), {
            onSome: (importTypeNode) =>
              fetchReferencedAstEntityFromImportTypeNode(table, ref, importTypeNode, referringModuleIsExternal),
            onNone: () => advanceImportTypeAlias(table, ref, followedSymbol, referringModuleIsExternal),
          })
        },
      }),
  )

const advanceImportTypeAlias = (
  table: IAstSymbolTable,
  ref: AnalysisRef,
  followedSymbol: ts.Symbol,
  referringModuleIsExternal: boolean,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Match.value((followedSymbol.flags & ts.SymbolFlags.Alias) !== 0).pipe(
      Match.when(false, () =>
        table.fetchAstSymbol(ref, {
          followedSymbol,
          isExternal: referringModuleIsExternal,
          includeNominalAnalysis: false,
          addIfMissing: true,
        })),
      Match.when(true, () => {
        const currentAlias = Option.fromNullishOr(graph.typeChecker.getAliasedSymbol(followedSymbol))
        return Option.match(currentAlias, {
          onNone: () =>
            table.fetchAstSymbol(ref, {
              followedSymbol,
              isExternal: referringModuleIsExternal,
              includeNominalAnalysis: false,
              addIfMissing: true,
            }),
          onSome: (alias) =>
            Match.value(alias === followedSymbol).pipe(
              Match.when(true, () =>
                table.fetchAstSymbol(ref, {
                  followedSymbol,
                  isExternal: referringModuleIsExternal,
                  includeNominalAnalysis: false,
                  addIfMissing: true,
                })),
              Match.when(false, () => followImportTypeAliasChain(table, ref, alias, referringModuleIsExternal)),
              Match.exhaustive,
            ),
        })
      }),
      Match.exhaustive,
    ))
