import { Schema } from 'effect'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaTransformation from 'effect/SchemaTransformation'

import { rebuildJson } from './json-text.js'

const validateJson = SchemaGetter.parseJson<string>()

const parseJsonText: SchemaGetter.Getter<Schema.Json, string> = SchemaGetter.transformEffect(
  (text: string, options) =>
    Effect.flatMap(
      SchemaGetter.run(validateJson, Option.some(text), options),
      () =>
        Effect.mapError(
          Effect.fromOption(rebuildJson(text)),
          () => new SchemaIssue.InvalidValue({ expected: 'a valid JSON string' }, text, options),
        ),
    ),
)

export const JsonRecord = Schema.Record(Schema.String, Schema.Json)
export type JsonRecord = typeof JsonRecord.Type

export const JsonRecordFromString = Schema.String.annotate({
  expected: 'a string that will be decoded as JSON',
  contentMediaType: 'application/json',
}).pipe(
  Schema.decodeTo(
    Schema.Json,
    SchemaTransformation.makeTransformation({ decode: parseJsonText, encode: SchemaGetter.stringifyJson() }),
  ),
  Schema.decodeTo(JsonRecord, SchemaTransformation.passthroughSupertype()),
)
export type JsonRecordFromString = typeof JsonRecordFromString.Type
