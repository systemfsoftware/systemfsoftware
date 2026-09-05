import * as S from 'effect/Schema'

/** The resolution kinds a profile may silence. */
export const IgnoredResolution = S.Literals(['node10', 'node16-cjs', 'node16-esm', 'bundler'])

/** The profiles the CLI offers. */
export const ProfileName = S.Literals(['strict', 'node16', 'esm-only'])

/**
 * The request the profile decision receives. It carries the resolutions the
 * caller already silenced - the only field the decision reads - so the decision
 * never widens an opaque payload back to a shape it guessed.
 */
export class ApplyProfileCommand extends S.TaggedClass<ApplyProfileCommand>()('ApplyProfileCommand', {
  profileName: ProfileName,
  ignoreResolutions: S.optional(S.Array(IgnoredResolution)),
}) {}

export class ApplyProfileDecision extends S.TaggedClass<ApplyProfileDecision>()('ApplyProfileDecision', {
  ignoreResolutions: S.Array(IgnoredResolution),
}) {}
