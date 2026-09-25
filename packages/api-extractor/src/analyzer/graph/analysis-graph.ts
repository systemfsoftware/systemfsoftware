import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'
import type * as Ts from 'typescript'

import {
  type ExtractorMessage,
  type LocatedMessage,
  makeExtractorMessage,
  type MessageLog,
} from '../../collector/message-log.js'
import type { ExtractorConfig } from '../../config/extractor-config.js'
import type { IGlobalVariableAnalyzer, NodeId, SymbolId } from '../TypeScriptInternals.js'
import type { AstDeclaration } from './ast-declaration.js'
import type { AstEntityRef } from './ast-entity.js'
import type { AstImport } from './ast-import.js'
import type { AstModule, AstModuleExportInfo } from './ast-module.js'
import type { AstNamespaceImport } from './ast-namespace-import.js'
import type { AstSymbol } from './ast-symbol.js'
import { PackageIndex, type WorkingPackageJson } from './package-index.js'
import { makePackageMetadata, type PackageMetadata, resolveTsdocMetadataPath } from './package-metadata.js'
import type { WorkingPackage } from './working-package.js'

export interface AnalysisGraph {
  readonly program: Ts.Program
  readonly typeChecker: Ts.TypeChecker
  readonly globalVariableAnalyzer: IGlobalVariableAnalyzer
  readonly tsdocConfiguration: tsdoc.TSDocConfiguration
  readonly bundledPackageNames: HashSet.HashSet<string>
  readonly packageIndex: PackageIndex
  readonly extractorConfig: ExtractorConfig
  readonly workingPackage: Option.Option<WorkingPackage>

  readonly symbols: HashMap.HashMap<SymbolId, AstSymbol>
  readonly symbolValues: HashMap.HashMap<SymbolId, Ts.Symbol>
  readonly declarations: HashMap.HashMap<NodeId, AstDeclaration>
  readonly declarationValues: HashMap.HashMap<NodeId, Ts.Node>
  readonly childrenByDeclaration: HashMap.HashMap<NodeId, Chunk.Chunk<NodeId>>
  readonly referencedByDeclaration: HashMap.HashMap<NodeId, Chunk.Chunk<AstEntityRef>>
  readonly entitiesByNode: HashMap.HashMap<NodeId, Option.Option<AstEntityRef>>
  readonly analyzedSymbols: HashSet.HashSet<SymbolId>
  readonly analyzedNamespaceImports: HashSet.HashSet<SymbolId>
  readonly warnedGlobalNames: HashSet.HashSet<string>
  readonly modules: HashMap.HashMap<SymbolId, AstModule>
  readonly moduleExportInfo: HashMap.HashMap<SymbolId, AstModuleExportInfo>
  readonly starExportedModules: HashMap.HashMap<SymbolId, Chunk.Chunk<SymbolId>>
  readonly cachedExportedEntities: HashMap.HashMap<SymbolId, HashMap.HashMap<string, AstEntityRef>>
  readonly importableAmbientSourceFiles: HashSet.HashSet<NodeId>
  readonly namespaceImportByModule: HashMap.HashMap<SymbolId, SymbolId>
  readonly namespaceImports: HashMap.HashMap<SymbolId, AstNamespaceImport>
  readonly imports: HashMap.HashMap<string, AstImport>
  readonly packageMetadata: HashMap.HashMap<string, PackageMetadata>
  readonly messageLog: MessageLog
}

export type AnalysisRef = Ref.Ref<AnalysisGraph>

export interface AnalysisGraphInput {
  readonly program: Ts.Program
  readonly extractorConfig: ExtractorConfig
  readonly tsdocConfiguration: tsdoc.TSDocConfiguration
  readonly bundledPackageNames: Iterable<string>
  readonly packageIndex: PackageIndex
  readonly workingPackage: Option.Option<WorkingPackage>
  readonly messageLog: MessageLog
}

export const makeGraph = (input: AnalysisGraphInput): AnalysisGraph => ({
  program: input.program,
  typeChecker: input.program.getTypeChecker(),
  globalVariableAnalyzer: input.program.getTypeChecker().getEmitResolver(),
  tsdocConfiguration: input.tsdocConfiguration,
  bundledPackageNames: HashSet.fromIterable(input.bundledPackageNames),
  packageIndex: input.packageIndex,
  extractorConfig: input.extractorConfig,
  workingPackage: input.workingPackage,
  symbols: HashMap.empty(),
  symbolValues: HashMap.empty(),
  declarations: HashMap.empty(),
  declarationValues: HashMap.empty(),
  childrenByDeclaration: HashMap.empty(),
  referencedByDeclaration: HashMap.empty(),
  entitiesByNode: HashMap.empty(),
  analyzedSymbols: HashSet.empty(),
  analyzedNamespaceImports: HashSet.empty(),
  warnedGlobalNames: HashSet.empty(),
  modules: HashMap.empty(),
  moduleExportInfo: HashMap.empty(),
  starExportedModules: HashMap.empty(),
  cachedExportedEntities: HashMap.empty(),
  importableAmbientSourceFiles: HashSet.empty(),
  namespaceImportByModule: HashMap.empty(),
  namespaceImports: HashMap.empty(),
  imports: HashMap.empty(),
  packageMetadata: HashMap.empty(),
  messageLog: input.messageLog,
})

export const makeAnalysisRef = (input: AnalysisGraphInput): Effect.Effect<AnalysisRef> => Ref.make(makeGraph(input))

export const symbolValueOf = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => Option.Option<Ts.Symbol>,
  (graph: AnalysisGraph, symbolId: SymbolId) => Option.Option<Ts.Symbol>
>(2, (graph: AnalysisGraph, symbolId: SymbolId): Option.Option<Ts.Symbol> => HashMap.get(graph.symbolValues, symbolId))

export const nodeValueOf = dual<
  (nodeId: NodeId) => (graph: AnalysisGraph) => Option.Option<Ts.Node>,
  (graph: AnalysisGraph, nodeId: NodeId) => Option.Option<Ts.Node>
>(2, (graph: AnalysisGraph, nodeId: NodeId): Option.Option<Ts.Node> => HashMap.get(graph.declarationValues, nodeId))

export const astSymbolOfId = dual<
  (symbolId: SymbolId) => (graph: AnalysisGraph) => Option.Option<AstSymbol>,
  (graph: AnalysisGraph, symbolId: SymbolId) => Option.Option<AstSymbol>
>(2, (graph: AnalysisGraph, symbolId: SymbolId): Option.Option<AstSymbol> => HashMap.get(graph.symbols, symbolId))

export const astDeclarationOfId = dual<
  (nodeId: NodeId) => (graph: AnalysisGraph) => Option.Option<AstDeclaration>,
  (graph: AnalysisGraph, nodeId: NodeId) => Option.Option<AstDeclaration>
>(2, (graph: AnalysisGraph, nodeId: NodeId): Option.Option<AstDeclaration> => HashMap.get(graph.declarations, nodeId))

const messageOf = (message: LocatedMessage): ExtractorMessage =>
  Option.match(message.position, {
    onNone: () => makeExtractorMessage(message),
    onSome: (position) =>
      makeExtractorMessage({
        ...message,
        sourceFilePath: position.sourceFilePath,
        sourceFileLine: position.line,
        sourceFileColumn: position.column,
      }),
  })

export const appendMessage = dual<
  (message: LocatedMessage) => (graph: AnalysisGraph) => AnalysisGraph,
  (graph: AnalysisGraph, message: LocatedMessage) => AnalysisGraph
>(2, (graph: AnalysisGraph, message: LocatedMessage): AnalysisGraph => ({
  ...graph,
  messageLog: {
    ...graph.messageLog,
    messages: Chunk.append(graph.messageLog.messages, messageOf(message)),
  },
}))

export const foundTsdocMetadataMessage = (tsdocMetadataPath: string): LocatedMessage => ({
  category: 'console',
  messageId: 'console-found-tsdoc-metadata',
  text: 'Found metadata in ' + tsdocMetadataPath,
  properties: undefined,
  logLevel: 'verbose',
  position: Option.none(),
})

export const workingPackageJsonOf = dual<
  (sourceFilePath: string) => (graph: AnalysisGraph) => Option.Option<WorkingPackageJson>,
  (graph: AnalysisGraph, sourceFilePath: string) => Option.Option<WorkingPackageJson>
>(2, (
  graph: AnalysisGraph,
  sourceFilePath: string,
): Option.Option<WorkingPackageJson> => PackageIndex.forSourceFile(graph.packageIndex, sourceFilePath))

export const tryFetchPackageMetadata = dual<
  (sourceFilePath: string) => (graph: AnalysisGraph) => readonly [AnalysisGraph, Option.Option<PackageMetadata>],
  (graph: AnalysisGraph, sourceFilePath: string) => readonly [AnalysisGraph, Option.Option<PackageMetadata>]
>(2, (
  graph: AnalysisGraph,
  sourceFilePath: string,
): readonly [AnalysisGraph, Option.Option<PackageMetadata>] =>
  Option.match(workingPackageJsonOf(graph, sourceFilePath), {
    onNone: () => [graph, Option.none()],
    onSome: (workingPackage) =>
      Option.match(HashMap.get(graph.packageMetadata, workingPackage.packageJsonPath), {
        onSome: (packageMetadata) => [graph, Option.some(packageMetadata)],
        onNone: () => {
          const packageJsonFolder = workingPackage.packageJsonPath.slice(
            0,
            workingPackage.packageJsonPath.lastIndexOf('/'),
          )
          const tsdocMetadataPath = resolveTsdocMetadataPath(packageJsonFolder, workingPackage.packageJson)
          const aedocSupported = PackageIndex.hasTsdocMetadataPath(graph.packageIndex, tsdocMetadataPath)
          const loggedGraph: AnalysisGraph = Match.value(aedocSupported).pipe(
            Match.when(true, () => appendMessage(graph, foundTsdocMetadataMessage(tsdocMetadataPath))),
            Match.when(false, () => graph),
            Match.exhaustive,
          )
          return [
            {
              ...loggedGraph,
              packageMetadata: HashMap.set(
                loggedGraph.packageMetadata,
                workingPackage.packageJsonPath,
                makePackageMetadata(workingPackage.packageJsonPath, workingPackage.packageJson, aedocSupported),
              ),
            },
            Option.some(
              makePackageMetadata(workingPackage.packageJsonPath, workingPackage.packageJson, aedocSupported),
            ),
          ]
        },
      }),
  }))

export const isAedocSupportedFor = dual<
  (sourceFilePath: string) => (ref: AnalysisRef) => Effect.Effect<boolean>,
  (ref: AnalysisRef, sourceFilePath: string) => Effect.Effect<boolean>
>(2, (ref: AnalysisRef, sourceFilePath: string): Effect.Effect<boolean> =>
  Ref.modify(ref, (graph) => {
    const [updatedGraph, packageMetadata] = tryFetchPackageMetadata(graph, sourceFilePath)
    return [
      Option.match(packageMetadata, {
        onNone: () => false,
        onSome: (metadata) => metadata.aedocSupported,
      }),
      updatedGraph,
    ]
  }))
