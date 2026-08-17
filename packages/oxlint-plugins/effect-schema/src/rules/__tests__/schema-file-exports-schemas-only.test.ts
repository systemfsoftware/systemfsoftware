import { createRuleTester } from './_tester.js'

import {
  CODEC_EXPORT_ACTUAL,
  CODEC_EXPORT_EXPECTED,
  CODEC_EXPORT_FIX,
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
      name: 'Should_Report_When_SchemaFileExportsAnArbitraryBuiltFromALocalSchema',
      code: `import { Schema as S } from 'effect'
export const Envelope = S.Struct({ body: S.String })
export const envelopeArb = S.toArbitrary(Envelope)`,
      filename: SCHEMA_FILE,
      errors: [codecError('envelopeArb')],
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
      name: 'Should_Report_When_ConstAliasesALateAssignedSchemaSlot',
      code: `import { Schema as S } from 'effect'
let U: S.Schema<string>
U = S.String
export const UAlias = U`,
      filename: SCHEMA_FILE,
      errors: [nonSchemaError('UAlias')],
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
  ],
})
