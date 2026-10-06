import { Schema } from 'effect'

export const jsonCodecOf = <S extends Schema.Constraint>(schema: S) => Schema.fromJsonString(Schema.toCodecJson(schema))
