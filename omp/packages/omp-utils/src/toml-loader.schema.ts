/**
 * Schema: TOML config — the inner vocabulary of `systemfsoftware.toml`.
 *
 * Shape: a record of string key to string array. The only consumer of the inner
 * keys is the agent-discipline plugin (it reads `no_delegate_skills`); other
 * plugins may add their own keys without this schema changing. Branding makes
 * a parsed config distinguishable from a raw record and surfaces shape errors
 * through the loader's parse path.
 *
 * Pure declaration. No behavior, no `@std/toml`, no I/O. The ACL owns the
 * boundary crossing; the executor owns the I/O.
 */
import { Schema } from 'effect'

export const TomlConfig = Schema.Record({
  key: Schema.String,
  value: Schema.Array(Schema.String),
}).pipe(Schema.brand('TomlConfig'))

export type TomlConfig = Schema.Schema.Type<typeof TomlConfig>
