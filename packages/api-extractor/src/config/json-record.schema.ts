import { Schema } from 'effect'

export const JsonRecord = Schema.Record(Schema.String, Schema.Json)
export type JsonRecord = typeof JsonRecord.Type

export const JsonRecordFromString = Schema.fromJsonString(JsonRecord)
export type JsonRecordFromString = typeof JsonRecordFromString.Type

export const JsonUnknownFromString = Schema.fromJsonString(Schema.Json)
export type JsonUnknownFromString = typeof JsonUnknownFromString.Type
