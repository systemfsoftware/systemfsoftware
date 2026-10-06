import { Array as Arr, Match, Option, Schema, SchemaAST } from 'effect'
import type * as JsonSchema from 'effect/JsonSchema'
import type { Access } from '../Contract/access.schema.js'
import type { Any } from '../Contract/contract.js'
import type { Egress } from '../Contract/egress.schema.js'
import type { Exposure } from '../Contract/exposure.schema.js'

export type JsonSchemaDocument = JsonSchema.Document<'draft-2020-12'>

export interface Entry {
  readonly name: string
  readonly description: string
  readonly access: Access
  readonly exposure: Exposure
  readonly egress: Egress
  readonly links: ReadonlyArray<string>
  readonly refusalTags: ReadonlyArray<string>
  readonly input: JsonSchemaDocument
  readonly output: JsonSchemaDocument
  readonly refusals: JsonSchemaDocument
}

export interface CapabilityView {
  readonly contract: Any
}

export type CapabilityRecord = { readonly [name: string]: CapabilityView }

export type Catalog = { readonly [name: string]: Entry }

const isTagProperty = (name: PropertyKey): boolean => String(name) === '_tag'

const isText = (value: unknown): value is string => typeof value === 'string'

const literalTag = (ast: SchemaAST.AST): Option.Option<string> =>
  Match.value(ast).pipe(
    Match.when(SchemaAST.isLiteral, (literal) => Option.liftPredicate(isText)(literal.literal)),
    Match.orElse(() => Option.none()),
  )

const structTag = (ast: SchemaAST.Objects): Option.Option<string> =>
  Arr.findFirst(ast.propertySignatures, (property) => isTagProperty(property.name)).pipe(
    Option.flatMap((property) => literalTag(property.type)),
  )

const variantTag = (ast: SchemaAST.AST): Option.Option<string> =>
  Match.value(ast).pipe(
    Match.when(SchemaAST.isDeclaration, (declaration) =>
      Arr.head(declaration.typeParameters).pipe(Option.flatMap(variantTag))),
    Match.when(SchemaAST.isObjects, structTag),
    Match.when(SchemaAST.isSuspend, (suspend) =>
      variantTag(suspend.thunk())),
    Match.orElse(() => Option.none()),
  )

const refusalTagsOf = (refusals: Schema.Constraint): ReadonlyArray<string> =>
  Match.value(refusals.ast).pipe(
    Match.when(SchemaAST.isUnion, (union) => Arr.getSomes(Arr.map(union.types, variantTag))),
    Match.orElse((ast) => Arr.getSomes([variantTag(ast)])),
  )

const entryOf = (contract: Any): Entry => ({
  name: contract.name,
  description: contract.description,
  access: contract.access,
  exposure: contract.exposure,
  egress: contract.egress,
  links: contract.links,
  refusalTags: refusalTagsOf(contract.refusals),
  input: Schema.toJsonSchemaDocument(contract.input),
  output: Schema.toJsonSchemaDocument(contract.output),
  refusals: Schema.toJsonSchemaDocument(contract.refusals),
})

export const catalog = (capabilities: CapabilityRecord): Catalog =>
  Object.fromEntries(
    Object.values(capabilities).map(
      (capability): readonly [string, Entry] => [capability.contract.name, entryOf(capability.contract)],
    ),
  )
