import * as S from 'effect/Schema'

/**
 * The packument fields this CLI reads. Declared so the response is decoded
 * rather than asserted: a registry that changes shape fails here, naming the
 * field, instead of surfacing as a member access on `any` further downstream.
 */
export const RegistryDocument = S.Struct({
  name: S.String,
  version: S.String,
  dist: S.Struct({ tarball: S.String }),
})

/** A registry request that never produced a tarball, carrying its cause. */
export class RegistryFetchError extends S.TaggedError<RegistryFetchError>()('RegistryFetchError', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}
