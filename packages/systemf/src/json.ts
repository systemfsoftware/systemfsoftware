import { Schema } from 'effect'
import { Response } from './contract/result.js'

export * from './contract/result.js'

/** Decode one `systemf --json` response — a success envelope or an error envelope. */
export const decodeResponse = <Input>(input: Input) => Schema.decodeUnknownEffect(Response)(input)
