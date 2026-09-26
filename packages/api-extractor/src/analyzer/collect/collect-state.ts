import { Chunk, HashMap, HashSet, Option } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

import type { MessageLog } from '../../collector/message-log.js'
import { InternalInvariantError } from '../../errors/index.js'
import { ReleaseTag } from '../../model/index.js'
import { type AstEntityRef, AstEntityRefEquivalence } from '../graph/ast-entity.js'
import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import type { ApiItemMetadata } from './api-item-metadata.js'
import type { DeclarationMetadata } from './declaration-metadata.js'
import type { ModifierDraft } from './metadata-helpers.js'
import type { SymbolMetadata } from './symbol-metadata.js'

export const invariantDefect = (message: string): InternalInvariantError => new InternalInvariantError({ message })

export interface EntityDraft {
  readonly localName: string
  readonly nameForEmit: Option.Option<string>
  readonly exportedNames: Chunk.Chunk<string>
  readonly localExportNamesByParent: Chunk.Chunk<readonly [AstEntityRef, Chunk.Chunk<string>]>
}

export interface MetadataState {
  readonly log: MessageLog
  readonly entityByRef: HashMap.HashMap<AstEntityRef, EntityDraft>
  readonly symbolMetadataDone: HashSet.HashSet<SymbolId>
  readonly symbolMetadata: HashMap.HashMap<SymbolId, SymbolMetadata>
  readonly declarationMetadata: HashMap.HashMap<NodeId, DeclarationMetadata>
  readonly apiItemMetadata: HashMap.HashMap<NodeId, ApiItemMetadata>
}

export interface CollectState extends MetadataState {
  readonly entities: Chunk.Chunk<AstEntityRef>
  readonly entityBySymbolId: HashMap.HashMap<SymbolId, AstEntityRef>
  readonly dtsTypeReferenceDirectives: HashSet.HashSet<string>
  readonly dtsLibReferenceDirectives: HashSet.HashSet<string>
}

export interface WalkState {
  readonly state: CollectState
  readonly seen: HashSet.HashSet<AstEntityRef>
}

export interface EffectiveRelease {
  readonly state: CollectState
  readonly effectiveReleaseTag: ReleaseTag
  readonly releaseTagSameAsParent: boolean
}

export interface ModifiersResolved {
  readonly state: CollectState
  readonly draft: ModifierDraft
}

export interface UniqueNamesApplied {
  readonly state: CollectState
  readonly usedNames: HashSet.HashSet<string>
}

export const emptyDraft = (localName: string): EntityDraft => ({
  localName,
  nameForEmit: Option.none(),
  exportedNames: Chunk.empty(),
  localExportNamesByParent: Chunk.empty(),
})

export const viewsOf = (state: MetadataState) => (ref: AstEntityRef): Option.Option<EntityDraft> =>
  HashMap.get(state.entityByRef, ref)

export const describeRef = (ref: AstEntityRef): string =>
  Match.value(ref).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => 'AstSymbolRef:'.concat(String(symbolRef.symbolId))),
    Match.tag('AstImportRef', (importRef) => 'AstImportRef:'.concat(importRef.key)),
    Match.tag(
      'AstNamespaceImportRef',
      (namespaceRef) => 'AstNamespaceImportRef:'.concat(String(namespaceRef.symbolId)),
    ),
    Match.exhaustive,
  )

export const entitySymbolIdOf = (entityRef: AstEntityRef): Option.Option<SymbolId> =>
  Match.value(entityRef).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => Option.some(symbolRef.symbolId)),
    Match.tag('AstImportRef', () => Option.none<SymbolId>()),
    Match.tag('AstNamespaceImportRef', (namespaceRef) => Option.some(namespaceRef.symbolId)),
    Match.exhaustive,
  )

export const withEntityView = dual<
  (entityRef: AstEntityRef, view: EntityDraft) => (state: CollectState) => CollectState,
  (state: CollectState, entityRef: AstEntityRef, view: EntityDraft) => CollectState
>(3, (state: CollectState, entityRef: AstEntityRef, view: EntityDraft): CollectState => ({
  ...state,
  entityByRef: HashMap.set(state.entityByRef, entityRef, view),
}))

export const withExportName = dual<
  (
    view: EntityDraft,
    entityRef: AstEntityRef,
    exportName: Option.Option<string>,
    parentRef: Option.Option<AstEntityRef>,
  ) => (state: CollectState) => CollectState,
  (
    state: CollectState,
    view: EntityDraft,
    entityRef: AstEntityRef,
    exportName: Option.Option<string>,
    parentRef: Option.Option<AstEntityRef>,
  ) => CollectState
>(5, (
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
  }))

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
