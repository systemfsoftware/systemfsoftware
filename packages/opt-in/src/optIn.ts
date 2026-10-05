import { Schema } from 'effect'
import type { Result } from 'effect/Result'
import type { SchemaError } from 'effect/Schema'
import type { Raw } from './json.js'
import { OptIn } from './OptIn.schema.js'

export const optIn = (input: Raw): Result<OptIn, SchemaError> => Schema.decodeUnknownResult(OptIn)(input)
