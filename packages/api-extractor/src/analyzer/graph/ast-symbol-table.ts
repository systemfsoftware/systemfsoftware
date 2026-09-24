import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'
import * as ts from 'typescript'

import { ConsoleMessageId, type LocatedMessage } from '../../collector/message-log.js'
import { type ExtractorError, InternalInvariantError, UnsupportedSyntaxError } from '../../errors/index.js'
import * as SourceFileLocationFormatter from '../SourceFileLocationFormatter.js'
import * as SyntaxHelpers from '../SyntaxHelpers.js'
import * as TypeScriptHelpers from '../TypeScriptHelpers.js'
import { getNodeId, getSymbolId, type NodeId, type SymbolId } from '../TypeScriptInternals.js'
import * as TypeScriptInternals from '../TypeScriptInternals.js'
import {
  type AnalysisGraph,
  type AnalysisRef,
  appendMessage,
  isAedocSupportedFor,
  nodeValueOf,
  symbolValueOf,
} from './analysis-graph.js'
import { AstDeclaration, isSupportedSyntaxKind, modifierFlagsOf } from './ast-declaration.js'
import { type AstEntityRef, AstEntityRefEquivalence, AstSymbolRef } from './ast-entity.js'
import { isExternalModule } from './ast-module.js'
import type { AstNamespaceImport } from './ast-namespace-import.js'
import { AstSymbol } from './ast-symbol.js'
import {
  fetchAstModuleExportInfo,
  fetchReferencedAstEntity,
  fetchReferencedAstEntityFromImportTypeNode,
  type IAstSymbolTable,
  type IFetchAstSymbolOptions,
  isImportableAmbientSourceFile,
} from './export-analyzer.js'

const invariantDefect = (message: string): InternalInvariantError => new InternalInvariantError({ message })

const isSupportedDeclaration = (node: ts.Node): node is ts.Declaration => isSupportedSyntaxKind(node.kind)

const lineOf = (node: ts.Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1

const symbolNotFoundFailure = (node: ts.Identifier): UnsupportedSyntaxError =>
  new UnsupportedSyntaxError({
    file: node.getSourceFile().fileName,
    line: lineOf(node),
    message: 'Symbol not found for identifier: ' + node.getText(),
  })

const referenceKinds: HashSet.HashSet<ts.SyntaxKind> = HashSet.make(
  ts.SyntaxKind.TypeReference,
  ts.SyntaxKind.ExpressionWithTypeArguments,
  ts.SyntaxKind.ComputedPropertyName,
  ts.SyntaxKind.TypeQuery,
)

const isReferenceKind = (node: ts.Node): boolean => HashSet.has(referenceKinds, node.kind)

const isJsDocComment = (node: ts.Node): boolean => node.kind === ts.SyntaxKind.JSDocComment

interface LocalNameScan {
  readonly lateBound: Option.Option<string>
  readonly unquotedName: string
}

const lateBoundOf = (isUniqueSymbol: boolean, declaration: ts.Declaration): Option.Option<string> =>
  Match.value(isUniqueSymbol).pipe(
    Match.when(false, () => Option.none<string>()),
    Match.when(true, () =>
      Option.flatMap(
        Option.filter(Option.fromUndefinedOr(ts.getNameOfDeclaration(declaration)), ts.isComputedPropertyName),
        (declarationName) => Option.fromUndefinedOr(TypeScriptHelpers.tryGetLateBoundName(declarationName)),
      )),
    Match.exhaustive,
  )

const localNameScanOf =
  (isUniqueSymbol: boolean) => (scan: LocalNameScan, declaration: ts.Declaration): LocalNameScan =>
    Match.value(Option.isSome(scan.lateBound)).pipe(
      Match.when(true, () => scan),
      Match.when(false, () => ({
        lateBound: lateBoundOf(isUniqueSymbol, declaration),
        unquotedName: Option.getOrElse(
          Option.map(
            Option.fromUndefinedOr(TypeScriptInternals.tryGetLocalSymbol(declaration)),
            (localSymbol) => localSymbol.name,
          ),
          () => scan.unquotedName,
        ),
      })),
      Match.exhaustive,
    )

const quotedIfNeeded = (name: string): string =>
  Match.value(SyntaxHelpers.isSafeUnquotedMemberIdentifier(name)).pipe(
    Match.when(true, () => name),
    Match.when(false, () => JSON.stringify(name)),
    Match.exhaustive,
  )

export const getLocalNameForSymbol = (symbol: ts.Symbol): string =>
  Option.match(Option.fromUndefinedOr(TypeScriptHelpers.tryDecodeWellKnownSymbolName(symbol.escapedName)), {
    onSome: (wellKnownName) => wellKnownName,
    onNone: () => {
      const scan: LocalNameScan = Arr.reduce(
        Option.getOrElse(Option.fromNullishOr(symbol.declarations), () => []),
        { lateBound: Option.none<string>(), unquotedName: symbol.name } satisfies LocalNameScan,
        localNameScanOf(TypeScriptHelpers.isUniqueSymbolName(symbol.escapedName)),
      )
      return Option.getOrElse(
        Option.map(scan.lateBound, (lateBound) => lateBound),
        () => quotedIfNeeded(scan.unquotedName),
      )
    },
  })

const localNameOfOptions = (options: IFetchAstSymbolOptions): string =>
  Option.getOrElse(
    Option.filter(Option.fromNullishOr(options.localName), (name) => name.length > 0),
    () => getLocalNameForSymbol(options.followedSymbol),
  )

const SymbolGate = {
  Skip: 'Skip',
  AliasDefect: 'AliasDefect',
  Proceed: 'Proceed',
} as const

type SymbolGate = (typeof SymbolGate)[keyof typeof SymbolGate]

const isUninterestingSymbol = (symbol: ts.Symbol): boolean =>
  Match.value(
    (symbol.flags & (ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.Transient)) !== 0,
  ).pipe(
    Match.when(false, () => false),
    Match.when(true, () => !TypeScriptInternals.isLateBoundSymbol(symbol)),
    Match.exhaustive,
  )

const isIgnorableAmbient = (graph: AnalysisGraph, symbol: ts.Symbol, declaration: ts.Declaration): boolean =>
  Match.value(TypeScriptHelpers.isAmbient(symbol, graph.typeChecker)).pipe(
    Match.when(false, () => false),
    Match.when(true, () => !isImportableAmbientSourceFile(graph, declaration.getSourceFile())),
    Match.exhaustive,
  )

const symbolGateOf = (graph: AnalysisGraph, symbol: ts.Symbol, declaration: ts.Declaration): SymbolGate =>
  Match.value(isUninterestingSymbol(symbol)).pipe(
    Match.when(true, () => SymbolGate.Skip),
    Match.when(false, () =>
      Match.value(isIgnorableAmbient(graph, symbol, declaration)).pipe(
        Match.when(true, () => SymbolGate.Skip),
        Match.when(false, () =>
          Match.value(TypeScriptHelpers.isFollowableAlias(symbol, graph.typeChecker)).pipe(
            Match.when(true, () => SymbolGate.AliasDefect),
            Match.when(false, () => SymbolGate.Proceed),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const nominalAnalysisOf = (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
  declaration: ts.Declaration,
): Effect.Effect<Option.Option<boolean>, ExtractorError> =>
  Match.value(options.isExternal).pipe(
    Match.when(false, () => Effect.succeedSome(false)),
    Match.when(true, () =>
      Effect.map(isAedocSupportedFor(ref, declaration.getSourceFile().fileName), (aedocSupported) =>
        Match.value(aedocSupported).pipe(
          Match.when(true, () =>
            Option.some(false)),
          Match.when(false, () =>
            Match.value(options.includeNominalAnalysis).pipe(
              Match.when(true, () =>
                Option.some(true)),
              Match.when(false, () => Option.none<boolean>()),
              Match.exhaustive,
            )),
          Match.exhaustive,
        ))),
    Match.exhaustive,
  )

const unsupportedDeclarationOf = (symbol: ts.Symbol): Option.Option<ts.Declaration> =>
  Arr.findFirst(
    Option.getOrElse(Option.fromNullishOr(symbol.declarations), () => []),
    (declaration) => !isSupportedSyntaxKind(declaration.kind),
  )

const unsupportedDeclarationDefect = (symbol: ts.Symbol, declaration: ts.Declaration): InternalInvariantError =>
  invariantDefect(
    `The "${symbol.name}" symbol has a ts.SyntaxKind.${ts.SyntaxKind[declaration.kind]}` +
      ' declaration which is not (yet?) supported by API Extractor',
  )

const unsupportedDeclarationsOf = (
  options: IFetchAstSymbolOptions,
  nominalAnalysis: boolean,
): Effect.Effect<void, ExtractorError> =>
  Match.value(nominalAnalysis).pipe(
    Match.when(true, () => Effect.void),
    Match.when(false, () =>
      Option.match(unsupportedDeclarationOf(options.followedSymbol), {
        onNone: () => Effect.void,
        onSome: (declaration) => Effect.die(unsupportedDeclarationDefect(options.followedSymbol, declaration)),
      })),
    Match.exhaustive,
  )

const astSymbolRecordOf = (ref: AnalysisRef, symbolId: SymbolId): Effect.Effect<AstSymbol, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(HashMap.get(graph.symbols, symbolId), {
      onSome: (astSymbol) => Effect.succeed(astSymbol),
      onNone: () => Effect.die(invariantDefect('Missing AstSymbol record for the symbol id ' + symbolId)),
    }))

const namespaceImportRecordOf = (
  ref: AnalysisRef,
  symbolId: SymbolId,
): Effect.Effect<AstNamespaceImport, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(HashMap.get(graph.namespaceImports, symbolId), {
      onSome: (astNamespaceImport) => Effect.succeed(astNamespaceImport),
      onNone: () => Effect.die(invariantDefect('Missing AstNamespaceImport record for the symbol id ' + symbolId)),
    }))

const isExternalOfDeclaration = (
  graph: AnalysisGraph,
  declarationId: NodeId,
): Effect.Effect<boolean, ExtractorError> =>
  Option.match(HashMap.get(graph.declarations, declarationId), {
    onNone: () => Effect.die(invariantDefect('Missing AstDeclaration record for the declaration id ' + declarationId)),
    onSome: (declaration) =>
      Option.match(HashMap.get(graph.symbols, declaration.astSymbolId), {
        onSome: (astSymbol) => Effect.succeed(astSymbol.isExternal),
        onNone: () =>
          Effect.die(invariantDefect('Missing AstSymbol record for the symbol id ' + declaration.astSymbolId)),
      }),
  })

const fetchExternalFlagOfDeclaration = (
  ref: AnalysisRef,
  declarationId: NodeId,
): Effect.Effect<boolean, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) => isExternalOfDeclaration(graph, declarationId))

const firstDeclarationParentOf = (node: ts.Node): Option.Option<ts.Declaration> =>
  Option.flatMap(Option.fromUndefinedOr(node.parent), (parent) =>
    Match.value(isSupportedSyntaxKind(parent.kind)).pipe(
      Match.when(true, () => Option.filter(Option.some(parent), isSupportedDeclaration)),
      Match.when(false, () => firstDeclarationParentOf(parent)),
      Match.exhaustive,
    ))

const fetchParentAstSymbol = (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
  arbitraryDeclaration: ts.Declaration,
): Effect.Effect<Option.Option<AstSymbol>, ExtractorError> =>
  Option.match(firstDeclarationParentOf(arbitraryDeclaration), {
    onNone: () => Effect.succeedNone,
    onSome: (parentDeclaration) =>
      Effect.flatMap(Ref.get(ref), (graph) =>
        Option.match(
          Option.fromUndefinedOr(TypeScriptHelpers.getSymbolForDeclaration(parentDeclaration, graph.typeChecker)),
          {
            onNone: () =>
              Effect.die(
                invariantDefect(
                  'Unable to determine semantic information for declaration:\n' +
                    SourceFileLocationFormatter.formatDeclaration(parentDeclaration),
                ),
              ),
            onSome: (parentSymbol) =>
              Effect.flatMap(
                fetchAstSymbol(ref, {
                  followedSymbol: parentSymbol,
                  isExternal: options.isExternal,
                  includeNominalAnalysis: false,
                  addIfMissing: true,
                }),
                (parentAstSymbolRef) =>
                  Option.match(parentAstSymbolRef, {
                    onNone: () =>
                      Effect.die(
                        invariantDefect(
                          'Unable to construct a parent AstSymbol for ' + options.followedSymbol.name,
                        ),
                      ),
                    onSome: (parentRef) => Effect.asSome(astSymbolRecordOf(ref, parentRef.symbolId)),
                  }),
              ),
          },
        )),
  })

const parentAstSymbolOf = (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
  arbitraryDeclaration: ts.Declaration,
  nominalAnalysis: boolean,
): Effect.Effect<Option.Option<AstSymbol>, ExtractorError> =>
  Match.value(nominalAnalysis).pipe(
    Match.when(true, () => Effect.succeedNone),
    Match.when(false, () => fetchParentAstSymbol(ref, options, arbitraryDeclaration)),
    Match.exhaustive,
  )

const parentDeclarationIdOf = (
  ref: AnalysisRef,
  declaration: ts.Declaration,
  parentAstSymbol: Option.Option<AstSymbol>,
): Effect.Effect<Option.Option<NodeId>, ExtractorError> =>
  Match.value(Option.isSome(parentAstSymbol)).pipe(
    Match.when(false, () => Effect.succeedNone),
    Match.when(true, () =>
      Option.match(firstDeclarationParentOf(declaration), {
        onNone: () => Effect.die(invariantDefect('Missing parent declaration')),
        onSome: (parentDeclaration) =>
          Effect.flatMap(Ref.get(ref), (graph) =>
            Option.match(HashMap.get(graph.declarations, getNodeId(parentDeclaration)), {
              onSome: (parent) => Effect.succeedSome(parent.declarationId),
              onNone: () => Effect.die(invariantDefect('Missing parent AstDeclaration')),
            })),
      })),
    Match.exhaustive,
  )

const withChildDeclaration = (
  graph: AnalysisGraph,
  parentDeclarationId: NodeId,
  declarationId: NodeId,
): HashMap.HashMap<NodeId, Chunk.Chunk<NodeId>> =>
  HashMap.modifyAt(
    graph.childrenByDeclaration,
    parentDeclarationId,
    Option.match({
      onNone: () => Option.some(Chunk.of(declarationId)),
      onSome: (children) => Option.some(Chunk.append(children, declarationId)),
    }),
  )

const wireDeclaration = (
  ref: AnalysisRef,
  declaration: ts.Declaration,
  declarationId: NodeId,
  astSymbol: AstSymbol,
  parentAstSymbol: Option.Option<AstSymbol>,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(
    parentDeclarationIdOf(ref, declaration, parentAstSymbol),
    (parentDeclarationId) =>
      Ref.update(ref, (graph) => ({
        ...graph,
        declarations: HashMap.set(
          graph.declarations,
          declarationId,
          new AstDeclaration({
            declarationId,
            astSymbolId: astSymbol.followedSymbolId,
            rootAstSymbolId: astSymbol.rootAstSymbolId,
            parentDeclarationId,
            modifierFlags: modifierFlagsOf(declaration),
          }),
        ),
        declarationValues: HashMap.set(graph.declarationValues, declarationId, declaration),
        childrenByDeclaration: Option.getOrElse(
          Option.map(parentDeclarationId, (parent) => withChildDeclaration(graph, parent, declarationId)),
          () => graph.childrenByDeclaration,
        ),
      })),
  )

const storeAstSymbol = (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
  nominalAnalysis: boolean,
  parentAstSymbol: Option.Option<AstSymbol>,
): Effect.Effect<AstSymbol, ExtractorError> => {
  const followedSymbolId = getSymbolId(options.followedSymbol)
  const declarations: ReadonlyArray<ts.Declaration> = Option.getOrElse(
    Option.fromNullishOr(options.followedSymbol.declarations),
    () => [],
  )
  const astSymbol = new AstSymbol({
    followedSymbolId,
    localName: localNameOfOptions(options),
    isExternal: options.isExternal,
    nominalAnalysis,
    parentAstSymbolId: Option.map(parentAstSymbol, (parent) => parent.followedSymbolId),
    rootAstSymbolId: Option.getOrElse(
      Option.map(parentAstSymbol, (parent) => parent.rootAstSymbolId),
      () => followedSymbolId,
    ),
    declarationIds: Chunk.fromIterable(Arr.map(declarations, (declaration) => getNodeId(declaration))),
  })
  return Effect.flatMap(
    Ref.update(ref, (next) => ({
      ...next,
      symbols: HashMap.set(next.symbols, followedSymbolId, astSymbol),
      symbolValues: HashMap.set(next.symbolValues, followedSymbolId, options.followedSymbol),
    })),
    () =>
      Effect.as(
        Effect.forEach(
          declarations,
          (declaration) => wireDeclaration(ref, declaration, getNodeId(declaration), astSymbol, parentAstSymbol),
          { discard: true },
        ),
        astSymbol,
      ),
  )
}

const registerConsistency = (
  options: IFetchAstSymbolOptions,
  astSymbol: AstSymbol,
): Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError> =>
  Match.value(options.isExternal === astSymbol.isExternal).pipe(
    Match.when(true, () => Effect.succeedSome(new AstSymbolRef({ symbolId: astSymbol.followedSymbolId }))),
    Match.when(false, () =>
      Effect.die(
        invariantDefect(
          `Cannot assign isExternal=${options.isExternal} for the symbol ${astSymbol.localName}` +
            ` because it was previously registered with isExternal=${astSymbol.isExternal}`,
        ),
      )),
    Match.exhaustive,
  )

const createAstSymbol = (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
  arbitraryDeclaration: ts.Declaration,
  nominalAnalysis: boolean,
): Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError> =>
  Effect.flatMap(
    unsupportedDeclarationsOf(options, nominalAnalysis),
    () =>
      Effect.flatMap(parentAstSymbolOf(ref, options, arbitraryDeclaration, nominalAnalysis), (parentAstSymbol) =>
        Effect.flatMap(storeAstSymbol(ref, options, nominalAnalysis, parentAstSymbol), (astSymbol) =>
          registerConsistency(options, astSymbol))),
  )

const fetchOrCreateAstSymbol = (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
  arbitraryDeclaration: ts.Declaration,
  nominalAnalysis: boolean,
): Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Option.match(HashMap.get(graph.symbols, getSymbolId(options.followedSymbol)), {
        onSome: (astSymbol) => registerConsistency(options, astSymbol),
        onNone: () => createAstSymbol(ref, options, arbitraryDeclaration, nominalAnalysis),
      }),
  )

const proceedFetch = (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
  arbitraryDeclaration: ts.Declaration,
): Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError> =>
  Effect.flatMap(
    nominalAnalysisOf(ref, options, arbitraryDeclaration),
    (nominalAnalysis) =>
      Option.match(nominalAnalysis, {
        onNone: () => Effect.succeedNone,
        onSome: (nominal) => fetchOrCreateAstSymbol(ref, options, arbitraryDeclaration, nominal),
      }),
  )

export const fetchAstSymbol = dual<
  (options: IFetchAstSymbolOptions) => (ref: AnalysisRef) => Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError>,
  (ref: AnalysisRef, options: IFetchAstSymbolOptions) => Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError>
>(2, (
  ref: AnalysisRef,
  options: IFetchAstSymbolOptions,
): Effect.Effect<Option.Option<AstSymbolRef>, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Option.match(Option.fromUndefinedOr(TypeScriptHelpers.tryGetADeclaration(options.followedSymbol)), {
        onNone: () => Effect.succeedNone,
        onSome: (declaration) =>
          Match.value(symbolGateOf(graph, options.followedSymbol, declaration)).pipe(
            Match.when('Skip', () => Effect.succeedNone),
            Match.when('AliasDefect', () =>
              Effect.die(
                invariantDefect('AstSymbolTable._fetchAstSymbol() cannot be called with a symbol alias'),
              )),
            Match.when('Proceed', () => proceedFetch(ref, options, declaration)),
            Match.exhaustive,
          ),
      }),
  ))

const hasEntityByNode = (graph: AnalysisGraph, node: ts.Node): boolean =>
  HashMap.has(graph.entitiesByNode, getNodeId(node))

const flattenedEntityRefOf = (graph: AnalysisGraph, node: ts.Node): Option.Option<AstEntityRef> =>
  Option.flatten(HashMap.get(graph.entitiesByNode, getNodeId(node)))

const nodeOfDeclaration = (ref: AnalysisRef, declarationId: NodeId): Effect.Effect<ts.Node, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(nodeValueOf(graph, declarationId), {
      onSome: (node) => Effect.succeed(node),
      onNone: () => Effect.die(invariantDefect('Missing ts.Node for the declaration id ' + declarationId)),
    }))

const declarationIdsOf = (ref: AnalysisRef, symbolId: SymbolId): Effect.Effect<ReadonlyArray<NodeId>, ExtractorError> =>
  Effect.map(astSymbolRecordOf(ref, symbolId), (astSymbol) => Chunk.toReadonlyArray(astSymbol.declarationIds))

const childDeclarationIdsOf = (
  ref: AnalysisRef,
  declarationId: NodeId,
): Effect.Effect<ReadonlyArray<NodeId>> =>
  Effect.map(Ref.get(ref), (graph) =>
    Option.getOrElse(
      Option.map(HashMap.get(graph.childrenByDeclaration, declarationId), Chunk.toReadonlyArray),
      () => [],
    ))

const referencedEntityRefsOf = (
  ref: AnalysisRef,
  declarationId: NodeId,
): Effect.Effect<ReadonlyArray<AstEntityRef>> =>
  Effect.map(Ref.get(ref), (graph) =>
    Option.getOrElse(
      Option.map(HashMap.get(graph.referencedByDeclaration, declarationId), Chunk.toReadonlyArray),
      () => [],
    ))

const moduleOf = (
  ref: AnalysisRef,
  moduleSymbolId: SymbolId,
): Effect.Effect<import('./ast-module.js').AstModule, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(HashMap.get(graph.modules, moduleSymbolId), {
      onSome: (astModule) => Effect.succeed(astModule),
      onNone: () => Effect.die(invariantDefect('Missing AstModule record for the module symbol id ' + moduleSymbolId)),
    }))

const isExternalModuleOf = (ref: AnalysisRef, moduleSymbolId: SymbolId): Effect.Effect<boolean, ExtractorError> =>
  Effect.map(moduleOf(ref, moduleSymbolId), isExternalModule)

const markSymbolAnalyzed = (ref: AnalysisRef, rootAstSymbolId: SymbolId): Effect.Effect<void> =>
  Ref.update(ref, (graph) => ({
    ...graph,
    analyzedSymbols: HashSet.add(graph.analyzedSymbols, rootAstSymbolId),
  }))

const markNamespaceImportAnalyzed = (ref: AnalysisRef, symbolId: SymbolId): Effect.Effect<void> =>
  Ref.update(ref, (graph) => ({
    ...graph,
    analyzedNamespaceImports: HashSet.add(graph.analyzedNamespaceImports, symbolId),
  }))

const setEntityByNode = (
  ref: AnalysisRef,
  node: ts.Node,
  entityRef: Option.Option<AstEntityRef>,
): Effect.Effect<void> =>
  Ref.update(ref, (graph) => ({
    ...graph,
    entitiesByNode: HashMap.set(graph.entitiesByNode, getNodeId(node), entityRef),
  }))

const entityRefEqualsDeclarationSymbol = (declaration: AstDeclaration, entityRef: AstEntityRef): boolean =>
  Match.value(entityRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => symbolRef.symbolId === declaration.astSymbolId),
    Match.orElse(() => false),
  )

const declarationHasReference = (
  graph: AnalysisGraph,
  declaration: AstDeclaration,
  entityRef: AstEntityRef,
): boolean =>
  Match.value(entityRefEqualsDeclarationSymbol(declaration, entityRef)).pipe(
    Match.when(true, () => true),
    Match.when(false, () =>
      Option.getOrElse(
        Option.map(
          HashMap.get(graph.referencedByDeclaration, declaration.declarationId),
          (refs) => Arr.some(Chunk.toReadonlyArray(refs), (candidate) => AstEntityRefEquivalence(candidate, entityRef)),
        ),
        () => false,
      )),
    Match.exhaustive,
  )

const declarationChainHasReference = (
  graph: AnalysisGraph,
  declarationId: NodeId,
  entityRef: AstEntityRef,
): boolean =>
  Option.match(HashMap.get(graph.declarations, declarationId), {
    onNone: () => false,
    onSome: (declaration) =>
      Match.value(declarationHasReference(graph, declaration, entityRef)).pipe(
        Match.when(true, () => true),
        Match.when(false, () =>
          Option.match(declaration.parentDeclarationId, {
            onNone: () => false,
            onSome: (parentDeclarationId) => declarationChainHasReference(graph, parentDeclarationId, entityRef),
          })),
        Match.exhaustive,
      ),
  })

const appendReferencedEntity = (
  graph: AnalysisGraph,
  declarationId: NodeId,
  entityRef: AstEntityRef,
): AnalysisGraph =>
  Match.value(declarationChainHasReference(graph, declarationId, entityRef)).pipe(
    Match.when(true, () => graph),
    Match.when(false, () => ({
      ...graph,
      referencedByDeclaration: HashMap.modifyAt(
        graph.referencedByDeclaration,
        declarationId,
        Option.match({
          onNone: () => Option.some(Chunk.of(entityRef)),
          onSome: (refs) => Option.some(Chunk.append(refs, entityRef)),
        }),
      ),
    })),
    Match.exhaustive,
  )

const notifyReferencedEntity = (
  ref: AnalysisRef,
  declarationId: NodeId,
  entityRef: AstEntityRef,
): Effect.Effect<void> => Ref.update(ref, (graph) => appendReferencedEntity(graph, declarationId, entityRef))

const notifyReferencedOption = (
  ref: AnalysisRef,
  declarationId: NodeId,
  entityRef: Option.Option<AstEntityRef>,
): Effect.Effect<void> =>
  Option.match(entityRef, {
    onNone: () => Effect.void,
    onSome: (someRef) => notifyReferencedEntity(ref, declarationId, someRef),
  })

const governingFollowedSymbolOf = (
  graph: AnalysisGraph,
  declarationId: NodeId,
): Option.Option<ts.Symbol> =>
  Option.flatMap(
    HashMap.get(graph.declarations, declarationId),
    (declaration) =>
      Option.flatMap(HashMap.get(graph.symbols, declaration.astSymbolId), (astSymbol) =>
        symbolValueOf(graph, astSymbol.followedSymbolId)),
  )

const globalReferenceWarning = (identifier: ts.Identifier): LocatedMessage => ({
  category: 'console',
  messageId: ConsoleMessageId.Diagnostics,
  text: 'Ignoring reference to global variable "' +
    identifier.text +
    '" in ' +
    SourceFileLocationFormatter.formatDeclaration(identifier),
  properties: undefined,
  logLevel: 'verbose',
  position: Option.none(),
})

const markWarnedGlobalName = (ref: AnalysisRef, identifier: ts.Identifier): Effect.Effect<void> =>
  Ref.update(ref, (graph) =>
    appendMessage(
      { ...graph, warnedGlobalNames: HashSet.add(graph.warnedGlobalNames, identifier.text) },
      globalReferenceWarning(identifier),
    ))

const warnGlobalReference = (ref: AnalysisRef, identifier: ts.Identifier): Effect.Effect<void> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Match.value(graph.messageLog.diagnostics).pipe(
      Match.when(false, () => Effect.void),
      Match.when(true, () =>
        Match.value(HashSet.has(graph.warnedGlobalNames, identifier.text)).pipe(
          Match.when(true, () => Effect.void),
          Match.when(false, () => markWarnedGlobalName(ref, identifier)),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ))

const isDisplacedSymbol = (symbol: ts.Symbol, identifier: ts.Identifier): boolean =>
  !Arr.some(
    Option.getOrElse(Option.fromNullishOr(symbol.declarations), () => []),
    (declaration) => declaration.getSourceFile() === identifier.getSourceFile(),
  )

const handleDisplacedSymbol = (ref: AnalysisRef, identifier: ts.Identifier): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Match.value(graph.globalVariableAnalyzer.hasGlobalName(identifier.text)).pipe(
      Match.when(true, () => warnGlobalReference(ref, identifier)),
      Match.when(false, () => Effect.die(invariantDefect(`Unable to follow symbol for "${identifier.text}"`))),
      Match.exhaustive,
    ))

const storeAndNotify = (
  ref: AnalysisRef,
  node: ts.Identifier | ts.ImportTypeNode,
  governingDeclarationId: NodeId,
  symbol: ts.Symbol,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(
    fetchExternalFlagOfDeclaration(ref, governingDeclarationId),
    (isExternal) =>
      Effect.flatMap(fetchReferencedAstEntity(astSymbolTable, ref, symbol, isExternal), (entityRef) =>
        Effect.flatMap(setEntityByNode(ref, node, entityRef), () =>
          notifyReferencedOption(ref, governingDeclarationId, entityRef))),
  )

const resolveReferenceNode = (
  ref: AnalysisRef,
  identifier: ts.Identifier,
  governingDeclarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Option.match(Option.fromUndefinedOr(graph.typeChecker.getSymbolAtLocation(identifier)), {
        onNone: () => Effect.fail(symbolNotFoundFailure(identifier)),
        onSome: (symbol) =>
          Match.value(isDisplacedSymbol(symbol, identifier)).pipe(
            Match.when(true, () => handleDisplacedSymbol(ref, identifier)),
            Match.when(false, () => storeAndNotify(ref, identifier, governingDeclarationId, symbol)),
            Match.exhaustive,
          ),
      }),
  )

const analyzeReferenceNode = (
  ref: AnalysisRef,
  node: ts.Node,
  governingDeclarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Option.match(
    Option.fromUndefinedOr(TypeScriptHelpers.findFirstChildNode<ts.Identifier>(node, ts.SyntaxKind.Identifier)),
    {
      onNone: () => Effect.void,
      onSome: (identifierNode) =>
        Effect.flatMap(Ref.get(ref), (graph) =>
          Option.match(flattenedEntityRefOf(graph, identifierNode), {
            onSome: (entityRef) => notifyReferencedEntity(ref, governingDeclarationId, entityRef),
            onNone: () => resolveReferenceNode(ref, identifierNode, governingDeclarationId),
          })),
    },
  )

const fetchIdentifierEntity = (
  ref: AnalysisRef,
  node: ts.Identifier,
  governingDeclarationId: NodeId,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Option.match(Option.fromUndefinedOr(graph.typeChecker.getSymbolAtLocation(node)), {
        onNone: () => Effect.fail(symbolNotFoundFailure(node)),
        onSome: (symbol) => storeAndNotifyEntity(ref, node, governingDeclarationId, symbol),
      }),
  )

const storeAndNotifyEntity = (
  ref: AnalysisRef,
  node: ts.Identifier | ts.ImportTypeNode,
  governingDeclarationId: NodeId,
  symbol: ts.Symbol,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(
    fetchExternalFlagOfDeclaration(ref, governingDeclarationId),
    (isExternal) =>
      Effect.flatMap(fetchReferencedAstEntity(astSymbolTable, ref, symbol, isExternal), (entityRef) =>
        Effect.as(setEntityByNode(ref, node, entityRef), entityRef)),
  )

const fetchImportTypeEntity = (
  ref: AnalysisRef,
  node: ts.ImportTypeNode,
  governingDeclarationId: NodeId,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(
    fetchExternalFlagOfDeclaration(ref, governingDeclarationId),
    (isExternal) =>
      Effect.flatMap(fetchReferencedAstEntityFromImportTypeNode(astSymbolTable, ref, node, isExternal), (entityRef) =>
        Effect.as(setEntityByNode(ref, node, entityRef), entityRef)),
  )

const fetchEntityForNode = (
  ref: AnalysisRef,
  node: ts.Identifier | ts.ImportTypeNode,
  governingDeclarationId: NodeId,
): Effect.Effect<Option.Option<AstEntityRef>, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Option.match(flattenedEntityRefOf(graph, node), {
      onSome: (entityRef) => Effect.succeedSome(entityRef),
      onNone: () =>
        Match.value(node).pipe(
          Match.when(
            ts.isImportTypeNode,
            (importTypeNode) => fetchImportTypeEntity(ref, importTypeNode, governingDeclarationId),
          ),
          Match.orElse((identifier) => fetchIdentifierEntity(ref, identifier, governingDeclarationId)),
        ),
    }))

const storeIdentifierEntity = (
  ref: AnalysisRef,
  identifier: ts.Identifier,
  governingDeclarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Option.match(Option.fromUndefinedOr(graph.typeChecker.getSymbolAtLocation(identifier)), {
        onNone: () => setEntityByNode(ref, identifier, Option.none()),
        onSome: (symbol) =>
          Match.value(
            Option.exists(
              governingFollowedSymbolOf(graph, governingDeclarationId),
              (governing) => governing === symbol,
            ),
          ).pipe(
            Match.when(
              true,
              () =>
                Effect.flatMap(fetchEntityForNode(ref, identifier, governingDeclarationId), (entityRef) =>
                  setEntityByNode(ref, identifier, entityRef)),
            ),
            Match.when(false, () =>
              setEntityByNode(ref, identifier, Option.none())),
            Match.exhaustive,
          ),
      }),
  )

const analyzeIdentifierNode = (
  ref: AnalysisRef,
  identifier: ts.Identifier,
  governingDeclarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Match.value(hasEntityByNode(graph, identifier)).pipe(
      Match.when(true, () => Effect.void),
      Match.when(false, () => storeIdentifierEntity(ref, identifier, governingDeclarationId)),
      Match.exhaustive,
    ))

const analyzeImportTypeNode = (
  ref: AnalysisRef,
  node: ts.ImportTypeNode,
  governingDeclarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(Ref.get(ref), (graph) =>
    Match.value(hasEntityByNode(graph, node)).pipe(
      Match.when(true, () =>
        Option.match(flattenedEntityRefOf(graph, node), {
          onSome: (entityRef) => notifyReferencedEntity(ref, governingDeclarationId, entityRef),
          onNone: () => Effect.void,
        })),
      Match.when(false, () =>
        Effect.flatMap(fetchEntityForNode(ref, node, governingDeclarationId), (entityRef) =>
          Match.value(Option.isSome(entityRef)).pipe(
            Match.when(false, () =>
              Effect.die(invariantDefect('Failed to fetch entity for import() type node: ' + node.getText()))),
            Match.when(true, () =>
              Effect.flatMap(setEntityByNode(ref, node, entityRef), () =>
                notifyReferencedOption(ref, governingDeclarationId, entityRef))),
            Match.exhaustive,
          ))),
      Match.exhaustive,
    ))

const fetchAstDeclarationForNode = (
  ref: AnalysisRef,
  node: ts.Node,
  isExternal: boolean,
): Effect.Effect<Option.Option<NodeId>, ExtractorError> =>
  Match.value(isSupportedSyntaxKind(node.kind)).pipe(
    Match.when(false, () => Effect.succeedNone),
    Match.when(true, () =>
      Option.match(Option.filter(Option.some(node), isSupportedDeclaration), {
        onNone: () => Effect.die(invariantDefect('Unable to find symbol for node')),
        onSome: (declaration) =>
          Effect.flatMap(Ref.get(ref), (graph) =>
            Option.match(
              Option.fromUndefinedOr(TypeScriptHelpers.getSymbolForDeclaration(declaration, graph.typeChecker)),
              {
                onNone: () => Effect.die(invariantDefect('Unable to find symbol for node')),
                onSome: (symbol) =>
                  Effect.flatMap(
                    fetchAstSymbol(ref, {
                      followedSymbol: symbol,
                      isExternal,
                      includeNominalAnalysis: true,
                      addIfMissing: true,
                    }),
                    (astSymbolRef) =>
                      Option.match(astSymbolRef, {
                        onNone: () => Effect.succeedNone,
                        onSome: () =>
                          Effect.flatMap(Ref.get(ref), (next) =>
                            Option.match(HashMap.get(next.declarations, getNodeId(node)), {
                              onSome: (astDeclaration) => Effect.succeedSome(astDeclaration.declarationId),
                              onNone: () => Effect.die(invariantDefect('Unable to find constructed AstDeclaration')),
                            })),
                      }),
                  ),
              },
            )),
      })),
    Match.exhaustive,
  )

const descendChildTree = (
  ref: AnalysisRef,
  node: ts.Node,
  governingDeclarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(
    fetchExternalFlagOfDeclaration(ref, governingDeclarationId),
    (isExternal) =>
      Effect.flatMap(fetchAstDeclarationForNode(ref, node, isExternal), (newGoverningDeclarationId) =>
        Effect.forEach(
          node.getChildren(),
          (childNode) =>
            analyzeChildTree(ref, childNode, Option.getOrElse(newGoverningDeclarationId, () => governingDeclarationId)),
          { discard: true },
        )),
  )

const analyzeChildTree = (
  ref: AnalysisRef,
  node: ts.Node,
  governingDeclarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Match.value(node).pipe(
    Match.when(isJsDocComment, () => Effect.void),
    Match.orElse(() =>
      Effect.flatMap(
        Match.value(node).pipe(
          Match.when(isReferenceKind, (referenceNode) =>
            analyzeReferenceNode(ref, referenceNode, governingDeclarationId)),
          Match.when(ts.isIdentifier, (identifier) =>
            analyzeIdentifierNode(ref, identifier, governingDeclarationId)),
          Match.when(ts.isImportTypeNode, (importTypeNode) =>
            analyzeImportTypeNode(ref, importTypeNode, governingDeclarationId)),
          Match.orElse(() =>
            Effect.void
          ),
        ),
        () => descendChildTree(ref, node, governingDeclarationId),
      )
    ),
  )

const analyzeReferencedEntity = (
  ref: AnalysisRef,
  astEntityRef: AstEntityRef,
): Effect.Effect<void, ExtractorError> =>
  Match.value(astEntityRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) =>
      Effect.flatMap(astSymbolRecordOf(ref, symbolRef.symbolId), (astSymbol) =>
        Match.value(astSymbol.isExternal).pipe(
          Match.when(true, () =>
            Effect.void),
          Match.when(false, () => analyzeAstSymbol(ref, astSymbol)),
          Match.exhaustive,
        ))),
    Match.tag('AstNamespaceImportRef', (namespaceRef) =>
      Effect.flatMap(namespaceImportRecordOf(ref, namespaceRef.symbolId), (astNamespaceImport) =>
        Effect.flatMap(isExternalModuleOf(ref, astNamespaceImport.astModuleId), (isExternal) =>
          Match.value(isExternal).pipe(
            Match.when(true, () =>
              Effect.void),
            Match.when(false, () =>
              analyzeAstNamespaceImport(ref, astNamespaceImport)),
            Match.exhaustive,
          )))),
    Match.orElse(() =>
      Effect.void
    ),
  )

const followReferencesRecursive = (
  ref: AnalysisRef,
  declarationId: NodeId,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(referencedEntityRefsOf(ref, declarationId), (entityRefs) =>
    Effect.flatMap(
      Effect.forEach(entityRefs, (entityRef) => analyzeReferencedEntity(ref, entityRef), { discard: true }),
      () =>
        Effect.flatMap(childDeclarationIdsOf(ref, declarationId), (childIds) =>
          Effect.forEach(
            childIds,
            (childId) => followReferencesRecursive(ref, childId),
            { discard: true },
          )),
    ))

const followReferencesOf = (ref: AnalysisRef, astSymbol: AstSymbol): Effect.Effect<void, ExtractorError> =>
  Match.value(astSymbol.isExternal).pipe(
    Match.when(true, () => Effect.void),
    Match.when(
      false,
      () =>
        Effect.flatMap(declarationIdsOf(ref, astSymbol.rootAstSymbolId), (declarationIds) =>
          Effect.forEach(
            declarationIds,
            (declarationId) => followReferencesRecursive(ref, declarationId),
            { discard: true },
          )),
    ),
    Match.exhaustive,
  )

const analyzeRootDeclarationTree = (ref: AnalysisRef, astSymbol: AstSymbol): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(declarationIdsOf(ref, astSymbol.rootAstSymbolId), (declarationIds) =>
    Effect.flatMap(
      Effect.forEach(
        declarationIds,
        (declarationId) =>
          Effect.flatMap(nodeOfDeclaration(ref, declarationId), (node) => analyzeChildTree(ref, node, declarationId)),
        { discard: true },
      ),
      () =>
        Effect.flatMap(markSymbolAnalyzed(ref, astSymbol.rootAstSymbolId), () => followReferencesOf(ref, astSymbol)),
    ))

const analyzeAstSymbol = (ref: AnalysisRef, astSymbol: AstSymbol): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Match.value(HashSet.has(graph.analyzedSymbols, astSymbol.rootAstSymbolId)).pipe(
        Match.when(true, () => Effect.void),
        Match.when(false, () =>
          Match.value(astSymbol.nominalAnalysis).pipe(
            Match.when(true, () => markSymbolAnalyzed(ref, astSymbol.rootAstSymbolId)),
            Match.when(false, () => analyzeRootDeclarationTree(ref, astSymbol)),
            Match.exhaustive,
          )),
        Match.exhaustive,
      ),
  )

const analyzeAstNamespaceImport = (
  ref: AnalysisRef,
  astNamespaceImport: AstNamespaceImport,
): Effect.Effect<void, ExtractorError> =>
  Effect.flatMap(
    Ref.get(ref),
    (graph) =>
      Match.value(HashSet.has(graph.analyzedNamespaceImports, astNamespaceImport.symbolId)).pipe(
        Match.when(true, () => Effect.void),
        Match.when(false, () =>
          Effect.flatMap(markNamespaceImportAnalyzed(ref, astNamespaceImport.symbolId), () =>
            Effect.flatMap(moduleOf(ref, astNamespaceImport.astModuleId), (astModule) =>
              Effect.flatMap(fetchAstModuleExportInfo(astSymbolTable, ref, astModule), (exportInfo) =>
                Effect.forEach(
                  Chunk.toReadonlyArray(exportInfo.exportedLocalEntities),
                  (entry) => analyze(ref, entry[1]),
                  { discard: true },
                ))))),
        Match.exhaustive,
      ),
  )

export const analyze = dual<
  (astEntityRef: AstEntityRef) => (ref: AnalysisRef) => Effect.Effect<void, ExtractorError>,
  (ref: AnalysisRef, astEntityRef: AstEntityRef) => Effect.Effect<void, ExtractorError>
>(
  2,
  (ref: AnalysisRef, astEntityRef: AstEntityRef): Effect.Effect<void, ExtractorError> =>
    Match.value(astEntityRef).pipe(
      Match.tag(
        'AstSymbolRef',
        (symbolRef) =>
          Effect.flatMap(astSymbolRecordOf(ref, symbolRef.symbolId), (astSymbol) => analyzeAstSymbol(ref, astSymbol)),
      ),
      Match.tag(
        'AstNamespaceImportRef',
        (namespaceRef) =>
          Effect.flatMap(
            namespaceImportRecordOf(ref, namespaceRef.symbolId),
            (astNamespaceImport) => analyzeAstNamespaceImport(ref, astNamespaceImport),
          ),
      ),
      Match.orElse(() => Effect.void),
    ),
)

export const astSymbolTable: IAstSymbolTable = { fetchAstSymbol, analyze }
