import { Chunk, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import * as tsdoc from '@microsoft/tsdoc'
import { ExtractorMessageId } from '../../collector/extractor-message-id.js'
import { ReleaseTag } from '../../model/index.js'
import type { AnalysisGraph } from '../graph/analysis-graph.js'
import type { AstEntityRef } from '../graph/ast-entity.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import type { CollectedAnalysis } from './collect-analysis.js'
import type { CollectorEntity } from './collector-entity.js'
import {
  apiItemMetadataOf,
  declarationIdsOfSymbol,
  declarationsOfIds,
  declarationsPreOrder,
  entityOfRef,
  entityOfSymbolId,
  includeForgottenExports,
  isExternalSymbol,
  issueForDeclaration,
  issueForSymbol,
  isWarned,
  localNameOfDeclarationId,
  localNameOfRef,
  localNameOfSymbolId,
  moduleExportInfoOf,
  namespaceImportOf,
  nodeKindOf,
  nodeOf,
  parentSymbolIdOf,
  referencedEntitiesOf,
  symbolMetadataOf,
  symbolOf,
} from './enhancement-view.js'
import { ensureApiItemMetadata, ensureSymbolMetadata } from './metadata-ensure.js'

interface ValidationState {
  readonly collected: CollectedAnalysis
  readonly warned: HashSet.HashSet<AstEntityRef>
}

interface ReferencedEntityCheck {
  readonly collectorEntity: Option.Option<CollectorEntity>
  readonly referencedReleaseTag: ReleaseTag
  readonly localName: string
}

interface ReleaseTagScan {
  readonly mixed: boolean
  readonly onlyFunctionOverloads: boolean
  readonly anyInternal: boolean
}

const zeroScan: ReleaseTagScan = { mixed: false, onlyFunctionOverloads: true, anyInternal: false }

const effectiveReleaseTagOf = (collected: CollectedAnalysis, declarationId: NodeId): ReleaseTag =>
  Option.match(apiItemMetadataOf(collected, declarationId), {
    onNone: () => ReleaseTag.None,
    onSome: (metadata) => metadata.effectiveReleaseTag,
  })

const isFunctionOverloadKind = (graph: AnalysisGraph, declarationId: NodeId): boolean =>
  Arr.some(
    [ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.MethodDeclaration],
    (kind) => Option.contains(nodeKindOf(graph, declarationId), kind),
  )

const logicalOr = (left: boolean, right: boolean): boolean => left || right

const nextScan = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  declarationId: NodeId,
  expected: ReleaseTag,
  scan: ReleaseTagScan,
): ReleaseTagScan => {
  const effective = effectiveReleaseTagOf(collected, declarationId)
  return {
    mixed: logicalOr(effective !== expected, scan.mixed),
    onlyFunctionOverloads: scan.onlyFunctionOverloads && isFunctionOverloadKind(graph, declarationId),
    anyInternal: logicalOr(effective === ReleaseTag.Internal, scan.anyInternal),
  }
}

const exportedLocalNameOf = (collectorEntity: Option.Option<CollectorEntity>, fallback: string): string =>
  Option.match(collectorEntity, {
    onNone: () => fallback,
    onSome: (entity) =>
      Option.match(entity.nameForEmit, {
        onNone: () => fallback,
        onSome: (name) =>
          Match.value(name === '').pipe(
            Match.when(true, () => fallback),
            Match.when(false, () => name),
            Match.exhaustive,
          ),
      }),
  })

interface ReferencedCheckOutcome {
  readonly collected: CollectedAnalysis
  readonly check: Option.Option<ReferencedEntityCheck>
}

const maxEffectiveReleaseTagOf = (collected: CollectedAnalysis, symbolId: SymbolId): ReleaseTag =>
  Option.match(symbolMetadataOf(collected, symbolId), {
    onNone: () => ReleaseTag.None,
    onSome: (metadata) => metadata.maxEffectiveReleaseTag,
  })

const referencedCheckOf = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  collected: CollectedAnalysis,
  referencedEntity: AstEntityRef,
): ReferencedCheckOutcome =>
  Match.value(referencedEntity).pipe(
    Match.tag('AstSymbolRef', (symbolRef): ReferencedCheckOutcome =>
      Option.match(symbolOf(graph, symbolRef.symbolId), {
        onNone: () => ({ collected, check: Option.none() }),
        onSome: (referencedSymbol) =>
          Match.value(isExternalSymbol(graph, referencedSymbol.rootAstSymbolId)).pipe(
            Match.when(true, () => ({ collected, check: Option.none<ReferencedEntityCheck>() })),
            Match.when(false, () => {
              const withReferenced = ensureSymbolMetadata(collected, graph, parser, symbolRef.symbolId)
              const collectorEntity = entityOfSymbolId(withReferenced, referencedSymbol.rootAstSymbolId)
              return {
                collected: withReferenced,
                check: Option.some({
                  collectorEntity,
                  referencedReleaseTag: maxEffectiveReleaseTagOf(withReferenced, symbolRef.symbolId),
                  localName: exportedLocalNameOf(
                    collectorEntity,
                    localNameOfSymbolId(graph, referencedSymbol.rootAstSymbolId),
                  ),
                }),
              }
            }),
            Match.exhaustive,
          ),
      })),
    Match.tag('AstNamespaceImportRef', (): ReferencedCheckOutcome => {
      const collectorEntity = entityOfRef(collected, referencedEntity)
      return {
        collected,
        check: Option.some({
          collectorEntity,
          referencedReleaseTag: ReleaseTag.Public,
          localName: exportedLocalNameOf(
            collectorEntity,
            Option.getOrElse(localNameOfRef(graph, referencedEntity), () => ''),
          ),
        }),
      }
    }),
    Match.orElse((): ReferencedCheckOutcome => ({ collected, check: Option.none() })),
  )

const entryPointFilenameOf = (graph: AnalysisGraph): string =>
  Option.match(graph.workingPackage, {
    onNone: () => '',
    onSome: (workingPackage) =>
      Option.getOrElse(
        Arr.last(workingPackage.entryPointSourceFile.fileName.split('/')),
        () => '',
      ),
  })

const typeNodeHasSymbolKeyword = (declaration: ts.VariableDeclaration): boolean =>
  Option.match(Option.fromUndefinedOr(declaration.type), {
    onNone: () => false,
    onSome: (typeNode) => Arr.some(typeNode.getChildren(), (token) => token.kind === ts.SyntaxKind.SymbolKeyword),
  })

const isUniqueSymbolDeclaration = (graph: AnalysisGraph, declarationId: NodeId): boolean =>
  Option.match(nodeOf(graph, declarationId), {
    onNone: () => false,
    onSome: (node) =>
      Option.match(Option.filter(Option.some(node), ts.isVariableDeclaration), {
        onNone: () => false,
        onSome: (declaration) => typeNodeHasSymbolKeyword(declaration),
      }),
  })

const isEcmaScriptSymbol = (graph: AnalysisGraph, symbolId: SymbolId): boolean =>
  Match.value(Chunk.size(declarationIdsOfSymbol(graph, symbolId)) === 1).pipe(
    Match.when(false, () => false),
    Match.when(
      true,
      () =>
        Option.match(
          Arr.head(Chunk.toReadonlyArray(declarationsOfIds(graph, declarationIdsOfSymbol(graph, symbolId)))),
          {
            onNone: () => false,
            onSome: (astDeclaration) => isUniqueSymbolDeclaration(graph, astDeclaration.declarationId),
          },
        ),
    ),
    Match.exhaustive,
  )

const isEcmaScriptSymbolRef = (graph: AnalysisGraph, referencedEntity: AstEntityRef): boolean =>
  Match.value(referencedEntity).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => isEcmaScriptSymbol(graph, symbolRef.symbolId)),
    Match.orElse(() => false),
  )

const checkIncompatible = (
  graph: AnalysisGraph,
  state: ValidationState,
  declarationId: NodeId,
  declarationReleaseTag: ReleaseTag,
  check: ReferencedEntityCheck,
): ValidationState =>
  Match.value(ReleaseTag.compare(declarationReleaseTag, check.referencedReleaseTag) > 0).pipe(
    Match.when(false, () => state),
    Match.when(true, () => ({
      ...state,
      collected: issueForDeclaration(
        state.collected,
        graph,
        ExtractorMessageId.IncompatibleReleaseTags,
        'The symbol "' + localNameOfDeclarationId(graph, declarationId) +
          '" is marked as ' + ReleaseTag.getTagName(declarationReleaseTag) +
          ', but its signature references "' + check.localName +
          '" which is marked as ' + ReleaseTag.getTagName(check.referencedReleaseTag),
        declarationId,
        undefined,
      ),
    })),
    Match.exhaustive,
  )

const warnForgottenExport = (
  graph: AnalysisGraph,
  state: ValidationState,
  declarationId: NodeId,
  referencedEntity: AstEntityRef,
  localName: string,
): ValidationState =>
  Match.value(isWarned(state.warned, referencedEntity)).pipe(
    Match.when(true, () => state),
    Match.when(false, () => {
      const marked: ValidationState = { ...state, warned: HashSet.add(state.warned, referencedEntity) }
      return Match.value(isEcmaScriptSymbolRef(graph, referencedEntity)).pipe(
        Match.when(true, () => marked),
        Match.when(false, () => ({
          ...marked,
          collected: issueForDeclaration(
            marked.collected,
            graph,
            ExtractorMessageId.ForgottenExport,
            'The symbol "' + localName + '" needs to be exported by the entry point ' + entryPointFilenameOf(graph),
            declarationId,
            undefined,
          ),
        })),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )

const checkReference = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  state: ValidationState,
  declarationId: NodeId,
  declarationReleaseTag: ReleaseTag,
  referencedEntity: AstEntityRef,
): ValidationState => {
  const outcome = referencedCheckOf(graph, parser, state.collected, referencedEntity)
  const seeded: ValidationState = { ...state, collected: outcome.collected }
  return Option.match(outcome.check, {
    onNone: () => seeded,
    onSome: (check) =>
      Option.match(check.collectorEntity, {
        onSome: (collectorEntity) =>
          Match.value(collectorEntity.consumable).pipe(
            Match.when(true, () => checkIncompatible(graph, seeded, declarationId, declarationReleaseTag, check)),
            Match.when(
              false,
              () => warnForgottenExport(graph, seeded, declarationId, referencedEntity, check.localName),
            ),
            Match.exhaustive,
          ),
        onNone: () => warnForgottenExport(graph, seeded, declarationId, referencedEntity, check.localName),
      }),
  })
}

const checkReferences = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  state: ValidationState,
  declarationId: NodeId,
): ValidationState => {
  const ensured = ensureApiItemMetadata(state.collected, graph, parser, declarationId)
  const seeded: ValidationState = { ...state, collected: ensured.collected }
  return Option.match(ensured.metadata, {
    onNone: () => seeded,
    onSome: (metadata) =>
      Arr.reduce(
        Chunk.toReadonlyArray(referencedEntitiesOf(graph, declarationId)),
        seeded,
        (current, referencedEntity) =>
          checkReference(graph, parser, current, declarationId, metadata.effectiveReleaseTag, referencedEntity),
      ),
  })
}

const checkReferencesOfSymbol = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  state: ValidationState,
  symbolId: SymbolId,
): ValidationState =>
  Arr.reduce(
    Chunk.toReadonlyArray(declarationsPreOrder(graph, declarationIdsOfSymbol(graph, symbolId))),
    state,
    (current, astDeclaration) => checkReferences(graph, parser, current, astDeclaration.declarationId),
  )

const warnUnderscore = (
  graph: AnalysisGraph,
  state: ValidationState,
  entity: CollectorEntity,
  symbolId: SymbolId,
): ValidationState => ({
  collected: Arr.reduce(
    Chunk.toReadonlyArray(entity.exportedNames),
    state.collected,
    (collected, exportName) =>
      Match.value(exportName.startsWith('_')).pipe(
        Match.when(true, () => collected),
        Match.when(false, () =>
          issueForSymbol(
            collected,
            graph,
            ExtractorMessageId.InternalMissingUnderscore,
            'The name "' + exportName + '" should be prefixed with an underscore' +
              ' because the declaration is marked as @internal',
            symbolId,
            { exportName },
          )),
        Match.exhaustive,
      ),
  ),
  warned: state.warned,
})

const internalParentMask = (collected: CollectedAnalysis, symbolId: SymbolId): boolean =>
  Option.match(symbolMetadataOf(collected, symbolId), {
    onNone: () => false,
    onSome: (symbolMetadata) => symbolMetadata.maxEffectiveReleaseTag > ReleaseTag.Internal,
  })

const needsUnderscoreOf = (
  graph: AnalysisGraph,
  collected: CollectedAnalysis,
  symbolId: SymbolId,
  maxEffectiveReleaseTag: ReleaseTag,
): boolean =>
  Match.value(maxEffectiveReleaseTag === ReleaseTag.Internal).pipe(
    Match.when(false, () => false),
    Match.when(true, () =>
      Option.match(parentSymbolIdOf(graph, symbolId), {
        onNone: () => true,
        onSome: () => internalParentMask(collected, symbolId),
      })),
    Match.exhaustive,
  )

const checkForInternalUnderscore = (
  graph: AnalysisGraph,
  state: ValidationState,
  entity: CollectorEntity,
  symbolId: SymbolId,
): ValidationState =>
  Option.match(symbolMetadataOf(state.collected, symbolId), {
    onNone: () => state,
    onSome: (symbolMetadata) =>
      Match.value(needsUnderscoreOf(graph, state.collected, symbolId, symbolMetadata.maxEffectiveReleaseTag)).pipe(
        Match.when(false, () => state),
        Match.when(true, () => warnUnderscore(graph, state, entity, symbolId)),
        Match.exhaustive,
      ),
  })

const shouldReportDifferentTags = (scan: ReleaseTagScan): boolean => scan.mixed && !scan.onlyFunctionOverloads

const shouldReportInternalMixed = (scan: ReleaseTagScan): boolean => scan.mixed && scan.anyInternal

const reportMixedReleaseTags = (
  graph: AnalysisGraph,
  state: ValidationState,
  symbolId: SymbolId,
  expected: ReleaseTag,
): ValidationState => {
  const scan = Arr.reduce(
    Chunk.toReadonlyArray(declarationsOfIds(graph, declarationIdsOfSymbol(graph, symbolId))),
    zeroScan,
    (current, declaration) => nextScan(graph, state.collected, declaration.declarationId, expected, current),
  )
  const mixedState = Match.value(shouldReportDifferentTags(scan)).pipe(
    Match.when(true, () =>
      issueForSymbol(
        state.collected,
        graph,
        ExtractorMessageId.DifferentReleaseTags,
        'This symbol has another declaration with a different release tag',
        symbolId,
        undefined,
      )),
    Match.when(false, () => state.collected),
    Match.exhaustive,
  )
  const internalState = Match.value(shouldReportInternalMixed(scan)).pipe(
    Match.when(true, () =>
      issueForSymbol(
        mixedState,
        graph,
        ExtractorMessageId.InternalMixedReleaseTag,
        'Mixed release tags are not allowed for "' + localNameOfSymbolId(graph, symbolId) +
          '" because one of its declarations is marked as @internal',
        symbolId,
        undefined,
      )),
    Match.when(false, () => mixedState),
    Match.exhaustive,
  )
  return { collected: internalState, warned: state.warned }
}

const checkForInconsistentReleaseTags = (
  graph: AnalysisGraph,
  state: ValidationState,
  symbolId: SymbolId,
): ValidationState =>
  Option.match(symbolMetadataOf(state.collected, symbolId), {
    onNone: () => state,
    onSome: (symbolMetadata) =>
      Match.value(isExternalSymbol(graph, symbolId)).pipe(
        Match.when(true, () => state),
        Match.when(false, () => reportMixedReleaseTags(graph, state, symbolId, symbolMetadata.maxEffectiveReleaseTag)),
        Match.exhaustive,
      ),
  })

const validateSymbolEntity = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  state: ValidationState,
  entity: CollectorEntity,
  symbolId: SymbolId,
): ValidationState => {
  const referenced = checkReferencesOfSymbol(graph, parser, state, symbolId)
  const withSymbolMetadata: ValidationState = {
    ...referenced,
    collected: ensureSymbolMetadata(referenced.collected, graph, parser, symbolId),
  }
  const underscored = checkForInternalUnderscore(graph, withSymbolMetadata, entity, symbolId)
  return checkForInconsistentReleaseTags(graph, underscored, symbolId)
}

const validateNamespaceMember = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  state: ValidationState,
  memberRef: AstEntityRef,
): ValidationState =>
  Match.value(memberRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => {
      const referenced = checkReferencesOfSymbol(graph, parser, state, symbolRef.symbolId)
      const withSymbolMetadata: ValidationState = {
        ...referenced,
        collected: ensureSymbolMetadata(referenced.collected, graph, parser, symbolRef.symbolId),
      }
      return checkForInconsistentReleaseTags(graph, withSymbolMetadata, symbolRef.symbolId)
    }),
    Match.orElse(() => state),
  )

const validateNamespaceEntity = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  state: ValidationState,
  symbolId: SymbolId,
): ValidationState =>
  Option.match(namespaceImportOf(graph, symbolId), {
    onNone: () => state,
    onSome: (record) =>
      Option.match(moduleExportInfoOf(graph, record.astModuleId), {
        onNone: () => state,
        onSome: (exportInfo) =>
          Arr.reduce(
            Chunk.toReadonlyArray(exportInfo.exportedLocalEntities),
            state,
            (current, entry) => validateNamespaceMember(graph, parser, current, entry[1]),
          ),
      }),
  })

const validateEntity = (
  graph: AnalysisGraph,
  parser: tsdoc.TSDocParser,
  state: ValidationState,
  entity: CollectorEntity,
): ValidationState =>
  Match.value(entity.astEntity).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => validateSymbolEntity(graph, parser, state, entity, symbolRef.symbolId)),
    Match.tag('AstNamespaceImportRef', (namespaceRef) =>
      validateNamespaceEntity(graph, parser, state, namespaceRef.symbolId)),
    Match.orElse(() =>
      state
    ),
  )

export const validateAnalysis = dual<
  (graph: AnalysisGraph) => (collected: CollectedAnalysis) => CollectedAnalysis,
  (collected: CollectedAnalysis, graph: AnalysisGraph) => CollectedAnalysis
>(2, (collected: CollectedAnalysis, graph: AnalysisGraph): CollectedAnalysis => {
  const parser = new tsdoc.TSDocParser(graph.tsdocConfiguration)
  return Arr.reduce(
    Chunk.toReadonlyArray(collected.entities),
    { collected, warned: HashSet.empty<AstEntityRef>() },
    (state, entity) =>
      Match.value(entity.consumable || includeForgottenExports(graph)).pipe(
        Match.when(false, () => state),
        Match.when(true, () => validateEntity(graph, parser, state, entity)),
        Match.exhaustive,
      ),
  ).collected
})
