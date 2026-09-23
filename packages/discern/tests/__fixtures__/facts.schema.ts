import { Schema } from 'effect'

export const Facts = Schema.Record(Schema.String, Schema.Json)
export type FactSet = typeof Facts.Type
