import { Schema } from 'effect'

/** @internal */
export const PropertyTier = Schema.Literals(['replay', 'mutation', 'local', 'ci', 'nightly'])

/** @internal */
export type PropertyTier = typeof PropertyTier.Type

/** @internal */
export const DeclaredTier = Schema.Literals(['mutation', 'local', 'ci', 'nightly'])

/** @internal */
export type DeclaredTier = typeof DeclaredTier.Type

/** @internal */
export const PositiveRunCountText = Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThan(0))

/** @internal */
export const NonNegativeSeedText = Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

/** @internal */
export const HexCommitSha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,64}$/iu))
