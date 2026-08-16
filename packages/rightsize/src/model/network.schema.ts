/**
 * Network schemas — the alias charset contract (`NetworkAlias`) and the
 * library-created network's identity (`NetworkSpec`). Alias validation is a
 * port-plan addition (R12: alias-charset validation); upstream rightsize-node
 * accepted any alias string, which docker's bridge refuses at connect time.
 */
import { Schema as S } from 'effect'

/**
 * A network alias — the DNS-style name a container answers to on its
 * network: an alphanumeric start, then alphanumerics, `_`, `.` and `-`
 * (docker bridge aliases accept the same alphabet; an emulating backend's
 * `/etc/hosts` rewrite needs the same constraint to stay hostname-safe).
 */
export const NetworkAlias = S.refine<typeof S.String, string>((value): value is string =>
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
)(
  S.String.pipe(
    S.annotate({
      identifier: 'NetworkAlias',
      title: 'NetworkAlias',
      description: 'A container network alias: [a-zA-Z0-9][a-zA-Z0-9._-]*.',
    }),
  ),
)

export type NetworkAlias = S.Schema.Type<typeof NetworkAlias>

/**
 * The identity of a library-created network, `rz-net-<8hex>` (upstream
 * `Network.id`). The launch workflow ensures the network exists before any
 * member joins it; teardown removes it when the last member left.
 */
export const NetworkSpec = S.Struct({
  id: S.String,
}).pipe(
  S.annotate({
    identifier: 'NetworkSpec',
    title: 'NetworkSpec',
    description: 'The identity of a library-created container network.',
  }),
)

export type NetworkSpec = S.Schema.Type<typeof NetworkSpec>
