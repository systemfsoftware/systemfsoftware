import { Schema } from 'effect'

/**
 * The secrets `capture:cloudflare` reads from the environment. A run whose
 * environment lacks any of them fails naming the missing variables, before it
 * reaches the API.
 */
export class MissingSecrets extends Schema.TaggedError<MissingSecrets>()('MissingSecrets', {
  message: Schema.String,
  names: Schema.Array(Schema.String),
}) {}

/**
 * The zone tracing settings endpoint answered without a `result`, so the run
 * cannot snapshot what it is about to change and refuses to patch blind.
 */
export class ZoneSettingsUnreadable extends Schema.TaggedError<ZoneSettingsUnreadable>()(
  'ZoneSettingsUnreadable',
  {
    message: Schema.String,
    zoneId: Schema.String,
  },
) {}

/**
 * The zone's tracing settings read back different from the snapshot after the
 * finalizer restored them: the run fails rather than leave a production zone
 * mutated.
 */
export class ZoneRestoreMismatch extends Schema.TaggedError<ZoneRestoreMismatch>()('ZoneRestoreMismatch', {
  message: Schema.String,
  zoneId: Schema.String,
}) {}

/**
 * The final leak check found a resource still named with the run prefix after
 * every scope closed.
 */
export class ResourceLeak extends Schema.TaggedError<ResourceLeak>()('ResourceLeak', {
  message: Schema.String,
  names: Schema.Array(Schema.String),
}) {}

/**
 * A catalogued case answered with a non-error. The fixture records error
 * answers only, so a success means the case's premise is wrong and the run
 * refuses to cite it.
 */
export class UnobservedErrorCase extends Schema.TaggedError<UnobservedErrorCase>()('UnobservedErrorCase', {
  message: Schema.String,
  case: Schema.String,
  status: Schema.Int,
}) {}

/** The zone tracing settings envelope's `result` member, the settings object. */
export const ZoneTracingEnvelope = Schema.Struct({ result: Schema.Unknown })
export type ZoneTracingEnvelope = typeof ZoneTracingEnvelope.Type
