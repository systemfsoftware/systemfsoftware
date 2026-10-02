import { Data } from 'effect'
import * as Equivalence from 'effect/Equivalence'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import type { SymbolId } from '../TypeScriptInternals.js'
import type { AstImport } from './ast-import.js'
import type { AstNamespaceImport } from './ast-namespace-import.js'
import type { AstSymbol } from './ast-symbol.js'

export type AstEntity = AstSymbol | AstImport | AstNamespaceImport

export class AstSymbolRef extends Data.TaggedClass('AstSymbolRef')<{ readonly symbolId: SymbolId }> {}

export class AstImportRef extends Data.TaggedClass('AstImportRef')<{ readonly key: string }> {}

export class AstNamespaceImportRef extends Data.TaggedClass('AstNamespaceImportRef')<{
  readonly symbolId: SymbolId
}> {}

export type AstEntityRef = AstSymbolRef | AstImportRef | AstNamespaceImportRef

const refKeyOf = (ref: AstEntityRef): string =>
  Match.value(ref).pipe(
    Match.tag('AstSymbolRef', (symbolRef) => `AstSymbolRef:${symbolRef.symbolId}`),
    Match.tag('AstImportRef', (importRef) => `AstImportRef:${importRef.key}`),
    Match.tag('AstNamespaceImportRef', (namespaceRef) => `AstNamespaceImportRef:${namespaceRef.symbolId}`),
    Match.exhaustive,
  )

export const AstEntityRefEquivalence: {
  (that: AstEntityRef): (self: AstEntityRef) => boolean
  (self: AstEntityRef, that: AstEntityRef): boolean
} = dual(2, Equivalence.mapInput(Equivalence.String, refKeyOf))

export const refOf = (astEntity: AstEntity): AstEntityRef =>
  Match.value(astEntity).pipe(
    Match.tag('AstSymbol', (astSymbol) => new AstSymbolRef({ symbolId: astSymbol.followedSymbolId })),
    Match.tag('AstImport', (astImport) => new AstImportRef({ key: astImport.key })),
    Match.tag('AstNamespaceImport', (astNamespaceImport) =>
      new AstNamespaceImportRef({ symbolId: astNamespaceImport.symbolId })),
    Match.exhaustive,
  )

export const astSymbolOf = (astEntity: AstEntity): Option.Option<AstSymbol> =>
  Match.value(astEntity).pipe(
    Match.tag('AstSymbol', (astSymbol) => Option.some(astSymbol)),
    Match.orElse(() => Option.none()),
  )

export const astImportOf = (astEntity: AstEntity): Option.Option<AstImport> =>
  Match.value(astEntity).pipe(
    Match.tag('AstImport', (astImport) => Option.some(astImport)),
    Match.orElse(() => Option.none()),
  )

export const astNamespaceImportOf = (astEntity: AstEntity): Option.Option<AstNamespaceImport> =>
  Match.value(astEntity).pipe(
    Match.tag('AstNamespaceImport', (astNamespaceImport) => Option.some(astNamespaceImport)),
    Match.orElse(() => Option.none()),
  )
