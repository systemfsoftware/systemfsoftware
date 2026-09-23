import { Data, Match, Option } from 'effect'

import type { AstSymbolRef } from './ast-entity.js'

export const AstImportKind = {
  DefaultImport: 'DefaultImport',
  NamedImport: 'NamedImport',
  StarImport: 'StarImport',
  EqualsImport: 'EqualsImport',
  ImportType: 'ImportType',
} as const

export type AstImportKind = (typeof AstImportKind)[keyof typeof AstImportKind]

export interface IAstImportOptions {
  readonly importKind: AstImportKind
  readonly modulePath: string
  readonly exportName: string
  readonly isTypeOnly: boolean
}

export interface AstImportFields {
  readonly importKind: AstImportKind
  readonly modulePath: string
  readonly exportName: string
  readonly isTypeOnlyEverywhere: boolean
  readonly key: string
  readonly localName: string
  readonly astSymbolRef: Option.Option<AstSymbolRef>
}

export class AstImport extends Data.TaggedClass('AstImport')<AstImportFields> {}

const firstPathSegmentOf = (exportName: string): string => exportName.split('.')[0] ?? ''

const subKeyOf = (exportName: string): string =>
  Option.some(exportName).pipe(
    Option.filter((name) => name.length === 0),
    Option.map(() => '*'),
    Option.getOrElse(() =>
      Option.some(exportName).pipe(
        Option.filter((name) => name.includes('.')),
        Option.map(firstPathSegmentOf),
        Option.getOrElse(() => exportName),
      )
    ),
  )

export const astImportKeyOf = (options: IAstImportOptions): string =>
  Match.value(options.importKind).pipe(
    Match.when('DefaultImport', () => `${options.modulePath}:${options.exportName}`),
    Match.when('NamedImport', () => `${options.modulePath}:${options.exportName}`),
    Match.when('StarImport', () => `${options.modulePath}:*`),
    Match.when('EqualsImport', () => `${options.modulePath}:=`),
    Match.when('ImportType', () => `${options.modulePath}:${subKeyOf(options.exportName)}`),
    Match.exhaustive,
  )

export const astImportOf = (options: IAstImportOptions): AstImport =>
  new AstImport({
    importKind: options.importKind,
    modulePath: options.modulePath,
    exportName: options.exportName,
    isTypeOnlyEverywhere: options.isTypeOnly,
    key: astImportKeyOf(options),
    localName: options.exportName,
    astSymbolRef: Option.none(),
  })

const fieldsOf = (astImport: AstImport): AstImportFields => ({
  importKind: astImport.importKind,
  modulePath: astImport.modulePath,
  exportName: astImport.exportName,
  isTypeOnlyEverywhere: astImport.isTypeOnlyEverywhere,
  key: astImport.key,
  localName: astImport.localName,
  astSymbolRef: astImport.astSymbolRef,
})

export const withoutTypeOnlyEverywhere = (astImport: AstImport): AstImport =>
  new AstImport({ ...fieldsOf(astImport), isTypeOnlyEverywhere: false })

export const withAstSymbolRef = (astImport: AstImport, astSymbolRef: AstSymbolRef): AstImport =>
  new AstImport({ ...fieldsOf(astImport), astSymbolRef: Option.some(astSymbolRef) })
