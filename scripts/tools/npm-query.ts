// npm-query.ts — the one place this repo reads the npm registry.
//
// A module, never an entry point: it carries no shebang, so it runs under the
// permission grant of whichever script imports it. It reads no environment and
// takes the registry base as a parameter, so a caller cannot widen its reach by
// importing it.
//
// Two consumers derive the same two facts from a packument — does the package
// exist, and did its latest version go out through trusted publishing. Both
// lived here as separate copies once, and the copies drifted: one handled a 200
// response carrying `{"error":"Not found"}` and the other threw on it. The
// protocol belongs in one function so a fix reaches both callers.

/** Concurrent registry queries. Eight is the repo's network-fan-out ceiling. */
export const REGISTRY_CONCURRENCY = 8

/** A network call the caller acts on: a timeout classifies the package `error`. */
const QUERY_TIMEOUT_MS = 30_000

/**
 * The abbreviated packument. It carries `dist.attestations` — measured against
 * registry.npmjs.org, which answers it for every package this repo publishes —
 * while omitting the per-version metadata neither fact needs. Requesting the
 * full document instead costs 10.3 MB for `effect` against 400 KB here.
 */
const ABBREVIATED = 'application/vnd.npm.install-v1+json'

export interface RegistrySnapshot {
  readonly status: 'published' | 'unpublished' | 'error'
  readonly latest: string
  readonly attested: boolean
}

/**
 * Existence and OIDC evidence for one package.
 *
 * `attested` is true when the registry's `latest` carries `dist.attestations`,
 * the only signal for "this went out through trusted publishing" available
 * without authenticating. It is a fact about that one version and is never
 * granted retroactively: registering a trusted publisher does not attest an
 * already-published version, so a package stays unattested until its next
 * version ships from CI.
 *
 * Never throws. An unreadable registry is `error`, never a silent `published`,
 * because absence of evidence that a package exists is not evidence that it
 * does — every caller has to be able to tell those apart.
 */
export const queryRegistry = async (name: string, registry: string): Promise<RegistrySnapshot> => {
  const unqueryable: RegistrySnapshot = { status: 'error', latest: '?', attested: false }
  let body: unknown
  try {
    const response = await fetch(`${registry}/${encodeURIComponent(name)}`, {
      headers: { accept: ABBREVIATED },
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    })
    if (response.status === 404) {
      await response.body?.cancel()
      return { status: 'unpublished', latest: '—', attested: false }
    }
    if (!response.ok) {
      await response.body?.cancel()
      return unqueryable
    }
    body = await response.json()
  } catch {
    return unqueryable
  }

  if (typeof body !== 'object' || body === null) return unqueryable
  const doc = body as Record<string, unknown>
  if (doc['error'] === 'Not found') return { status: 'unpublished', latest: '—', attested: false }

  const distTags = doc['dist-tags']
  if (typeof distTags !== 'object' || distTags === null) return unqueryable
  const latest = (distTags as Record<string, unknown>)['latest']
  if (typeof latest !== 'string') return unqueryable

  const versions = doc['versions'] as Record<string, { dist?: { attestations?: unknown } }> | undefined
  return { status: 'published', latest, attested: versions?.[latest]?.dist?.attestations != null }
}
