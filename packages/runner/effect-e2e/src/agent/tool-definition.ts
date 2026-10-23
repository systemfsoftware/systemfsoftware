import * as JsonSchema from 'effect/JsonSchema'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

import type { ToolDefinition } from '../model/model.schema.js'

const DEFS_PREFIX = '#/$defs/'

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject => Predicate.isObject(value)

const definitionNamed = (definitions: JsonSchema.Definitions, ref: string): Option.Option<Schema.JsonObject> =>
  Match.value(ref.startsWith(DEFS_PREFIX)).pipe(
    Match.when(true, () => Schema.decodeUnknownOption(Schema.JsonObject)(definitions[ref.slice(DEFS_PREFIX.length)])),
    Match.when(false, () => Option.none()),
    Match.exhaustive,
  )

const refDefinitionOf = (
  definitions: JsonSchema.Definitions,
  ref: Schema.Json | undefined,
): Option.Option<Schema.JsonObject> =>
  Option.flatMap(
    Match.value(ref).pipe(
      Match.when(Predicate.isString, (value) => Option.some(value)),
      Match.orElse(() => Option.none()),
    ),
    (value) => definitionNamed(definitions, value),
  )

const withoutRef = (record: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== '$ref'))

const mergedRecordOf = (definition: Schema.JsonObject, record: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries([...Object.entries(definition), ...Object.entries(record)])

const resolvedRecordOf = (definitions: JsonSchema.Definitions, record: Schema.JsonObject): Schema.JsonObject =>
  Option.match(refDefinitionOf(definitions, record['$ref']), {
    onNone: () => record,
    onSome: (definition) => mergedRecordOf(definition, withoutRef(record)),
  })

const recordInlinedOf = (definitions: JsonSchema.Definitions, record: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries(
    Object.entries(resolvedRecordOf(definitions, record)).map(([key, value]) => [key, inlinedOf(definitions, value)]),
  )

const inlinedOf = (definitions: JsonSchema.Definitions, node: Schema.Json): Schema.Json =>
  Match.value(node).pipe(
    Match.when(isJsonArray, (items) => items.map((item) => inlinedOf(definitions, item))),
    Match.when(isJsonObject, (record) => recordInlinedOf(definitions, record)),
    Match.orElse((leaf) => leaf),
  )

const inlinedObjectOf = (
  definitions: JsonSchema.Definitions,
  node: Schema.JsonObject,
): Option.Option<Schema.JsonObject> =>
  Match.value(inlinedOf(definitions, node)).pipe(
    Match.when(isJsonObject, (record) => Option.some(mergedRecordOf({ type: 'object' }, record))),
    Match.orElse(() => Option.none()),
  )

const toolParametersOf = (args: Schema.Constraint): Option.Option<Schema.JsonObject> => {
  const document = Schema.toJsonSchemaDocument(args)
  return Option.flatMap(
    Schema.decodeUnknownOption(Schema.JsonObject)(document.schema),
    (schema) => inlinedObjectOf(document.definitions, schema),
  )
}

export const toolDefinitionOf = (tool: {
  readonly name: string
  readonly description: string
  readonly arguments: Schema.Constraint
}): Option.Option<ToolDefinition> =>
  Option.map(toolParametersOf(tool.arguments), (parameters) => ({
    name: tool.name,
    description: tool.description,
    parameters,
  }))
