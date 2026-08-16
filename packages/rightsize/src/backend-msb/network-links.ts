/**
 * Network-alias validation and `/etc/hosts` script generation for the
 * microsandbox backend. Behavioral source: upstream rightsize-node
 * `src/backend-msb/network-links.ts` (Apache-2.0). Upstream THROWS
 * `UnsupportedByBackendError`; this port never throws — every check returns a
 * tagged result union the caller (U9b) maps onto the typed error taxonomy.
 */

/** One `alias:guestPort` route into a consumer sandbox (upstream `NetworkLink` shape). */
export interface NetworkLinkLike {
  /** The name the sibling should be reachable under. */
  readonly alias: string
  /** The sibling's exposed guest port. */
  readonly guestPort: number
  /** The sibling's host-side mapped port to tunnel/route traffic to. */
  readonly targetHostPort: number
}

export type GuestPortsValidation =
  | { readonly _tag: 'ok' }
  | { readonly _tag: 'duplicate-guest-port'; readonly guestPort: number }

/**
 * Two siblings publishing the same guest port on one network have nowhere
 * distinct to tunnel to — reject the link set. Duplicates are keyed on the
 * guest port across ALL links, not per alias.
 */
export function validateGuestPorts(links: readonly NetworkLinkLike[]): GuestPortsValidation {
  const seen = new Set<number>()
  for (const link of links) {
    if (seen.has(link.guestPort)) {
      return { _tag: 'duplicate-guest-port', guestPort: link.guestPort }
    }
    seen.add(link.guestPort)
  }
  return { _tag: 'ok' }
}

// Permissive DNS-label charset: aliases are interpolated into a `sh -c`
// `/etc/hosts` echo, so this exists to reject shell-metacharacter aliases
// that could break out of the quoting, not to enforce a strict hostname
// grammar.
const ALIAS_CHARSET = /^[A-Za-z0-9._-]+$/

export type AliasValidation =
  | { readonly _tag: 'ok' }
  | { readonly _tag: 'invalid-alias'; readonly alias: string }

/** Every distinct alias must be shell-quoting-safe (letters, digits, '.', '_', '-'). */
export function validateAliases(links: readonly NetworkLinkLike[]): AliasValidation {
  const aliases = new Set(links.map((link) => link.alias))
  for (const alias of aliases) {
    if (!ALIAS_CHARSET.test(alias)) {
      return { _tag: 'invalid-alias', alias }
    }
  }
  return { _tag: 'ok' }
}

/**
 * The `sh -c` script that appends one `/etc/hosts` line per distinct alias.
 * Callers MUST have passed `validateAliases` first — the charset gate is what
 * keeps the single-quoted echo shell-safe.
 */
export function hostsAliasScript(links: readonly NetworkLinkLike[]): string {
  const aliases = [...new Set(links.map((link) => link.alias))]
  return aliases.map((alias) => `echo '127.0.0.1 ${alias}' >> /etc/hosts`).join('; ')
}
