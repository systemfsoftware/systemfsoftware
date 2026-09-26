import { Schema } from 'effect'

/**
 * A JSON object as the configuration files carry it: `Schema.Json` minus the non-object arms,
 * decoded with `Schema.decodeTo` below. It is the shape the read phase's parser produces, so a
 * config record is never cast into place.
 */
export const JsonRecord = Schema.Record(Schema.String, Schema.Json)
export type JsonRecord = typeof JsonRecord.Type

/** A configuration file's text, decoded into the record the extends chain merges. */
export const JsonRecordFromString = Schema.fromJsonString(JsonRecord)
export type JsonRecordFromString = typeof JsonRecordFromString.Type
