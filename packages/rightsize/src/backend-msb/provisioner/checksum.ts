import { Match } from 'effect'
import { createHash } from 'node:crypto'

/**
 * SHA-256 release-manifest verification for the msb provisioner. Behavioral
 * source: upstream rightsize-node `src/backend-msb/provisioner.ts`
 * (Apache-2.0): `parseChecksums` and the per-asset download-verify decision.
 * Upstream THROWS `ProvisionError`; this port never throws — every outcome is
 * a tagged union.
 */

/** `checksums.sha256` parsing result: filename → lowercase hex digest. */
export type ParsedChecksums =
  | { readonly _tag: 'ok'; readonly sums: ReadonlyMap<string, string> }
  | { readonly _tag: 'malformed'; readonly line: string }

/**
 * Tolerant of extra whitespace and either column order — `sha256sum` output
 * vs a hand-authored manifest can vary. `sha256sum`-style lines carry
 * `<hex>  <filename>`; a line with fewer than two columns is malformed.
 */
export function parseChecksums(text: string): ParsedChecksums {
  const sums = new Map<string, string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) {
      continue
    }
    const parts = line.split(/\s+/)
    const hex = parts[0]
    const filename = parts[1]
    if (hex === undefined || filename === undefined) {
      return { _tag: 'malformed', line }
    }
    sums.set(filename, hex.toLowerCase())
  }
  return { _tag: 'ok', sums }
}

/** The SHA-256 hex digest of a byte buffer (pure hash, no I/O). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export type VerifyOutcome =
  | { readonly _tag: 'proceed'; readonly sha256: string; readonly targetPath: string }
  | { readonly _tag: 'checksum-missing'; readonly asset: string; readonly targetPath: string }
  | {
    readonly _tag: 'mismatch'
    readonly asset: string
    readonly targetPath: string
    readonly expectedSha256: string
    readonly actualSha256: string
  }
  | { readonly _tag: 'malformed-manifest'; readonly line: string }

export interface VerifyPlanInput {
  /** The raw `checksums.sha256` release manifest text. */
  readonly manifest: string
  /** The release asset filename being verified, e.g. `msb-linux-x86_64`. */
  readonly asset: string
  /** The downloaded payload to hash and compare. */
  readonly bytes: Uint8Array
  /** The install destination the asset is headed for (carried on the outcome). */
  readonly targetPath: string
}

/**
 * Verify one downloaded asset against the release manifest: manifest must
 * parse, the asset must be listed, and its SHA-256 must match. `proceed`
 * names the verified digest and the install target; every failure names its
 * cause — never throws.
 */
export function verifyPlan(input: VerifyPlanInput): VerifyOutcome {
  return Match.value(parseChecksums(input.manifest)).pipe(
    Match.tag('malformed', ({ line }) => ({ _tag: 'malformed-manifest', line }) as const),
    Match.tag('ok', ({ sums }) => {
      const expected = sums.get(input.asset)
      if (expected === undefined) {
        return { _tag: 'checksum-missing', asset: input.asset, targetPath: input.targetPath } as const
      }
      const actual = sha256Hex(input.bytes)
      if (actual !== expected) {
        return {
          _tag: 'mismatch',
          asset: input.asset,
          targetPath: input.targetPath,
          expectedSha256: expected,
          actualSha256: actual,
        } as const
      }
      return { _tag: 'proceed', sha256: expected, targetPath: input.targetPath } as const
    }),
    Match.exhaustive,
  )
}
