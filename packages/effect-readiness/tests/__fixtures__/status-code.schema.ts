import { Schema } from 'effect'

export const StatusCode = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 100, maximum: 599 })))
export type StatusCode = typeof StatusCode.Type
