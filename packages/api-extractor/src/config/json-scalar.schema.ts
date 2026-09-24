import { Schema } from 'effect'

export const JsonScalar = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Null])
export type JsonScalar = typeof JsonScalar.Type

export const JsonScalarFromString = Schema.fromJsonString(JsonScalar)
export type JsonScalarFromString = typeof JsonScalarFromString.Type
