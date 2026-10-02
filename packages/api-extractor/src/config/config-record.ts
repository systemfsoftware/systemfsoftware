import { Match } from 'effect'
import type { Schema } from 'effect'

export const isConfigRecord = (u: Schema.Json | undefined): u is Record<string, Schema.Json> =>
  Match.value({ object: typeof u === 'object', nonNull: u !== null, list: Array.isArray(u) }).pipe(
    Match.when({ object: true, nonNull: true, list: false }, () => true),
    Match.orElse(() => false),
  )
