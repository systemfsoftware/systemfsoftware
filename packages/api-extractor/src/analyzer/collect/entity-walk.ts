import type * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import type { ExtractorError } from '../../errors/index.js'
import { nodeValueOf } from '../graph/analysis-graph.js'
import type { AnalysisGraph, AnalysisRef } from '../graph/analysis-graph.js'
import type { AstEntityRef, AstNamespaceImportRef } from '../graph/ast-entity.js'
import type { AstModule } from '../graph/ast-module.js'
import type { AstNamespaceImport } from '../graph/ast-namespace-import.js'
import { astSymbolTable } from '../graph/ast-symbol-table.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import { fetchAstModuleExportInfo } from '../graph/export-analyzer.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import { requireAstSymbol } from './collect-lookups.js'
import {
  type CollectState,
  describeRef,
  emptyDraft,
  entitySymbolIdOf,
  invariantDefect,
  type WalkState,
  withExportName,
} from './collect-state.js'

const localNameOfRef = (graph: AnalysisGraph, entityRef: AstEntityRef): Option.Option<string> =>
  Match.value(entityRef).pipe(
    Match.tag(
      'AstSymbolRef',
      (symbolRef) => Option.map(HashMap.get(graph.symbols, symbolRef.symbolId), (astSymbol) => astSymbol.localName),
    ),
    Match.tag(
      'AstImportRef',
      (importRef) => Option.map(HashMap.get(graph.imports, importRef.key), (astImport) => astImport.localName),
    ),
    Match.tag(
      'AstNamespaceImportRef',
      (namespaceRef) =>
        Option.map(
          HashMap.get(graph.namespaceImports, namespaceRef.symbolId),
          (astNamespaceImport) => astNamespaceImport.localName,
        ),
    ),
    Match.exhaustive,
  )

const requireAstNamespaceImportRecord = (
  graph: AnalysisGraph,
  symbolId: SymbolId,
): Effect.Effect<AstNamespaceImport, ExtractorError> =>
  Option.match(HashMap.get(graph.namespaceImports, symbolId), {
    onSome: (record) => Effect.succeed(record),
    onNone: () => Effect.die(invariantDefect('Missing AstNamespaceImport record for the symbol id ' + symbolId)),
  })

const requireModule = (graph: AnalysisGraph, moduleSymbolId: SymbolId): Effect.Effect<AstModule, ExtractorError> =>
  Option.match(HashMap.get(graph.modules, moduleSymbolId), {
    onSome: (astModule) => Effect.succeed(astModule),
    onNone: () => Effect.die(invariantDefect('Missing AstModule record for the module symbol id ' + moduleSymbolId)),
  })

const requireModuleSourceFile = (
  graph: AnalysisGraph,
  astModule: AstModule,
): Effect.Effect<ts.SourceFile, ExtractorError> =>
  Option.match(nodeValueOf(graph, astModule.sourceFileId), {
    onSome: (node) =>
      Option.match(Option.filter(Option.some(node), ts.isSourceFile), {
        onSome: (sourceFile) => Effect.succeed(sourceFile),
        onNone: () => Effect.die(invariantDefect('AstModule source file id is not a source file')),
      }),
    onNone: () => Effect.die(invariantDefect('Missing ts.Node for the AstModule source file')),
  })

const directiveNameOf = (
  sourceFile: ts.SourceFile,
  directive: ts.FileReference,
  onlyPreserved: boolean,
): Option.Option<string> => {
  const preserved = Option.getOrElse(Option.fromNullishOr(directive.preserve), () => false)
  return Match.value(preserved || !onlyPreserved).pipe(
    Match.when(true, () => Option.some(sourceFile.text.substring(directive.pos, directive.end))),
    Match.when(false, () => Option.none<string>()),
    Match.exhaustive,
  )
}

const addDirective = (
  names: HashSet.HashSet<string>,
  sourceFile: ts.SourceFile,
  directive: ts.FileReference,
  onlyPreserved: boolean,
): HashSet.HashSet<string> =>
  Option.match(directiveNameOf(sourceFile, directive, onlyPreserved), {
    onNone: () => names,
    onSome: (name) => HashSet.add(names, name),
  })

const collectDirectivesOfFile = (
  state: CollectState,
  sourceFile: ts.SourceFile,
  onlyPreserved: boolean,
): CollectState => ({
  ...state,
  dtsTypeReferenceDirectives: Arr.reduce(
    sourceFile.typeReferenceDirectives,
    state.dtsTypeReferenceDirectives,
    (names, directive) => addDirective(names, sourceFile, directive, onlyPreserved),
  ),
  dtsLibReferenceDirectives: Arr.reduce(
    sourceFile.libReferenceDirectives,
    state.dtsLibReferenceDirectives,
    (names, directive) => addDirective(names, sourceFile, directive, onlyPreserved),
  ),
})

export const collectFromSourceFiles = dual<
  (sourceFiles: ReadonlyArray<ts.SourceFile>, onlyPreserved: boolean) => (state: CollectState) => CollectState,
  (state: CollectState, sourceFiles: ReadonlyArray<ts.SourceFile>, onlyPreserved: boolean) => CollectState
>(3, (
  state: CollectState,
  sourceFiles: ReadonlyArray<ts.SourceFile>,
  onlyPreserved: boolean,
): CollectState =>
  Arr.reduce(
    sourceFiles,
    { state, seen: HashSet.empty<string>() },
    (accumulated, sourceFile) =>
      Match.value(HashSet.has(accumulated.seen, sourceFile.fileName)).pipe(
        Match.when(true, () => accumulated),
        Match.when(false, () => ({
          state: collectDirectivesOfFile(accumulated.state, sourceFile, onlyPreserved),
          seen: HashSet.add(accumulated.seen, sourceFile.fileName),
        })),
        Match.exhaustive,
      ),
  ).state)

const declarationSourceFilesOf = (graph: AnalysisGraph, astSymbol: AstSymbol): ReadonlyArray<ts.SourceFile> =>
  Arr.filterMap(Chunk.toReadonlyArray(astSymbol.declarationIds), (declarationId) =>
    Result.fromOption(
      Option.map(nodeValueOf(graph, declarationId), (node) => node.getSourceFile()),
      () => undefined,
    ))

const collectReferenceDirectives = (
  ref: AnalysisRef,
  state: CollectState,
  entityRef: AstEntityRef,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Match.value(entityRef).pipe(
      Match.tag('AstSymbolRef', (symbolRef) =>
        Effect.map(
          requireAstSymbol(graph, symbolRef.symbolId),
          (astSymbol) => collectFromSourceFiles(state, declarationSourceFilesOf(graph, astSymbol), false),
        )),
      Match.tag('AstNamespaceImportRef', (namespaceRef) =>
        Effect.flatMap(
          requireAstNamespaceImportRecord(graph, namespaceRef.symbolId),
          (record) =>
            Effect.flatMap(requireModule(graph, record.astModuleId), (astModule) =>
              Effect.map(requireModuleSourceFile(graph, astModule), (sourceFile) =>
                collectFromSourceFiles(state, [sourceFile], false))),
        )),
      Match.orElse(() =>
        Effect.succeed(state)
      ),
    ))

export const createCollectorEntity = dual<
  (
    state: CollectState,
    entityRef: AstEntityRef,
    exportName: Option.Option<string>,
    parentRef: Option.Option<AstEntityRef>,
  ) => (ref: AnalysisRef) => Effect.Effect<CollectState, ExtractorError>,
  (
    ref: AnalysisRef,
    state: CollectState,
    entityRef: AstEntityRef,
    exportName: Option.Option<string>,
    parentRef: Option.Option<AstEntityRef>,
  ) => Effect.Effect<CollectState, ExtractorError>
>(5, (
  ref: AnalysisRef,
  state: CollectState,
  entityRef: AstEntityRef,
  exportName: Option.Option<string>,
  parentRef: Option.Option<AstEntityRef>,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(HashMap.get(state.entityByRef, entityRef), {
      onSome: (existing) => Effect.succeed(withExportName(state, existing, entityRef, exportName, parentRef)),
      onNone: () =>
        Effect.flatMap(
          Option.match(localNameOfRef(graph, entityRef), {
            onSome: (localName) => Effect.succeed(localName),
            onNone: () => Effect.die(invariantDefect('Missing entity record for ' + describeRef(entityRef))),
          }),
          (localName) => {
            const draft = emptyDraft(localName)
            const seeded: CollectState = {
              ...state,
              entities: Chunk.append(state.entities, entityRef),
              entityByRef: HashMap.set(state.entityByRef, entityRef, draft),
              entityBySymbolId: Option.match(entitySymbolIdOf(entityRef), {
                onSome: (symbolId) => HashMap.set(state.entityBySymbolId, symbolId, entityRef),
                onNone: () => state.entityBySymbolId,
              }),
            }
            return Effect.map(
              collectReferenceDirectives(ref, seeded, entityRef),
              (nextState) => withExportName(nextState, draft, entityRef, exportName, parentRef),
            )
          },
        ),
    })))

const createEntityForReferenced = (
  ref: AnalysisRef,
  state: CollectState,
  graph: AnalysisGraph,
  referencedRef: AstEntityRef,
): Effect.Effect<CollectState, ExtractorError> =>
  Match.value(referencedRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) =>
      Effect.flatMap(requireAstSymbol(graph, symbolRef.symbolId), (astSymbol) =>
        Match.value(Option.isNone(astSymbol.parentAstSymbolId)).pipe(
          Match.when(true, () =>
            createCollectorEntity(ref, state, referencedRef, Option.none(), Option.none())),
          Match.when(false, () =>
            Effect.succeed(state)),
          Match.exhaustive,
        ))),
    Match.orElse(() =>
      createCollectorEntity(ref, state, referencedRef, Option.none(), Option.none())
    ),
  )

export const enterEntity = dual<
  (
    parser: tsdoc.TSDocParser,
    walk: WalkState,
    entityRef: AstEntityRef,
  ) => (ref: AnalysisRef) => Effect.Effect<WalkState, ExtractorError>,
  (
    ref: AnalysisRef,
    parser: tsdoc.TSDocParser,
    walk: WalkState,
    entityRef: AstEntityRef,
  ) => Effect.Effect<WalkState, ExtractorError>
>(4, (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  walk: WalkState,
  entityRef: AstEntityRef,
): Effect.Effect<WalkState, ExtractorError> =>
  Match.value(HashSet.has(walk.seen, entityRef)).pipe(
    Match.when(true, () => Effect.succeed(walk)),
    Match.when(false, () =>
      Effect.flatMap(Ref.get(ref), (graph) => {
        const entered: WalkState = { state: walk.state, seen: HashSet.add(walk.seen, entityRef) }
        return Effect.map(entityWalkPhase(ref, parser, entered, graph, entityRef), (nextWalk) => ({
          state: nextWalk.state,
          seen: entered.seen,
        }))
      })),
    Match.exhaustive,
  ))

const processReferencedEntity = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  walk: WalkState,
  graph: AnalysisGraph,
  referencedRef: AstEntityRef,
): Effect.Effect<WalkState, ExtractorError> =>
  Effect.flatMap(
    createEntityForReferenced(ref, walk.state, graph, referencedRef),
    (nextState) => enterEntity(ref, parser, { ...walk, state: nextState }, referencedRef),
  )

const referencedRefsOf = (graph: AnalysisGraph, declarationId: NodeId): ReadonlyArray<AstEntityRef> =>
  Option.getOrElse(
    Option.map(HashMap.get(graph.referencedByDeclaration, declarationId), Chunk.toReadonlyArray),
    () => [],
  )

const childDeclarationIdsOf = (graph: AnalysisGraph, declarationId: NodeId): ReadonlyArray<NodeId> =>
  Option.getOrElse(
    Option.map(HashMap.get(graph.childrenByDeclaration, declarationId), Chunk.toReadonlyArray),
    () => [],
  )

const processDeclarationReferences = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  walk: WalkState,
  graph: AnalysisGraph,
  declarationId: NodeId,
): Effect.Effect<WalkState, ExtractorError> => {
  const zero: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(walk)
  return Effect.flatMap(
    Arr.reduce(
      referencedRefsOf(graph, declarationId),
      zero,
      (accumulated, referencedRef) =>
        Effect.flatMap(accumulated, (current) => processReferencedEntity(ref, parser, current, graph, referencedRef)),
    ),
    (afterRefs) => {
      const zeroAfter: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(afterRefs)
      return Arr.reduce(
        childDeclarationIdsOf(graph, declarationId),
        zeroAfter,
        (accumulated, childId) =>
          Effect.flatMap(accumulated, (current) => processDeclarationReferences(ref, parser, current, graph, childId)),
      )
    },
  )
}

const entityWalkPhase = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  walk: WalkState,
  graph: AnalysisGraph,
  entityRef: AstEntityRef,
): Effect.Effect<WalkState, ExtractorError> => {
  const zero: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(walk)
  return Match.value(entityRef).pipe(
    Match.tag(
      'AstSymbolRef',
      (symbolRef) =>
        Effect.flatMap(requireAstSymbol(graph, symbolRef.symbolId), (astSymbol) =>
          Arr.reduce(
            Chunk.toReadonlyArray(astSymbol.declarationIds),
            zero,
            (accumulated, declarationId) =>
              Effect.flatMap(
                accumulated,
                (current) => processDeclarationReferences(ref, parser, current, graph, declarationId),
              ),
          )),
    ),
    Match.tag('AstNamespaceImportRef', (namespaceRef) => namespaceEntityPhase(ref, parser, walk, graph, namespaceRef)),
    Match.orElse(() => Effect.succeed(walk)),
  )
}

const namespaceEntityPhase = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  walk: WalkState,
  graph: AnalysisGraph,
  namespaceRef: AstNamespaceImportRef,
): Effect.Effect<WalkState, ExtractorError> =>
  Effect.gen(function*() {
    const record = yield* requireAstNamespaceImportRecord(graph, namespaceRef.symbolId)
    const astModule = yield* requireModule(graph, record.astModuleId)
    const exportInfo = yield* fetchAstModuleExportInfo(astSymbolTable, ref, astModule)
    yield* Match.value(HashMap.has(walk.state.entityByRef, namespaceRef)).pipe(
      Match.when(true, () => Effect.void),
      Match.when(false, () =>
        Effect.die(invariantDefect(
          'Failed to get CollectorEntity for AstNamespaceImport with namespace name "' +
            record.localName + '"',
        ))),
      Match.exhaustive,
    )
    const zero: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(walk)
    return yield* Arr.reduce(
      Chunk.toReadonlyArray(exportInfo.exportedLocalEntities),
      zero,
      (accumulated, entry) =>
        Effect.gen(function*() {
          const current = yield* accumulated
          const nextState = yield* createCollectorEntity(
            ref,
            current.state,
            entry[1],
            Option.some(entry[0]),
            Option.some(namespaceRef),
          )
          return yield* enterEntity(ref, parser, { ...current, state: nextState }, entry[1])
        }),
    )
  })
