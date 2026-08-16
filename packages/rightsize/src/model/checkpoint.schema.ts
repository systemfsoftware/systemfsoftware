/**
 * Checkpoint schemas — the validated checkpoint name and the opaque ref a
 * checkpoint's committed state is addressed by.
 *
 * `CheckpointName` pins the pattern upstream pins across every rightsize
 * language implementation (`^[a-z0-9][a-z0-9-]{0,40}$` — `checkpoint/name.ts`
 * at the fork point): a name is a path segment, and rejecting anything that
 * could carry `../` before it reaches path construction is what keeps a bad
 * name from minting a ref or touching the registry.
 *
 * `CheckpointRef` is deliberately unvalidated data: refs are minted by the
 * library in backend-specific shapes (a committed image tag
 * `rightsize/checkpoint:<…>` on docker, an absolute
 * `<cacheDir>/checkpoints/rz-ckpt-<…>` path on microsandbox) and only read
 * back by the same backend that minted them.
 */
import { Schema as S } from 'effect'

/**
 * A user-chosen checkpoint name, validated against
 * `^[a-z0-9][a-z0-9-]{0,40}$` — lowercase letter or digit first, then
 * lowercase letters, digits and hyphens, at most 41 characters.
 */
export const CheckpointName = S.refine<typeof S.String, string>((value): value is string =>
  /^[a-z0-9][a-z0-9-]{0,40}$/.test(value)
)(
  S.String.pipe(
    S.annotate({
      identifier: 'CheckpointName',
      title: 'CheckpointName',
      description: 'A checkpoint name matching ^[a-z0-9][a-z0-9-]{0,40}$.',
    }),
  ),
)

export type CheckpointName = S.Schema.Type<typeof CheckpointName>

/**
 * An opaque, backend-minted reference to a committed checkpoint's state — a
 * docker image tag or a microsandbox snapshot path. Never validated here;
 * only the backend that minted it can resolve it.
 */
export const CheckpointRef = S.String.pipe(
  S.annotate({
    identifier: 'CheckpointRef',
    title: 'CheckpointRef',
    description: 'A backend-minted reference to a committed checkpoint.',
  }),
)

export type CheckpointRef = S.Schema.Type<typeof CheckpointRef>
