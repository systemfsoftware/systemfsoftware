import { Schema } from 'effect'

export const atLeastOne = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))
