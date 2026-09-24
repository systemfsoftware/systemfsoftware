import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Order from 'effect/Order'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as ts from 'typescript'

import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import { type ExtractorMessageProperties, MessageLog } from '../../collector/message-log.js'
import { VisitorState } from '../../collector/VisitorState.js'
import { type ExtractorError, InternalInvariantError } from '../../errors/index.js'
import { ReleaseTag } from '../../model/index.js'
import { astDeclarationOfId, astSymbolOfId, nodeValueOf } from '../graph/analysis-graph.js'
import type { AnalysisGraph, AnalysisRef } from '../graph/analysis-graph.js'
import type { GraphAnalysis } from '../graph/analyze-graph.js'
import type { AstDeclaration } from '../graph/ast-declaration.js'
import { type AstEntityRef, AstEntityRefEquivalence, AstSymbolRef } from '../graph/ast-entity.js'
import type { AstNamespaceImportRef } from '../graph/ast-entity.js'
import { isExternalModule } from '../graph/ast-module.js'
import type { AstModule, AstModuleExportInfo } from '../graph/ast-module.js'
import type { AstNamespaceImport } from '../graph/ast-namespace-import.js'
import { astSymbolTable } from '../graph/ast-symbol-table.js'
import type { AstSymbol } from '../graph/ast-symbol.js'
import { fetchAstModuleExportInfo } from '../graph/export-analyzer.js'
import * as TypeScriptHelpers from '../TypeScriptHelpers.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import * as TypeScriptInternals from '../TypeScriptInternals.js'
import { ApiItemMetadata } from './api-item-metadata.js'
import { CollectorEntity } from './collector-entity.js'
import { CollectorEntityOrder, consumableOf, exportedOf, singleExportNameOf } from './collector-entity.js'
import { DeclarationMetadata } from './declaration-metadata.js'
import { fromParsedDocComment } from './effective-doc-comment.js'
import { findPackageDocComment, PackageDocComment } from './package-doc-comment.js'
import { SymbolMetadata } from './symbol-metadata.js'

const invariantDefect = (message: string): InternalInvariantError => new InternalInvariantError({ message })

export interface CollectedAnalysis {
  readonly entities: Chunk.Chunk<CollectorEntity>
  readonly entityByRef: HashMap.HashMap<AstEntityRef, CollectorEntity>
  readonly entityBySymbolId: HashMap.HashMap<SymbolId, CollectorEntity>
  readonly dtsTypeReferenceDirectives: Chunk.Chunk<string>
  readonly dtsLibReferenceDirectives: Chunk.Chunk<string>
  readonly starExportedExternalModulePaths: ReadonlyArray<string>
  readonly packageDocComment: Option.Option<PackageDocComment>
  readonly symbolMetadata: HashMap.HashMap<SymbolId, SymbolMetadata>
  readonly declarationMetadata: HashMap.HashMap<NodeId, DeclarationMetadata>
  readonly apiItemMetadata: HashMap.HashMap<NodeId, ApiItemMetadata>
  readonly messageLog: MessageLog
}

interface EntityDraft {
  readonly localName: string
  readonly nameForEmit: Option.Option<string>
  readonly exportedNames: Chunk.Chunk<string>
  readonly localExportNamesByParent: Chunk.Chunk<readonly [AstEntityRef, Chunk.Chunk<string>]>
}

interface MetadataState {
  readonly log: MessageLog
  readonly entityByRef: HashMap.HashMap<AstEntityRef, EntityDraft>
  readonly symbolMetadataDone: HashSet.HashSet<SymbolId>
  readonly symbolMetadata: HashMap.HashMap<SymbolId, SymbolMetadata>
  readonly declarationMetadata: HashMap.HashMap<NodeId, DeclarationMetadata>
  readonly apiItemMetadata: HashMap.HashMap<NodeId, ApiItemMetadata>
}

interface CollectState extends MetadataState {
  readonly entities: Chunk.Chunk<AstEntityRef>
  readonly entityBySymbolId: HashMap.HashMap<SymbolId, AstEntityRef>
  readonly dtsTypeReferenceDirectives: HashSet.HashSet<string>
  readonly dtsLibReferenceDirectives: HashSet.HashSet<string>
}

interface WalkState {
  readonly state: CollectState
  readonly seen: HashSet.HashSet<AstEntityRef>
}

interface ReleaseScan {
  readonly declared: ReleaseTag
  readonly extra: boolean
}

interface ModifierDraft {
  readonly declaredReleaseTag: ReleaseTag
  readonly isEventProperty: boolean
  readonly isOverride: boolean
  readonly isSealed: boolean
  readonly isVirtual: boolean
  readonly isPreapproved: boolean
}

interface EffectiveRelease {
  readonly state: CollectState
  readonly effectiveReleaseTag: ReleaseTag
  readonly releaseTagSameAsParent: boolean
}

interface ModifiersResolved {
  readonly state: CollectState
  readonly draft: ModifierDraft
}

interface UniqueNamesApplied {
  readonly state: CollectState
  readonly usedNames: HashSet.HashSet<string>
}

const emptyModifierDraft: ModifierDraft = {
  declaredReleaseTag: ReleaseTag.None,
  isEventProperty: false,
  isOverride: false,
  isSealed: false,
  isVirtual: false,
  isPreapproved: false,
}

const zeroScan: ReleaseScan = { declared: ReleaseTag.None, extra: false }

const preapprovedContainerKinds: HashSet.HashSet<ts.SyntaxKind> = HashSet.make(
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
)

const emptyDraft = (localName: string): EntityDraft => ({
  localName,
  nameForEmit: Option.none(),
  exportedNames: Chunk.empty(),
  localExportNamesByParent: Chunk.empty(),
})

const withEntityView = <S extends MetadataState>(
  state: S,
  entityRef: AstEntityRef,
  view: EntityDraft,
): S => ({ ...state, entityByRef: HashMap.set(state.entityByRef, entityRef, view) })

const viewsOf = (state: MetadataState) => (ref: AstEntityRef): Option.Option<EntityDraft> =>
  HashMap.get(state.entityByRef, ref)

const maxReleaseTag = (left: ReleaseTag, right: ReleaseTag): ReleaseTag =>
  Match.value(right > left).pipe(
    Match.when(true, () => right),
    Match.when(false, () => left),
    Match.exhaustive,
  )

const describeRef = (ref: AstEntityRef): string =>
  Match.value(ref).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => 'AstSymbolRef:'.concat(String(symbolRef.symbolId))),
    Match.tag('AstImportRef', (importRef) => 'AstImportRef:'.concat(importRef.key)),
    Match.tag(
      'AstNamespaceImportRef',
      (namespaceRef) => 'AstNamespaceImportRef:'.concat(String(namespaceRef.symbolId)),
    ),
    Match.exhaustive,
  )

const requireAstSymbol = (graph: AnalysisGraph, symbolId: SymbolId): Effect.Effect<AstSymbol, ExtractorError> =>
  Option.match(astSymbolOfId(graph, symbolId), {
    onSome: (astSymbol) => Effect.succeed(astSymbol),
    onNone: () => Effect.die(invariantDefect('Missing AstSymbol record for the symbol id ' + symbolId)),
  })

const requireAstDeclaration = (
  graph: AnalysisGraph,
  declarationId: NodeId,
): Effect.Effect<AstDeclaration, ExtractorError> =>
  Option.match(astDeclarationOfId(graph, declarationId), {
    onSome: (astDeclaration) => Effect.succeed(astDeclaration),
    onNone: () => Effect.die(invariantDefect('Missing AstDeclaration record for the declaration id ' + declarationId)),
  })

const requireNode = (graph: AnalysisGraph, declarationId: NodeId): Effect.Effect<ts.Node, ExtractorError> =>
  Option.match(nodeValueOf(graph, declarationId), {
    onSome: (node) => Effect.succeed(node),
    onNone: () => Effect.die(invariantDefect('Missing ts.Node for the declaration id ' + declarationId)),
  })

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

const requireEntityDraft = (
  state: CollectState,
  entityRef: AstEntityRef,
): Effect.Effect<EntityDraft, ExtractorError> =>
  Option.match(HashMap.get(state.entityByRef, entityRef), {
    onSome: (view) => Effect.succeed(view),
    onNone: () => Effect.die(invariantDefect('Missing CollectorEntity draft for ' + describeRef(entityRef))),
  })

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

const entitySymbolIdOf = (entityRef: AstEntityRef): Option.Option<SymbolId> =>
  Match.value(entityRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => Option.some(symbolRef.symbolId)),
    Match.tag('AstImportRef', () => Option.none<SymbolId>()),
    Match.tag('AstNamespaceImportRef', (namespaceRef) => Option.some(namespaceRef.symbolId)),
    Match.exhaustive,
  )

const addExportName = (view: EntityDraft, exportName: string): EntityDraft =>
  Match.value(Chunk.toReadonlyArray(view.exportedNames).includes(exportName)).pipe(
    Match.when(true, () => view),
    Match.when(false, () => ({ ...view, exportedNames: Chunk.append(view.exportedNames, exportName) })),
    Match.exhaustive,
  )

const addLocalExportName = (view: EntityDraft, exportName: string, parentRef: AstEntityRef): EntityDraft => {
  const entries = Chunk.toReadonlyArray(view.localExportNamesByParent)
  return Option.match(Arr.findFirstIndex(entries, (entry) => AstEntityRefEquivalence(entry[0], parentRef)), {
    onSome: (index) => ({
      ...view,
      localExportNamesByParent: Chunk.fromIterable(
        Arr.map(entries, (entry, entryIndex) =>
          Match.value(entryIndex === index).pipe(
            Match.when(true, () => entryWithAppend(entry, exportName)),
            Match.when(false, () => entry),
            Match.exhaustive,
          )),
      ),
    }),
    onNone: () => ({
      ...view,
      localExportNamesByParent: Chunk.append(view.localExportNamesByParent, entryWithNames(parentRef, exportName)),
    }),
  })
}

const entryWithAppend = (
  entry: readonly [AstEntityRef, Chunk.Chunk<string>],
  exportName: string,
): readonly [AstEntityRef, Chunk.Chunk<string>] => [entry[0], Chunk.append(entry[1], exportName)]

const entryWithNames = (
  parentRef: AstEntityRef,
  exportName: string,
): readonly [AstEntityRef, Chunk.Chunk<string>] => [parentRef, Chunk.of(exportName)]

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

const collectFromSourceFiles = (
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
  ).state

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

const withExportName = (
  state: CollectState,
  view: EntityDraft,
  entityRef: AstEntityRef,
  exportName: Option.Option<string>,
  parentRef: Option.Option<AstEntityRef>,
): CollectState =>
  Option.match(exportName, {
    onNone: () => state,
    onSome: (name) =>
      Option.match(parentRef, {
        onNone: () => withEntityView(state, entityRef, addExportName(view, name)),
        onSome: (parent) => withEntityView(state, entityRef, addLocalExportName(view, name, parent)),
      }),
  })

const createCollectorEntity = (
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
    }))

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

const enterEntity = (
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
  )

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

const scanReleaseTagOf = (scan: ReleaseScan, present: boolean, tag: ReleaseTag): ReleaseScan =>
  Match.value(present).pipe(
    Match.when(false, () => scan),
    Match.when(true, () =>
      Match.value(scan.declared === ReleaseTag.None).pipe(
        Match.when(true, () => ({ declared: tag, extra: scan.extra })),
        Match.when(false, () => ({ declared: scan.declared, extra: true })),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const releaseScanOf = (modifierTagSet: tsdoc.StandardModifierTagSet): ReleaseScan => {
  const checks: ReadonlyArray<readonly [boolean, ReleaseTag]> = [
    [modifierTagSet.isPublic(), ReleaseTag.Public],
    [modifierTagSet.isBeta(), ReleaseTag.Beta],
    [modifierTagSet.isAlpha(), ReleaseTag.Alpha],
    [modifierTagSet.isInternal(), ReleaseTag.Internal],
  ]
  return Arr.reduce(checks, zeroScan, (scan, check) => scanReleaseTagOf(scan, check[0], check[1]))
}

const issueForDeclaration = (
  state: CollectState,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  declarationId: NodeId,
  properties?: ExtractorMessageProperties,
): CollectState =>
  Option.match(nodeValueOf(graph, declarationId), {
    onNone: () => state,
    onSome: (node) => ({
      ...state,
      log: MessageLog.addAnalyzerIssue(
        state.log,
        messageId,
        messageText,
        node.getSourceFile(),
        node.getStart(),
        Option.some(declarationId),
        properties,
      ),
    }),
  })

const issueForSymbol = (
  state: CollectState,
  graph: AnalysisGraph,
  messageId: string,
  messageText: string,
  symbolId: SymbolId,
  properties?: ExtractorMessageProperties,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.map(
    requireAstSymbol(graph, symbolId),
    (astSymbol) =>
      Option.match(Arr.head(Chunk.toReadonlyArray(astSymbol.declarationIds)), {
        onNone: () => state,
        onSome: (firstDeclarationId) =>
          issueForDeclaration(state, graph, messageId, messageText, firstDeclarationId, properties),
      }),
  )

const nodeForCommentOf = (node: ts.Node): ts.Node =>
  Match.value(node).pipe(
    Match.when(ts.isVariableDeclaration, (declaration) =>
      Option.getOrElse(
        Option.map(
          Option.filter(
            Option.fromUndefinedOr(
              TypeScriptHelpers.findFirstParent<ts.VariableStatement>(declaration, ts.SyntaxKind.VariableStatement),
            ),
            (statement) => statement.declarationList.declarations.length === 1,
          ),
          (statement) => statement,
        ),
        () => node,
      )),
    Match.orElse(() => node),
  )

const parsedWithoutContext = (log: MessageLog): readonly [MessageLog, Option.Option<tsdoc.ParserContext>] => [
  log,
  Option.none(),
]

const parsedWithContext = (
  log: MessageLog,
  parserContext: tsdoc.ParserContext,
  declarationId: NodeId,
  sourceFile: ts.SourceFile,
): readonly [MessageLog, Option.Option<tsdoc.ParserContext>] => [
  MessageLog.addTsdocMessages(log, parserContext, sourceFile, Option.some(declarationId)),
  Option.some(parserContext),
]

const parseTsdocForDeclaration = (
  parser: tsdoc.TSDocParser,
  log: MessageLog,
  graph: AnalysisGraph,
  declarationId: NodeId,
): Effect.Effect<readonly [MessageLog, Option.Option<tsdoc.ParserContext>], ExtractorError> =>
  Effect.map(requireNode(graph, declarationId), (node) => {
    const nodeForComment = nodeForCommentOf(node)
    const sourceFile = nodeForComment.getSourceFile()
    const ranges = Option.getOrElse(
      Option.fromNullishOr(TypeScriptInternals.getJSDocCommentRanges(nodeForComment, sourceFile.text)),
      () => [],
    )
    return Option.match(Arr.last(ranges), {
      onNone: () => parsedWithoutContext(log),
      onSome: (range) => {
        const parserContext = parser.parseRange(
          tsdoc.TextRange.fromStringRange(sourceFile.text, range.pos, range.end),
        )
        return parsedWithContext(log, parserContext, declarationId, sourceFile)
      },
    })
  })

const requireDeclarationMetadata = (
  state: MetadataState,
  declarationId: NodeId,
): Effect.Effect<DeclarationMetadata, ExtractorError> =>
  Option.match(HashMap.get(state.declarationMetadata, declarationId), {
    onSome: (metadata) => Effect.succeed(metadata),
    onNone: () => Effect.die(invariantDefect('Missing DeclarationMetadata for the declaration id ' + declarationId)),
  })

const requireApiItemMetadata = (
  state: MetadataState,
  declarationId: NodeId,
): Effect.Effect<ApiItemMetadata, ExtractorError> =>
  Option.match(HashMap.get(state.apiItemMetadata, declarationId), {
    onSome: (metadata) => Effect.succeed(metadata),
    onNone: () => Effect.die(invariantDefect('Missing ApiItemMetadata for the declaration id ' + declarationId)),
  })

const setterDeclarationIdsOf = (graph: AnalysisGraph, astSymbol: AstSymbol): ReadonlyArray<NodeId> =>
  Arr.filter(
    Chunk.toReadonlyArray(astSymbol.declarationIds),
    (declarationId) =>
      Option.exists(nodeValueOf(graph, declarationId), (node) => node.kind === ts.SyntaxKind.SetAccessor),
  )

const getterDeclarationIdsOf = (graph: AnalysisGraph, astSymbol: AstSymbol): ReadonlyArray<NodeId> =>
  Arr.filter(
    Chunk.toReadonlyArray(astSymbol.declarationIds),
    (declarationId) =>
      Option.exists(nodeValueOf(graph, declarationId), (node) => node.kind === ts.SyntaxKind.GetAccessor),
  )

const sameSymbolDeclarations = (
  mainDeclaration: AstDeclaration,
  ancillaryDeclaration: AstDeclaration,
): boolean => mainDeclaration.astSymbolId === ancillaryDeclaration.astSymbolId

const bothFreshDeclarations = (
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): boolean => !mainMetadata.isAncillary && !ancillaryMetadata.isAncillary

const apiItemsNotBuilt = (
  state: CollectState,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
): boolean =>
  !HashMap.has(state.apiItemMetadata, mainDeclarationId) &&
  !HashMap.has(state.apiItemMetadata, ancillaryDeclarationId)

const ancillaryEligible = (
  state: CollectState,
  graph: AnalysisGraph,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): Effect.Effect<boolean, ExtractorError> => {
  const fresh = bothFreshDeclarations(mainMetadata, ancillaryMetadata) &&
    apiItemsNotBuilt(state, mainDeclarationId, ancillaryDeclarationId)
  return Effect.map(
    Effect.flatMap(
      requireAstDeclaration(graph, mainDeclarationId),
      (mainDeclaration) =>
        Effect.map(
          requireAstDeclaration(graph, ancillaryDeclarationId),
          (ancillaryDeclaration) => sameSymbolDeclarations(mainDeclaration, ancillaryDeclaration),
        ),
    ),
    (sameSymbol) => sameSymbol && fresh,
  )
}

const wireAncillaryPair = (
  state: CollectState,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
  mainMetadata: DeclarationMetadata,
  ancillaryMetadata: DeclarationMetadata,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.succeed({
    ...state,
    declarationMetadata: HashMap.set(
      HashMap.set(
        state.declarationMetadata,
        mainDeclarationId,
        new DeclarationMetadata({
          tsdocParserContext: mainMetadata.tsdocParserContext,
          isAncillary: mainMetadata.isAncillary,
          ancillaryDeclarationIds: Chunk.append(mainMetadata.ancillaryDeclarationIds, ancillaryDeclarationId),
        }),
      ),
      ancillaryDeclarationId,
      new DeclarationMetadata({
        tsdocParserContext: ancillaryMetadata.tsdocParserContext,
        isAncillary: true,
        ancillaryDeclarationIds: ancillaryMetadata.ancillaryDeclarationIds,
      }),
    ),
  })

const addAncillaryDeclaration = (
  state: CollectState,
  graph: AnalysisGraph,
  mainDeclarationId: NodeId,
  ancillaryDeclarationId: NodeId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.gen(function*() {
    const mainMetadata = yield* requireDeclarationMetadata(state, mainDeclarationId)
    const ancillaryMetadata = yield* requireDeclarationMetadata(state, ancillaryDeclarationId)
    const alreadyAdded = Chunk.toReadonlyArray(mainMetadata.ancillaryDeclarationIds).includes(ancillaryDeclarationId)
    const eligible = yield* ancillaryEligible(
      state,
      graph,
      mainDeclarationId,
      ancillaryDeclarationId,
      mainMetadata,
      ancillaryMetadata,
    )
    return yield* Match.value(alreadyAdded).pipe(
      Match.when(true, () => Effect.succeed(state)),
      Match.when(false, () =>
        Match.value(eligible).pipe(
          Match.when(
            true,
            () => wireAncillaryPair(state, mainDeclarationId, ancillaryDeclarationId, mainMetadata, ancillaryMetadata),
          ),
          Match.when(false, () =>
            Effect.die(invariantDefect(
              'Invalid call to _addAncillaryDeclaration() because the declarations are not eligible',
            ))),
          Match.exhaustive,
        )),
      Match.exhaustive,
    )
  })

const wireAncillaryGetters = (
  state: CollectState,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
  setterId: NodeId,
): Effect.Effect<CollectState, ExtractorError> => {
  const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
  return Arr.reduce(
    getterDeclarationIdsOf(graph, astSymbol),
    zero,
    (accumulated, getterId) =>
      Effect.flatMap(accumulated, (current) => addAncillaryDeclaration(current, graph, getterId, setterId)),
  )
}

const detectAncillaryForSetter = (
  state: CollectState,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
  setterId: NodeId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(
    requireAstDeclaration(graph, setterId),
    (setterDeclaration) =>
      Effect.flatMap(requireAstSymbol(graph, setterDeclaration.astSymbolId), (setterSymbol) => {
        const withGetter = Match.value(getterDeclarationIdsOf(graph, astSymbol).length > 0).pipe(
          Match.when(true, () => wireAncillaryGetters(state, graph, astSymbol, setterId)),
          Match.when(false, () =>
            Effect.succeed(issueForDeclaration(
              state,
              graph,
              ExtractorMessageId.MissingGetter,
              'The property "'.concat(setterSymbol.localName, '" has a setter but no getter.'),
              setterId,
              undefined,
            ))),
          Match.exhaustive,
        )
        return withGetter
      }),
  )

const detectAncillaryDeclarations = (
  state: CollectState,
  graph: AnalysisGraph,
  astSymbol: AstSymbol,
): Effect.Effect<CollectState, ExtractorError> => {
  const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
  return Arr.reduce(
    setterDeclarationIdsOf(graph, astSymbol),
    zero,
    (accumulated, setterId) =>
      Effect.flatMap(accumulated, (current) => detectAncillaryForSetter(current, graph, astSymbol, setterId)),
  )
}

const calculateDeclarationMetadataForDeclarations = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  symbolId: SymbolId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) => {
      const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
      return Effect.flatMap(
        Arr.reduce(
          Chunk.toReadonlyArray(astSymbol.declarationIds),
          zero,
          (accumulated, declarationId) =>
            Effect.flatMap(accumulated, (current) =>
              Effect.map(parseTsdocForDeclaration(parser, current.log, graph, declarationId), (parsed) => ({
                ...current,
                log: parsed[0],
                declarationMetadata: HashMap.set(
                  current.declarationMetadata,
                  declarationId,
                  new DeclarationMetadata({
                    tsdocParserContext: parsed[1],
                    isAncillary: false,
                    ancillaryDeclarationIds: Chunk.empty(),
                  }),
                ),
              }))),
        ),
        (parsedState) =>
          detectAncillaryDeclarations(parsedState, graph, astSymbol),
      )
    }))

const preapprovedForContainer = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  declaredInternal: boolean,
  draft: ModifierDraft,
): Effect.Effect<ModifiersResolved, ExtractorError> =>
  Match.value(declaredInternal).pipe(
    Match.when(true, () => {
      const preapproved: ModifiersResolved = { state, draft: { ...draft, isPreapproved: true } }
      return Effect.succeed<ModifiersResolved>(preapproved)
    }),
    Match.when(false, () =>
      Effect.map(
        issueForSymbol(
          state,
          graph,
          ExtractorMessageId.PreapprovedBadReleaseTag,
          'The @preapproved tag cannot be applied to "'.concat(localName, '"') +
            ' without an @internal release tag',
          astDeclaration.astSymbolId,
          undefined,
        ),
        (nextState) => resolveOf(nextState, draft),
      )),
    Match.exhaustive,
  )

const preapprovedUnsupported = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  draft: ModifierDraft,
): Effect.Effect<ModifiersResolved, ExtractorError> =>
  Effect.succeed(
    resolveOf(
      issueForDeclaration(
        state,
        graph,
        ExtractorMessageId.PreapprovedUnsupportedType,
        'The @preapproved tag cannot be applied to "'.concat(localName, '"') +
          ' because it is not a supported declaration type',
        astDeclaration.declarationId,
        undefined,
      ),
      draft,
    ),
  )

const applyPreapproved = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  localName: string,
  declaredInternal: boolean,
  draft: ModifierDraft,
): Effect.Effect<ModifiersResolved, ExtractorError> =>
  Effect.flatMap(
    requireNode(graph, astDeclaration.declarationId),
    (node) =>
      Match.value(HashSet.has(preapprovedContainerKinds, node.kind)).pipe(
        Match.when(
          true,
          () => preapprovedForContainer(state, graph, astDeclaration, localName, declaredInternal, draft),
        ),
        Match.when(false, () => preapprovedUnsupported(state, graph, astDeclaration, localName, draft)),
        Match.exhaustive,
      ),
  )

const resolveOf = (state: CollectState, draft: ModifierDraft): ModifiersResolved => ({ state, draft })

const scanModifiers = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  parserContext: tsdoc.ParserContext,
): Effect.Effect<ModifiersResolved, ExtractorError> => {
  const modifierTagSet = parserContext.docComment.modifierTagSet
  const scan = releaseScanOf(modifierTagSet)
  const draft: ModifierDraft = {
    declaredReleaseTag: scan.declared,
    isEventProperty: modifierTagSet.isEventProperty(),
    isOverride: modifierTagSet.isOverride(),
    isSealed: modifierTagSet.isSealed(),
    isVirtual: modifierTagSet.isVirtual(),
    isPreapproved: false,
  }
  return Effect.flatMap(requireAstSymbol(graph, astDeclaration.astSymbolId), (astSymbol) =>
    Effect.flatMap(
      Match.value(scan.extra && !astSymbol.isExternal).pipe(
        Match.when(true, () =>
          Effect.succeed(
            issueForDeclaration(
              state,
              graph,
              ExtractorMessageId.ExtraReleaseTag,
              'The doc comment should not contain more than one release tag',
              astDeclaration.declarationId,
              undefined,
            ),
          )),
        Match.when(false, () => Effect.succeed(state)),
        Match.exhaustive,
      ),
      (withExtraTags) => {
        const preapprovedTag = graph.tsdocConfiguration.tryGetTagDefinition('@preapproved')
        return Match.value(
          Option.exists(Option.fromNullishOr(preapprovedTag), (tagDefinition) => modifierTagSet.hasTag(tagDefinition)),
        ).pipe(
          Match.when(true, () =>
            applyPreapproved(
              withExtraTags,
              graph,
              astDeclaration,
              astSymbol.localName,
              scan.declared === ReleaseTag.Internal,
              draft,
            )),
          Match.when(false, () => {
            const resolved: ModifiersResolved = { state: withExtraTags, draft }
            return Effect.succeed(resolved)
          }),
          Match.exhaustive,
        )
      },
    ))
}

const fetchApiItemMetadataInto = (
  graph: AnalysisGraph,
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  declarationId: NodeId,
): Effect.Effect<readonly [CollectState, ApiItemMetadata], ExtractorError> =>
  Match.value(HashMap.has(state.apiItemMetadata, declarationId)).pipe(
    Match.when(true, () =>
      Effect.map(requireApiItemMetadata(state, declarationId), (metadata) => {
        const found: readonly [CollectState, ApiItemMetadata] = [state, metadata]
        return found
      })),
    Match.when(
      false,
      () =>
        Effect.flatMap(requireAstDeclaration(graph, declarationId), (astDeclaration) =>
          Effect.flatMap(
            fetchSymbolMetadataInto(ref, parser, state, astDeclaration.astSymbolId),
            (nextState) =>
              Effect.map(requireApiItemMetadata(nextState, declarationId), (metadata) => {
                const found: readonly [CollectState, ApiItemMetadata] = [nextState, metadata]
                return found
              }),
          )),
    ),
    Match.exhaustive,
  )

const missingReleaseTagGate = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.gen(function*() {
    const astSymbol = yield* requireAstSymbol(graph, astDeclaration.astSymbolId)
    const rootSymbol = yield* requireAstSymbol(graph, astSymbol.rootAstSymbolId)
    const rootRef: AstEntityRef = new AstSymbolRef({ symbolId: astSymbol.rootAstSymbolId })
    const entity = HashMap.get(state.entityByRef, rootRef)
    const consumable = consumableOf(viewsOf(state), rootRef)
    const includeForgotten =
      Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.apiReport.includeForgottenExports), () => false) ||
      Option.getOrElse(Option.fromNullishOr(graph.extractorConfig.docModel.includeForgottenExports), () => false)
    const gated = Match.value(Option.isSome(entity)).pipe(
      Match.when(false, () => false),
      Match.when(true, () => consumable || includeForgotten),
      Match.exhaustive,
    )
    const emitted = Match.value(gated).pipe(
      Match.when(false, () => false),
      Match.when(true, () => rootSymbol.localName !== '_default'),
      Match.exhaustive,
    )
    const entityLocalName = Option.match(entity, {
      onNone: () => '',
      onSome: (view) => view.localName,
    })
    return yield* Match.value(emitted).pipe(
      Match.when(false, () => Effect.succeed(state)),
      Match.when(true, () =>
        issueForSymbol(
          state,
          graph,
          ExtractorMessageId.MissingReleaseTag,
          '"'.concat(entityLocalName, '" is part of the package\'s API, but it is missing ') +
            'a release tag (@alpha, @beta, @public, or @internal)',
          astDeclaration.astSymbolId,
          undefined,
        )),
      Match.exhaustive,
    )
  })

const mainApiItemPhase = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  declarationMetadata: DeclarationMetadata,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.gen(function*() {
    const scanned: ModifiersResolved = yield* Option.match(declarationMetadata.tsdocParserContext, {
      onSome: (parserContext) => scanModifiers(state, graph, astDeclaration, parserContext),
      onNone: () => {
        const unresolved: ModifiersResolved = { state, draft: emptyModifierDraft }
        return Effect.succeed(unresolved)
      },
    })
    const effective: EffectiveRelease = yield* Option.match(astDeclaration.parentDeclarationId, {
      onSome: (parentDeclarationId) =>
        Effect.map(fetchApiItemMetadataInto(graph, ref, parser, scanned.state, parentDeclarationId), (fetched) => {
          const effectiveReleaseTag = Match.value(scanned.draft.declaredReleaseTag === ReleaseTag.None).pipe(
            Match.when(true, () => fetched[1].effectiveReleaseTag),
            Match.when(false, () => scanned.draft.declaredReleaseTag),
            Match.exhaustive,
          )
          return {
            state: fetched[0],
            effectiveReleaseTag,
            releaseTagSameAsParent: fetched[1].effectiveReleaseTag === effectiveReleaseTag,
          }
        }),
      onNone: () =>
        Effect.succeed<EffectiveRelease>({
          state: scanned.state,
          effectiveReleaseTag: scanned.draft.declaredReleaseTag,
          releaseTagSameAsParent: false,
        }),
    })
    const isExternalSymbol = Option.getOrElse(
      Option.map(astSymbolOfId(graph, astDeclaration.astSymbolId), (astSymbol) => astSymbol.isExternal),
      () => false,
    )
    const missingTagState: CollectState = yield* Match.value(
      effective.effectiveReleaseTag === ReleaseTag.None,
    ).pipe(
      Match.when(true, () =>
        Match.value(!isExternalSymbol).pipe(
          Match.when(true, () => missingReleaseTagGate(effective.state, graph, astDeclaration)),
          Match.when(false, () => Effect.succeed(effective.state)),
          Match.exhaustive,
        )),
      Match.when(false, () => Effect.succeed(effective.state)),
      Match.exhaustive,
    )
    const publicizedEffectiveReleaseTag = Match.value(effective.effectiveReleaseTag === ReleaseTag.None).pipe(
      Match.when(true, () => ReleaseTag.Public),
      Match.when(false, () => effective.effectiveReleaseTag),
      Match.exhaustive,
    )
    const apiItemMetadata = new ApiItemMetadata({
      declaredReleaseTag: scanned.draft.declaredReleaseTag,
      effectiveReleaseTag: publicizedEffectiveReleaseTag,
      releaseTagSameAsParent: effective.releaseTagSameAsParent,
      isEventProperty: scanned.draft.isEventProperty,
      isOverride: scanned.draft.isOverride,
      isSealed: scanned.draft.isSealed,
      isVirtual: scanned.draft.isVirtual,
      isPreapproved: scanned.draft.isPreapproved,
      deprecated: deprecatedFlagOf(declarationMetadata.tsdocParserContext),
      customBlockTagNames: customBlockTagNamesOf(declarationMetadata.tsdocParserContext),
      modifierTagNames: modifierTagNamesOf(declarationMetadata.tsdocParserContext),
      tsdocComment: Option.map(declarationMetadata.tsdocParserContext, (context) =>
        fromParsedDocComment(context.docComment)),
      undocumented: true,
      docCommentEnhancerVisitorState: VisitorState.Unvisited,
    })
    return {
      ...missingTagState,
      apiItemMetadata: Arr.reduce(
        Chunk.toReadonlyArray(declarationMetadata.ancillaryDeclarationIds),
        HashMap.set(missingTagState.apiItemMetadata, astDeclaration.declarationId, apiItemMetadata),
        (map, ancillaryId) =>
          HashMap.set(map, ancillaryId, apiItemMetadata),
      ),
    }
  })

const ancillaryApiItemPhase = (
  state: CollectState,
  graph: AnalysisGraph,
  astDeclaration: AstDeclaration,
  declarationMetadata: DeclarationMetadata,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.map(
    requireNode(graph, astDeclaration.declarationId),
    (node) =>
      Match.value(node.kind === ts.SyntaxKind.SetAccessor && Option.isSome(declarationMetadata.tsdocParserContext))
        .pipe(
          Match.when(true, () => {
            const setterSymbolLocalName = Option.getOrElse(
              Option.flatMap(astSymbolOfId(graph, astDeclaration.astSymbolId), (astSymbol) =>
                Option.some(astSymbol.localName)),
              () =>
                '',
            )
            return issueForDeclaration(
              state,
              graph,
              ExtractorMessageId.SetterWithDocs,
              'The doc comment for the property "'.concat(setterSymbolLocalName, '"') +
                ' must appear on the getter, not the setter.',
              astDeclaration.declarationId,
              undefined,
            )
          }),
          Match.when(false, () => state),
          Match.exhaustive,
        ),
  )

const calculateApiItemMetadata = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  declarationId: NodeId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Effect.flatMap(requireAstDeclaration(graph, declarationId), (astDeclaration) =>
        Effect.flatMap(requireDeclarationMetadata(state, declarationId), (declarationMetadata) =>
          Match.value(declarationMetadata.isAncillary).pipe(
            Match.when(true, () =>
              ancillaryApiItemPhase(state, graph, astDeclaration, declarationMetadata)),
            Match.when(false, () =>
              mainApiItemPhase(ref, parser, state, graph, astDeclaration, declarationMetadata)),
            Match.exhaustive,
          ))),
  )

const calculateApiItemMetadataForDeclarations = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  symbolId: SymbolId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) => {
      const zero: Effect.Effect<CollectState, ExtractorError> = Effect.succeed(state)
      return Arr.reduce(
        Chunk.toReadonlyArray(astSymbol.declarationIds),
        zero,
        (accumulated, declarationId) =>
          Effect.flatMap(accumulated, (current) => calculateApiItemMetadata(ref, parser, current, declarationId)),
      )
    }))

const storeSymbolMetadata = (
  graph: AnalysisGraph,
  state: CollectState,
  symbolId: SymbolId,
): Effect.Effect<CollectState, ExtractorError> =>
  Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) => {
    const zero: Effect.Effect<ReleaseTag, ExtractorError> = Effect.succeed(ReleaseTag.None)
    return Effect.map(
      Arr.reduce(
        Chunk.toReadonlyArray(astSymbol.declarationIds),
        zero,
        (accumulated, declarationId) =>
          Effect.flatMap(accumulated, (max) =>
            Effect.map(requireApiItemMetadata(state, declarationId), (metadata) =>
              maxReleaseTag(max, metadata.effectiveReleaseTag))),
      ),
      (maxEffectiveReleaseTag) => ({
        ...state,
        symbolMetadata: HashMap.set(
          state.symbolMetadata,
          symbolId,
          new SymbolMetadata({ maxEffectiveReleaseTag }),
        ),
        symbolMetadataDone: HashSet.add(state.symbolMetadataDone, symbolId),
      }),
    )
  })

const fetchSymbolMetadataInto = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  state: CollectState,
  symbolId: SymbolId,
): Effect.Effect<CollectState, ExtractorError> =>
  Match.value(HashSet.has(state.symbolMetadataDone, symbolId)).pipe(
    Match.when(true, () => Effect.succeed(state)),
    Match.when(false, () =>
      Effect.flatMap(Ref.get(ref), (graph) =>
        Effect.flatMap(requireAstSymbol(graph, symbolId), (astSymbol) =>
          Effect.gen(function*() {
            const withParent = yield* Option.match(astSymbol.parentAstSymbolId, {
              onSome: (parentSymbolId) =>
                fetchSymbolMetadataInto(ref, parser, state, parentSymbolId),
              onNone: () =>
                Effect.succeed(state),
            })
            const withDeclarations = yield* calculateDeclarationMetadataForDeclarations(
              ref,
              parser,
              withParent,
              symbolId,
            )
            const withApiItems = yield* calculateApiItemMetadataForDeclarations(ref, parser, withDeclarations, symbolId)
            const nextGraph = yield* Ref.get(ref)
            return yield* storeSymbolMetadata(nextGraph, withApiItems, symbolId)
          })))),
    Match.exhaustive,
  )

const idealNameForEmitOf = (view: EntityDraft): string =>
  firstSegmentOf(
    Option.getOrElse(
      Option.filter(singleExportNameOf(view), (name) => name !== 'default'),
      () => view.localName,
    ),
  )

const firstSegmentOf = (name: string): string =>
  Match.value(name.includes('.')).pipe(
    Match.when(true, () => Option.getOrElse(Arr.head(name.split('.')), () => name)),
    Match.when(false, () => name),
    Match.exhaustive,
  )

const isTakenName = (candidate: string, usedNames: HashSet.HashSet<string>): boolean =>
  candidate === 'default' || HashSet.has(usedNames, candidate)

const isReservedName = (
  candidate: string,
  usedNames: HashSet.HashSet<string>,
  hasGlobalName: (name: string) => boolean,
): boolean => isTakenName(candidate, usedNames) || hasGlobalName(candidate)

const candidateNameOf = (ideal: string, suffix: number): string =>
  Match.value(suffix === 1).pipe(
    Match.when(true, () => ideal),
    Match.when(false, () => ideal.concat('_').concat(String(suffix))),
    Match.exhaustive,
  )

const uniqueNameOf = (
  ideal: string,
  suffix: number,
  usedNames: HashSet.HashSet<string>,
  hasGlobalName: (name: string) => boolean,
): string =>
  Match.value(isReservedName(candidateNameOf(ideal, suffix), usedNames, hasGlobalName)).pipe(
    Match.when(true, () => uniqueNameOf(ideal, suffix + 1, usedNames, hasGlobalName)),
    Match.when(false, () => candidateNameOf(ideal, suffix)),
    Match.exhaustive,
  )

const assignNameForEmit = (
  graph: AnalysisGraph,
  state: CollectState,
  usedNames: HashSet.HashSet<string>,
  entityRef: AstEntityRef,
): Effect.Effect<UniqueNamesApplied, ExtractorError> =>
  Effect.flatMap(requireEntityDraft(state, entityRef), (view) => {
    const hasGlobalName = (name: string): boolean => graph.globalVariableAnalyzer.hasGlobalName(name)
    const ideal = idealNameForEmitOf(view)
    const eligible = Match.value(Chunk.toReadonlyArray(view.exportedNames).includes(ideal)).pipe(
      Match.when(true, () => !hasGlobalName(ideal) && ideal !== 'default'),
      Match.when(false, () => false),
      Match.exhaustive,
    )
    return Match.value(eligible).pipe(
      Match.when(true, () => {
        const applied: UniqueNamesApplied = {
          state: withEntityView(state, entityRef, { ...view, nameForEmit: Option.some(ideal) }),
          usedNames,
        }
        return Effect.succeed(applied)
      }),
      Match.when(false, () => {
        const nameForEmit = uniqueNameOf(ideal, 1, usedNames, hasGlobalName)
        const applied: UniqueNamesApplied = {
          state: withEntityView(state, entityRef, { ...view, nameForEmit: Option.some(nameForEmit) }),
          usedNames: HashSet.add(usedNames, nameForEmit),
        }
        return Effect.succeed(applied)
      }),
      Match.exhaustive,
    )
  })

const collectExportName = (
  usedNames: HashSet.HashSet<string>,
  exportName: string,
): Effect.Effect<HashSet.HashSet<string>, ExtractorError> =>
  Match.value(HashSet.has(usedNames, exportName)).pipe(
    Match.when(true, () =>
      Effect.die(invariantDefect('A package cannot have two exports with the name "'.concat(exportName, '"')))),
    Match.when(false, () =>
      Effect.succeed(HashSet.add(usedNames, exportName))),
    Match.exhaustive,
  )

const makeUniqueNames = (
  graph: AnalysisGraph,
  state: CollectState,
): Effect.Effect<CollectState, ExtractorError> => {
  const zeroNames: Effect.Effect<HashSet.HashSet<string>, ExtractorError> = Effect.succeed(HashSet.empty())
  return Effect.flatMap(
    Arr.reduce(
      Chunk.toReadonlyArray(state.entities),
      zeroNames,
      (accumulated, entityRef) =>
        Effect.flatMap(accumulated, (usedNames) =>
          Effect.flatMap(requireEntityDraft(state, entityRef), (view) => {
            const zeroUsed: Effect.Effect<HashSet.HashSet<string>, ExtractorError> = Effect.succeed(usedNames)
            return Arr.reduce(
              Chunk.toReadonlyArray(view.exportedNames),
              zeroUsed,
              (accumulatedNames, exportName) =>
                Effect.flatMap(accumulatedNames, (current) => collectExportName(current, exportName)),
            )
          })),
    ),
    (usedNames) => {
      const zeroState: Effect.Effect<UniqueNamesApplied, ExtractorError> = Effect.succeed({ state, usedNames })
      return Effect.map(
        Arr.reduce(
          Chunk.toReadonlyArray(state.entities),
          zeroState,
          (accumulated, entityRef) =>
            Effect.flatMap(
              accumulated,
              (current) => assignNameForEmit(graph, current.state, current.usedNames, entityRef),
            ),
        ),
        (named) => named.state,
      )
    },
  )
}

const nonExternalSourceFilesOf = (
  graph: AnalysisGraph,
  exportInfo: AstModuleExportInfo,
): ReadonlyArray<ts.SourceFile> => {
  const zero: { readonly files: ReadonlyArray<ts.SourceFile>; readonly seen: HashSet.HashSet<string> } = {
    files: [],
    seen: HashSet.empty(),
  }
  return Arr.reduce(
    Chunk.toReadonlyArray(exportInfo.visitedAstModules),
    zero,
    (accumulated, moduleSymbolId) =>
      Option.match(HashMap.get(graph.modules, moduleSymbolId), {
        onNone: () => accumulated,
        onSome: (astModule) =>
          Match.value(astModule.pipe(isExternalModule)).pipe(
            Match.when(true, () => accumulated),
            Match.when(false, () =>
              Option.match(HashMap.get(graph.declarationValues, astModule.sourceFileId), {
                onNone: () => accumulated,
                onSome: (node) =>
                  Option.match(Option.filter(Option.some(node), ts.isSourceFile), {
                    onNone: () => accumulated,
                    onSome: (sourceFile) =>
                      Match.value(HashSet.has(accumulated.seen, sourceFile.fileName)).pipe(
                        Match.when(true, () => accumulated),
                        Match.when(false, () => ({
                          files: [...accumulated.files, sourceFile],
                          seen: HashSet.add(accumulated.seen, sourceFile.fileName),
                        })),
                        Match.exhaustive,
                      ),
                  }),
              })),
            Match.exhaustive,
          ),
      }),
  ).files
}

const sortStrings = (values: HashSet.HashSet<string>): Chunk.Chunk<string> =>
  Chunk.fromIterable(Arr.sort(Chunk.toReadonlyArray(Chunk.fromIterable(values)), Order.String))

const deprecatedFlagOf = (parserContext: Option.Option<tsdoc.ParserContext>): boolean =>
  Option.exists(parserContext, (context) => context.docComment.deprecatedBlock !== undefined)

const customBlockTagNamesOf = (parserContext: Option.Option<tsdoc.ParserContext>): Chunk.Chunk<string> => {
  const noBlocks: ReadonlyArray<string> = []
  return Chunk.fromIterable(Option.match(parserContext, {
    onSome: (context) => Arr.map(context.docComment.customBlocks, (block) => block.blockTag.tagName),
    onNone: () => noBlocks,
  }))
}

const modifierTagNamesOf = (parserContext: Option.Option<tsdoc.ParserContext>): Chunk.Chunk<string> => {
  const noTags: ReadonlyArray<string> = []
  return Chunk.fromIterable(Option.match(parserContext, {
    onSome: (context) => Arr.map(context.docComment.modifierTagSet.nodes, (tag) => tag.tagName),
    onNone: () => noTags,
  }))
}

const symbolInlineExportOf = (view: EntityDraft): boolean =>
  Option.match(singleExportNameOf(view), {
    onNone: () => false,
    onSome: (singleExportName) =>
      Match.value(singleExportName === 'default').pipe(
        Match.when(true, () => false),
        Match.when(false, () =>
          Option.match(view.nameForEmit, {
            onNone: () => true,
            onSome: (nameForEmit) => nameForEmit === singleExportName,
          })),
        Match.exhaustive,
      ),
  })

const shouldInlineExportOf = (
  graph: AnalysisGraph,
  view: EntityDraft,
  entityRef: AstEntityRef,
): boolean =>
  Match.value(entityRef).pipe(
    Match.tag('AstSymbolRef', () => symbolInlineExportOf(view)),
    Match.tag('AstImportRef', () => false),
    Match.tag('AstNamespaceImportRef', (namespaceRef) =>
      Option.getOrElse(
        Option.map(HashMap.get(graph.namespaceImports, namespaceRef.symbolId), (record) => record.isExport),
        () => false,
      )),
    Match.exhaustive,
  )

const finalizeEntity = (
  graph: AnalysisGraph,
  state: CollectState,
  entityRef: AstEntityRef,
): Effect.Effect<CollectorEntity, ExtractorError> =>
  Effect.map(requireEntityDraft(state, entityRef), (view) =>
    new CollectorEntity({
      astEntity: entityRef,
      localName: view.localName,
      nameForEmit: view.nameForEmit,
      exportedNames: view.exportedNames,
      localExportNamesByParent: view.localExportNamesByParent,
      exported: exportedOf(view),
      consumable: consumableOf(viewsOf(state), entityRef),
      shouldInlineExport: shouldInlineExportOf(graph, view, entityRef),
    }))

const offsetAssociations = (
  log: MessageLog,
  offset: number,
): HashMap.HashMap<NodeId, Chunk.Chunk<number>> =>
  HashMap.fromIterable(
    Arr.map(
      Chunk.toReadonlyArray(Chunk.fromIterable(log.associationByDeclaration)),
      (entry): readonly [NodeId, Chunk.Chunk<number>] => [
        entry[0],
        Chunk.map(entry[1], (index) => index + offset),
      ],
    ),
  )

const mergeAssociations = (
  maps: ReadonlyArray<HashMap.HashMap<NodeId, Chunk.Chunk<number>>>,
): HashMap.HashMap<NodeId, Chunk.Chunk<number>> =>
  Arr.reduce(maps, HashMap.empty<NodeId, Chunk.Chunk<number>>(), (accumulated, map) =>
    Arr.reduce(
      Chunk.toReadonlyArray(Chunk.fromIterable(map)),
      accumulated,
      (inner, entry) =>
        HashMap.modifyAt(inner, entry[0], (existingOption) =>
          Option.match(existingOption, {
            onNone: () => Option.some(entry[1]),
            onSome: (existing) => Option.some(Chunk.appendAll(existing, entry[1])),
          })),
    ))

const concatLogs = (first: MessageLog, second: MessageLog, third: MessageLog): MessageLog => ({
  diagnostics: first.diagnostics,
  messages: Chunk.appendAll(Chunk.appendAll(first.messages, second.messages), third.messages),
  associationByDeclaration: mergeAssociations([
    offsetAssociations(first, 0),
    offsetAssociations(second, Chunk.size(first.messages)),
    offsetAssociations(third, Chunk.size(first.messages) + Chunk.size(second.messages)),
  ]),
  handled: HashSet.empty(),
})

const topLevelEntityPhase = (
  ref: AnalysisRef,
  parser: tsdoc.TSDocParser,
  walk: WalkState,
  graph: AnalysisGraph,
  exportInfo: AstModuleExportInfo,
): Effect.Effect<WalkState, ExtractorError> => {
  const zero: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(walk)
  return Effect.flatMap(
    Arr.reduce(
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
            Option.none(),
          )
          const seeded: WalkState = { ...current, state: nextState }
          return seeded
        }),
    ),
    (afterCreation) => {
      const zeroAfter: Effect.Effect<WalkState, ExtractorError> = Effect.succeed(afterCreation)
      return Arr.reduce(
        Chunk.toReadonlyArray(exportInfo.exportedLocalEntities),
        zeroAfter,
        (accumulated, entry) =>
          Effect.gen(function*() {
            const current = yield* accumulated
            const walked = yield* enterEntity(ref, parser, current, entry[1])
            return yield* Match.value(entry[1]).pipe(
              Match.tag('AstSymbolRef', (symbolRef): Effect.Effect<WalkState, ExtractorError> =>
                Effect.map(
                  fetchSymbolMetadataInto(ref, parser, walked.state, symbolRef.symbolId),
                  (nextState) => ({ ...walked, state: nextState }),
                )),
              Match.orElse(() => Effect.succeed(walked)),
            )
          }),
      )
    },
  )
}

const packageDocPhase = (
  graph: AnalysisGraph,
): readonly [MessageLog, Option.Option<PackageDocComment>] =>
  Option.match(graph.workingPackage, {
    onNone: () => [MessageLog.make({ diagnostics: graph.messageLog.diagnostics }), Option.none()],
    onSome: (workingPackage) => {
      const baseLog = MessageLog.make({ diagnostics: graph.messageLog.diagnostics })
      const found = findPackageDocComment(workingPackage.entryPointSourceFile, baseLog)
      return [
        found[0],
        Option.map(found[1], (textRange) => {
          const parser = new tsdoc.TSDocParser(graph.tsdocConfiguration)
          const parserContext = parser.parseRange(
            tsdoc.TextRange.fromStringRange(workingPackage.entryPointSourceFile.text, textRange.pos, textRange.end),
          )
          return new PackageDocComment({ parserContext, docComment: parserContext.docComment })
        }),
      ]
    },
  })

export const collectAnalysis = (
  graphAnalysis: GraphAnalysis,
): Effect.Effect<CollectedAnalysis, ExtractorError> =>
  Effect.flatMap(Ref.get(graphAnalysis.ref), (graph) =>
    Effect.gen(function*() {
      const [packageDocLog, packageDocComment] = packageDocPhase(graph)
      const parser = new tsdoc.TSDocParser(graph.tsdocConfiguration)
      const emptyState: CollectState = {
        log: MessageLog.make({ diagnostics: graph.messageLog.diagnostics }),
        entityByRef: HashMap.empty(),
        entities: Chunk.empty(),
        entityBySymbolId: HashMap.empty(),
        dtsTypeReferenceDirectives: HashSet.empty(),
        dtsLibReferenceDirectives: HashSet.empty(),
        symbolMetadataDone: HashSet.empty(),
        symbolMetadata: HashMap.empty(),
        declarationMetadata: HashMap.empty(),
        apiItemMetadata: HashMap.empty(),
      }
      const walked = yield* topLevelEntityPhase(
        graphAnalysis.ref,
        parser,
        { state: emptyState, seen: HashSet.empty() },
        graph,
        graphAnalysis.exportInfo,
      )
      const directivesState = collectFromSourceFiles(
        walked.state,
        nonExternalSourceFilesOf(graph, graphAnalysis.exportInfo),
        true,
      )
      const namedState = yield* makeUniqueNames(graph, directivesState)
      const finalGraph = yield* Ref.get(graphAnalysis.ref)
      const zeroRecords: Effect.Effect<ReadonlyArray<CollectorEntity>, ExtractorError> = Effect.succeed([])
      const entityRecords = yield* Arr.reduce(
        Chunk.toReadonlyArray(namedState.entities),
        zeroRecords,
        (accumulated, entityRef) =>
          Effect.flatMap(accumulated, (current) =>
            Effect.map(finalizeEntity(finalGraph, namedState, entityRef), (record) => [...current, record])),
      )
      const sortedEntities = Arr.sort(entityRecords, CollectorEntityOrder)
      const entityByRef = Arr.reduce(
        sortedEntities,
        HashMap.empty<AstEntityRef, CollectorEntity>(),
        (map, record) =>
          HashMap.set(map, record.astEntity, record),
      )
      const entityBySymbolId = Arr.reduce(
        sortedEntities,
        HashMap.empty<SymbolId, CollectorEntity>(),
        (map, record) =>
          Option.match(entitySymbolIdOf(record.astEntity), {
            onSome: (symbolId) => HashMap.set(map, symbolId, record),
            onNone: () => map,
          }),
      )
      return {
        entities: Chunk.fromIterable(sortedEntities),
        entityByRef,
        entityBySymbolId,
        dtsTypeReferenceDirectives: sortStrings(namedState.dtsTypeReferenceDirectives),
        dtsLibReferenceDirectives: sortStrings(namedState.dtsLibReferenceDirectives),
        starExportedExternalModulePaths: graphAnalysis.starExportedExternalModulePaths,
        packageDocComment,
        symbolMetadata: namedState.symbolMetadata,
        declarationMetadata: namedState.declarationMetadata,
        apiItemMetadata: namedState.apiItemMetadata,
        messageLog: concatLogs(packageDocLog, finalGraph.messageLog, namedState.log),
      }
    }))
