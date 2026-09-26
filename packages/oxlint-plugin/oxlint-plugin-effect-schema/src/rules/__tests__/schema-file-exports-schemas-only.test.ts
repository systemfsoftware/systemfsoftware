import { createRuleTester } from './_tester.js'

import {
  CODEC_EXPORT_ACTUAL,
  CODEC_EXPORT_EXPECTED,
  CODEC_EXPORT_FIX,
  EFFECT_CARRIER_EXPORT_ACTUAL,
  EFFECT_CARRIER_EXPORT_EXPECTED,
  EFFECT_CARRIER_EXPORT_FIX,
  MISSING_ANNOTATION_EXPORT_ACTUAL,
  MISSING_ANNOTATION_EXPORT_EXPECTED,
  MISSING_ANNOTATION_EXPORT_FIX,
  NON_SCHEMA_EXPORT_ACTUAL,
  NON_SCHEMA_EXPORT_EXPECTED,
  NON_SCHEMA_EXPORT_FIX,
  REEXPORT_ACTUAL_TEMPLATE,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
} from '../schema-file-exports-schemas-only.config.js'
import { schemaFileExportsSchemasOnly } from '../schema-file-exports-schemas-only.js'

const ruleTester = createRuleTester()

const codecError = (name: string) => ({
  messageId: 'codecExport',
  data: { name, expected: CODEC_EXPORT_EXPECTED, actual: CODEC_EXPORT_ACTUAL, fix: CODEC_EXPORT_FIX },
})

const nonSchemaError = (name: string) => ({
  messageId: 'nonSchemaExport',
  data: {
    name,
    expected: NON_SCHEMA_EXPORT_EXPECTED,
    actual: NON_SCHEMA_EXPORT_ACTUAL,
    fix: NON_SCHEMA_EXPORT_FIX,
  },
})

const missingAnnotationError = (name: string) => ({
  messageId: 'missingAnnotationExport',
  data: {
    name,
    expected: MISSING_ANNOTATION_EXPORT_EXPECTED,
    actual: MISSING_ANNOTATION_EXPORT_ACTUAL,
    fix: MISSING_ANNOTATION_EXPORT_FIX,
  },
})

const effectCarrierError = (name: string) => ({
  messageId: 'effectCarrierExport',
  data: {
    name,
    expected: EFFECT_CARRIER_EXPORT_EXPECTED,
    actual: EFFECT_CARRIER_EXPORT_ACTUAL,
    fix: EFFECT_CARRIER_EXPORT_FIX,
  },
})

const reexportError = (source: string) => ({
  messageId: 'reexportFromSchemaFile',
  data: {
    name: 'a re-export',
    expected: REEXPORT_EXPECTED,
    actual: REEXPORT_ACTUAL_TEMPLATE.replace('{{source}}', source),
    fix: REEXPORT_FIX,
  },
})

const SCHEMA_FILE = '/repo/pkg/src/domain.schema.ts'

ruleTester.run('schema-file-exports-schemas-only', schemaFileExportsSchemasOnly, {
  valid: [
    {
      name: 'Should_Pass_When_SchemaFileExportsOnlySchemaDeclarations',
      code: `import { Schema } from 'effect'
export class E extends Schema.TaggedError<E>()('E', { message: Schema.String }) {}
export const U = Schema.Union([Schema.String, Schema.Number])
export const Us = Schema.Array(U).pipe(Schema.array(U))`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SchemaFileExportsTypeAliasesProjectingLocalSchemas',
      code: `import { Schema as S } from 'effect'
export const Tile = S.Struct({ x: S.Number, y: S.Number })
export type Tile = S.Schema.Type<typeof Tile>
export interface TileMeta { name: S.Schema.Type<typeof Tile> }`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SchemaFileExportsEnumsThatFormTheLiteralDomain',
      code: `import { Schema as S } from 'effect'
export enum TileKind { Floor = 'floor', Wall = 'wall' }
export const TileSchema = S.Struct({ kind: S.Literal(TileKind.Floor, TileKind.Wall) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SchemaFileExportsAnEnumThroughASpecifierList',
      code: `import { Schema as S } from 'effect'
enum Axis { X = 'x', Y = 'y' }
export { Axis }
export const Tile = S.Struct({ axis: S.Literal(Axis.X, Axis.Y) })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_NamespaceImportedSchemaVocabularyDerivesDeclarations',
      code: `import * as ESchema from 'effect/Schema'
export const U = ESchema.Union([ESchema.String, ESchema.Number])
export class Model extends ESchema.TaggedError<Model>()('Model', { message: ESchema.String }) {}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ALocalSchemaIsReexportedByName',
      code: `import { Schema } from 'effect'
const U = Schema.Union([Schema.String, Schema.Number])
export { U }
export { U as Vec }`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SchemaFileAliasesALocalSchemaThroughAName',
      code: `import { Schema as S } from 'effect'
const U = S.Struct({ a: S.String })
export const UAlias = U`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_DefaultExportIsASchema',
      code: `import { Schema as S } from 'effect'
export const Eq = S.Struct({ id: S.String })
export default Eq`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_UnexportedCodecConstLivesInASchemaFile',
      code: `import { Schema as S } from 'effect'
export const Envelope = S.Struct({ body: S.String })
const encode = S.encodeSync(Envelope)`,
      filename: SCHEMA_FILE,
    },
    {
      // A guard is a predicate over the shape declared beside it, not a boundary
      // operation on data: pure, allocated once, and deciding exactly this file's
      // vocabulary. Evicting it mints the same const one file over, or rebuilds
      // the guard on every call.
      name: 'Should_Pass_When_SchemaFileExportsAGuardDerivedFromItsOwnSchema',
      code: `import { Schema as S } from 'effect'
export const Edits = S.Array(S.Struct({ from: S.String }))
export const isEditArray = S.is(Edits)`,
      filename: SCHEMA_FILE,
    },
    {
      // The forward-declared slot is how a RECURSIVE schema has to be written: the
      // suspended members reference the union before it is constructed, so the
      // declaration carries the type and the assignment comes after them. There is
      // no initializer at the declaration, so the annotation is what says schema.
      // Reported instead of allowed, this rule would refuse every recursive schema
      // in the tree - `stryker-plugins/src/*/ast-node.schema.ts` are two of them.
      name: 'Should_Pass_When_ConstAliasesALateAssignedRecursiveSchemaSlot',
      code: `import { Schema as S } from 'effect'
let U: S.Schema<string>
export const Member = S.suspend((): S.Schema<string> => U)
U = S.String
export const UAlias = U`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_AliasedNamespaceImportDeclaresASchema',
      code: `import * as S_ from 'effect/Schema'
export const U = S_.Union([S_.String, S_.Number])`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_FileIsNotASchemaFile',
      code: `import { Schema as S } from 'effect'
export const encode = S.encodeSync(S.String)
export * from './other.js'
export { Tile } from './tile.schema.js'
export type { Tile as TileType } from './tile.schema.js'`,
      filename: '/repo/pkg/src/protocol.kernel.ts',
    },
    {
      name: 'Should_Pass_When_EmptySpecifierListHasNothingToJudge',
      code: `import { Schema as S } from 'effect'
export const U = S.Struct({ a: S.String })
export { }`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SchemaFileExportsAnOperationOverSameFileSchemas',
      code: `import { Schema as S } from 'effect'
export const LineStarts = S.Array(S.Number)
export type LineStarts = S.Schema.Type<typeof LineStarts>
export const Offset = S.Number
export type Offset = S.Schema.Type<typeof Offset>
export const Position = S.Struct({ line: S.Number, column: S.Number })
export type Position = S.Schema.Type<typeof Position>
export function positionAt(starts: LineStarts, offset: Offset): Position {
  return Position.make({ line: starts.length, column: offset })
}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OperationNamesOnlyItsSameFileReturnType',
      code: `import { Schema as S } from 'effect'
export const Position = S.Struct({ line: S.Number })
export type Position = S.Schema.Type<typeof Position>
export const origin = (line: number): Position => Position.make({ line })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OperationTakesASameFileUnionAlias',
      code: `import { Schema as S } from 'effect'
export const Circle = S.Struct({ radius: S.Number })
export const Square = S.Struct({ side: S.Number })
export type Shape = S.Schema.Type<typeof Circle> | S.Schema.Type<typeof Square>
export const area = (shape: Shape): number => shape`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OperationReturnsNonCarrierErrorData',
      code: `import { Schema as S } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
export const StatusLine = S.Struct({ code: S.Number, reason: S.String })
export type StatusLine = S.Schema.Type<typeof StatusLine>
export const failureOf = (line: StatusLine): PlatformError => {
  throw new Error(String(line))
}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OperationNamesAForwardDeclaredRecursiveSchema',
      code: `import { Schema as S } from 'effect'
let U: S.Schema<string>
export const Member = S.suspend((): S.Schema<string> => U)
U = S.String
export const describe = (value: U): string => String(value)`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OnlyTheSameFileParameterIsAnnotated',
      code: `import { Schema as S } from 'effect'
export const LineStarts = S.Array(S.Number)
export type LineStarts = S.Schema.Type<typeof LineStarts>
export const positionAt = (starts: LineStarts, offset) => starts[offset]`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OperationNamesASameFileInterface',
      code: `import { Schema as S } from 'effect'
export const LineStarts = S.Array(S.Number)
export type LineStarts = S.Schema.Type<typeof LineStarts>
export interface LineMap { readonly starts: LineStarts }
export const sizeOf = (map: LineMap): number => map.starts.length`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OperationNamesASameFileEnum',
      code: `import { Schema as S } from 'effect'
export enum Axis { X = 'x', Y = 'y' }
export const AxisSchema = S.Literal(Axis.X, Axis.Y)
export const labelOf = (axis: Axis): string => String(axis)`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OperationNamesASameFileSchemaClass',
      code: `import { Schema as S } from 'effect'
export class Position extends S.Class<Position>('Position')({ line: S.Number }) {}
export const originOf = (line: number): Position => Position.make({ line })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_DualOperationCarriesItsSignatureInADeclaratorAnnotation',
      code: `import { Schema as S } from 'effect'
import { dual } from 'effect/Function'
export const Box = S.Struct({ n: S.Number })
export type Box = S.Schema.Type<typeof Box>
export const getOrElse: {
  <B>(f: () => B): (self: Box) => number | B
  <B>(self: Box, f: () => B): number | B
} = dual(2, (self: Box, f: () => unknown) => self.n)`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_DeclaratorAnnotatedArrowNamesOnlyItsSameFileReturnType',
      code: `import { Schema as S } from 'effect'
import type { Count } from './count.schema.js'
export const Box = S.Struct({ n: S.Number })
export type Box = S.Schema.Type<typeof Box>
export const toBox: (n: Count) => Box = (n) => Box.make({ n })`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_OverloadedExportNamesASameFileType',
      code: `import { Schema as S } from 'effect'
export const Box = S.Struct({ n: S.Number })
export type Box = S.Schema.Type<typeof Box>
export function sizeOf(self: Box): number
export function sizeOf(self: Box, other: Box): number
export function sizeOf(self: Box, other?: Box): number { return self.n }`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_TypeOnlyNamespaceDeclaresVocabulary',
      code: `export declare namespace Result {
  interface Proto { readonly _tag: 'Proto' }
  type Success<R> = R
  namespace Failure { type Of<R> = R }
}`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_TypeIdentitySymbolIsExported',
      code: `export const TypeId: unique symbol = Symbol.for('~effect/reactivity/Result')`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_BareSymbolTypeIdentityIsExported',
      code: `export const TypeId = Symbol('~effect/reactivity/Result')`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_PredicateGuardNamesASameFileType',
      code: `export interface Result<A, E> { readonly _tag: 'Success' | 'Failure' }
export const isResult = (u: unknown): u is Result<unknown, unknown> => false`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_UnionReturnNamesTwoSameFileTypes',
      code: `export interface Success<A, E> { readonly _tag: 'Success' }
export interface Failure<A, E> { readonly _tag: 'Failure' }
export const fromExit = <A, E>(exit: unknown): Success<A, E> | Failure<A, E> => null as never`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ReturnTypeParameterConstraintIsSameFile',
      code: `export interface Result<A, E> { readonly _tag: 'Success' | 'Failure' }
export const waiting = <R extends Result<unknown, unknown>>(self: R): R => self`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_SameNameInterfaceAndConstBothExist',
      code: `interface Schema<A> { readonly _tag: 'Schema' }
const Schema = { make: () => null }
export const fromSchema = (self: Schema<unknown>): Schema<unknown> => self`,
      filename: SCHEMA_FILE,
    },
    {
      name: 'Should_Pass_When_ReadonlyArrayOfSameFileTypeIsAnnotated',
      code: `export interface Result<A, E> { readonly _tag: 'Success' | 'Failure' }
export const all = (xs: readonly Result<unknown, unknown>[]): readonly Result<unknown, unknown>[] => xs`,
      filename: SCHEMA_FILE,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_SchemaFileExportsACodecConst',
      code: `import { Schema as S } from 'effect'
export const decodeMessage = S.decodeUnknownSync(S.Literal('a', 'b'))`,
      filename: SCHEMA_FILE,
      errors: [codecError('decodeMessage')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsACodecMemberWithoutACall',
      code: `import { Schema } from 'effect'
export const encodeMessage = Schema.encodeSync`,
      filename: SCHEMA_FILE,
      errors: [codecError('encodeMessage')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsACodecBuiltFromALocalSchema',
      code: `import { Schema as S } from 'effect'
export const Envelope = S.Struct({ body: S.String })
export const decodeEnvelope = S.decodeUnknownSync(Envelope)`,
      filename: SCHEMA_FILE,
      errors: [codecError('decodeEnvelope')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsAnEncodeWithPipeChain',
      code: `import { Schema as S } from 'effect'
export const encodeJson = S.encodeSync(S.fromJsonString(S.Struct({ a: S.String })))`,
      filename: SCHEMA_FILE,
      errors: [codecError('encodeJson')],
    },
    {
      name: 'Should_Report_When_NamespaceImportedSchemaIsUsedAsACodec',
      code: `import * as S_ from 'effect/Schema'
export const decode = S_.decodeUnknownSync(S_.String)`,
      filename: SCHEMA_FILE,
      errors: [codecError('decode')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsAFunction',
      code: `export function normalize(value: string): string { return value.trim() }`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('normalize')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsAPlainClass',
      code: `export class Adapter { readonly kind = 'adapter' }`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('Adapter')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsAPlainConst',
      code: `export const VERSION = 1`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('VERSION')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsADestructuredBinding',
      code: `import { Schema as S } from 'effect'
const pair = S.Struct({ a: S.String, b: S.Number })
export const { a, b } = pair`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('an export')],
    },
    {
      name: 'Should_Report_When_SchemaFileStarReexports',
      code: `export * from './protocol.js'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('./protocol.js')],
    },
    {
      name: 'Should_Report_When_SchemaFileNamespacedStarReexports',
      code: `export * as legacy from './legacy.js'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('./legacy.js')],
    },
    {
      name: 'Should_Report_When_SchemaFileReexportsANamedBinding',
      code: `export { Envelope } from './envelope.schema.js'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('./envelope.schema.js')],
    },
    {
      name: 'Should_Report_When_SchemaFileReexportsWithRename',
      code: `export { Envelope as EnvelopeSchema } from './envelope.schema.js'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('./envelope.schema.js')],
    },
    {
      name: 'Should_Report_When_SchemaFileTypeOnlyReexports',
      code: `export type { Envelope } from './envelope.schema.js'`,
      filename: SCHEMA_FILE,
      errors: [reexportError('./envelope.schema.js')],
    },
    {
      name: 'Should_Report_When_SchemaFileReexportsAnImportedBindingByLocalName',
      code: `import { EnvelopeSchema } from './envelope.schema.js'
export { EnvelopeSchema }`,
      filename: SCHEMA_FILE,
      errors: [reexportError('the imported binding EnvelopeSchema')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsADefaultLiteral',
      code: `export default 42`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('a default export')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsADefaultPlainClass',
      code: `export default class Widget { readonly size = 2 }`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('Widget')],
    },
    {
      name: 'Should_Report_When_SchemaFileExportsADefaultArrowFunction',
      code: `export default (x: number) => x + 1`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('a default export')],
    },
    {
      name: 'Should_Report_EachOffenderInTheMotivatingShape',
      code: `import { Schema as S } from 'effect'
export const WorkerMessageSchema = S.Struct({ kind: S.Literal('request', 'response') })
export const encodeWorkerMessage = S.encodeSync(WorkerMessageSchema)
export const decodeWorkerMessage = S.decodeSync(WorkerMessageSchema)
export function flatten(): void {}
export { WorkerMessageSchema as WM } from './other.js'`,
      filename: '/repo/pkg/src/worker-pool/message-protocol.schema.ts',
      errors: [
        codecError('encodeWorkerMessage'),
        codecError('decodeWorkerMessage'),
        nonSchemaError('flatten'),
        reexportError('./other.js'),
      ],
    },
    {
      name: 'Should_Report_When_OperationNamesOnlyAForeignType',
      code: `import type { LineStarts } from './line-map.schema.js'
export const offsetOf = (starts: LineStarts, offset: number): number => offset`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('offsetOf')],
    },
    {
      name: 'Should_Report_When_OperationNamesOnlyASameFileValue',
      code: `class Adapter { readonly kind = 'adapter' }
export const useAdapter = (adapter: Adapter): string => adapter.kind`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('useAdapter')],
    },
    {
      name: 'Should_Report_When_ExportedArrowHasNoAnnotations',
      code: `export const parse = (raw) => raw`,
      filename: SCHEMA_FILE,
      errors: [missingAnnotationError('parse')],
    },
    {
      name: 'Should_Report_When_ExportedFunctionHasNoAnnotations',
      code: `export function parse(raw) { return raw }`,
      filename: SCHEMA_FILE,
      errors: [missingAnnotationError('parse')],
    },
    {
      name: 'Should_Report_When_OperationReturnsAnEffectCarrier',
      code: `import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
export const Position = S.Struct({ line: S.Number })
export type Position = S.Schema.Type<typeof Position>
export const positionAt = (offset: number): Effect.Effect<Position> => Effect.succeed(offset)`,
      filename: SCHEMA_FILE,
      errors: [effectCarrierError('positionAt')],
    },
    {
      name: 'Should_Report_When_OperationReturnsAStreamCarrier',
      code: `import { Schema as S } from 'effect'
import * as Stream from 'effect/Stream'
export const Position = S.Struct({ line: S.Number })
export type Position = S.Schema.Type<typeof Position>
export const positions = (offset: number): Stream.Stream<Position> => Stream.empty`,
      filename: SCHEMA_FILE,
      errors: [effectCarrierError('positions')],
    },
    {
      name: 'Should_Report_When_OperationReturnsALayerCarrier',
      code: `import { Schema as S } from 'effect'
import * as Layer from 'effect/Layer'
export const Position = S.Struct({ line: S.Number })
export type Position = S.Schema.Type<typeof Position>
export const positionLayer = (offset: number): Layer.Layer<Position> => Layer.empty`,
      filename: SCHEMA_FILE,
      errors: [effectCarrierError('positionLayer')],
    },
    {
      name: 'Should_Report_When_PrimitiveOnlyArrowKeepsTheBrandingRemedy',
      code: `export const ensureTrailingSeparator = (path: string): string => path`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('ensureTrailingSeparator')],
    },
    {
      name: 'Should_Report_When_DualOperationReturnsAnEffectCarrier',
      code: `import { Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
export const Box = S.Struct({ n: S.Number })
export type Box = S.Schema.Type<typeof Box>
export const getOrElse: {
  <B>(f: () => B): (self: Box) => Effect.Effect<number | B>
  <B>(self: Box, f: () => B): Effect.Effect<number | B>
} = dual(2, (self: Box, f: () => unknown) => Effect.succeed(self.n))`,
      filename: SCHEMA_FILE,
      errors: [effectCarrierError('getOrElse')],
    },
    {
      name: 'Should_Report_When_DualOperationNamesOnlyForeignAndPrimitiveTypes',
      code: `import { dual } from 'effect/Function'
import type { LineStarts } from './line-map.schema.js'
export const offsetOf: {
  (starts: LineStarts): number
  (starts: LineStarts, offset: number): number
} = dual(2, (starts: LineStarts, offset: number): number => offset)`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('offsetOf')],
    },
    {
      name: 'Should_Report_When_CallInitializerHasNoDeclaratorAnnotation',
      code: `import { dual } from 'effect/Function'
export const getOrElse = dual(2, (self: number, f: () => number) => self + f())`,
      filename: SCHEMA_FILE,
      errors: [missingAnnotationError('getOrElse')],
    },
    {
      name: 'Should_Report_When_NamespaceHoldsAValue',
      code: `export declare namespace N { const x: number }`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('N')],
    },
    {
      name: 'Should_Report_When_TypeIdentitySymbolTakesANonLiteralKey',
      code: `const key = '~x/Result'
export const TypeId: unique symbol = Symbol.for(key)`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('TypeId')],
    },
    {
      name: 'Should_Report_When_UnionReturnNamesAnEffectCarrierMember',
      code: `import * as Effect from 'effect/Effect'
export interface Success { readonly _tag: 'Success' }
export const of = (a: unknown): Success | Effect.Effect<unknown> => Effect.succeed(a)`,
      filename: SCHEMA_FILE,
      errors: [effectCarrierError('of')],
    },
    {
      name: 'Should_Report_When_PredicateGuardsAForeignType',
      code: `import type { Foo } from './foo.schema.js'
export const isFoo = (u: unknown): u is Foo => false`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('isFoo')],
    },
    {
      name: 'Should_Report_When_ConstraintCyclesBackToItsOwnParameter',
      code: `export const waiting = <R extends R>(self: R): R => self`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('waiting')],
    },
    {
      name: 'Should_Report_When_GenericContainerOfSameFileTypeIsNotUnwrapped',
      code: `export interface Result { readonly _tag: 'Success' }
export const all = (xs: ReadonlyArray<Result>): ReadonlyArray<Result> => xs`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('all')],
    },
  ],
})
