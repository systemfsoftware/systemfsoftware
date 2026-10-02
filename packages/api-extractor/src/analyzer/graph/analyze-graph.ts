import { Chunk, HashMap, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Order from 'effect/Order'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import type * as Ts from 'typescript'

import { type ExtractorError, InternalInvariantError } from '../../errors/index.js'
import type { SymbolId } from '../TypeScriptInternals.js'
import type { AnalysisGraph, AnalysisGraphInput, AnalysisRef } from './analysis-graph.js'
import { makeAnalysisRef } from './analysis-graph.js'
import { type AstModuleExportInfo } from './ast-module.js'
import { astSymbolTable } from './ast-symbol-table.js'
import { fetchAstModuleExportInfo, fetchAstModuleFromSourceFile } from './export-analyzer.js'

const invariantDefect = (message: string): InternalInvariantError => new InternalInvariantError({ message })

export interface GraphAnalysis {
  readonly ref: AnalysisRef
  readonly entryPointModuleSymbolId: SymbolId
  readonly exportInfo: AstModuleExportInfo
  readonly starExportedExternalModulePaths: ReadonlyArray<string>
}

const entryPointSourceFileOf = (
  ref: AnalysisRef,
): Effect.Effect<Ts.SourceFile, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(graph.workingPackage, {
      onNone: () =>
        Effect.die(
          invariantDefect('Unable to load file: ' + graph.extractorConfig.mainEntryPointFilePath),
        ),
      onSome: (workingPackage) => Effect.succeed(workingPackage.entryPointSourceFile),
    }))

const starExportedExternalModulePathsOf = (
  graph: AnalysisGraph,
  exportInfo: AstModuleExportInfo,
): ReadonlyArray<string> =>
  Arr.sort(
    Arr.filterMap(Chunk.toReadonlyArray(exportInfo.starExportedExternalModules), (moduleSymbolId) =>
      Result.fromOption(
        Option.flatMap(HashMap.get(graph.modules, moduleSymbolId), (astModule) => astModule.externalModulePath),
        () => undefined,
      )),
    Order.String,
  )

export const analyzeGraph = (input: AnalysisGraphInput): Effect.Effect<GraphAnalysis, ExtractorError> =>
  Effect.flatMap(
    makeAnalysisRef(input),
    (ref) =>
      Effect.flatMap(entryPointSourceFileOf(ref), (entryPointSourceFile) =>
        Effect.flatMap(
          fetchAstModuleFromSourceFile(astSymbolTable, ref, entryPointSourceFile, Option.none(), false),
          (entryPointModule) =>
            Effect.flatMap(
              fetchAstModuleExportInfo(astSymbolTable, ref, entryPointModule),
              (exportInfo) =>
                Effect.map(Ref.get(ref), (graph) => ({
                  ref,
                  entryPointModuleSymbolId: entryPointModule.moduleSymbolId,
                  exportInfo,
                  starExportedExternalModulePaths: starExportedExternalModulePathsOf(graph, exportInfo),
                })),
            ),
        )),
  )
