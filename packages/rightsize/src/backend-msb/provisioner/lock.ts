import { Match } from 'effect'

/**
 * Cross-process install-lock staleness for the msb provisioner. Behavioral
 * source: upstream rightsize-node `src/backend-msb/provisioner.ts`
 * `parseLockInfo` / `isLockStale` (Apache-2.0). The lock file records
 * `${pid}\n${timestamp}` (written via O_EXCL create by the holder) so a
 * waiter can positively detect a dead holder rather than only guessing from
 * file age. Staleness is two independent conditions, either one sufficient to
 * take over: the recorded PID is provably dead, OR the lock predates the
 * staleness threshold (a live-but-wedged holder). An unparseable lock cannot
 * be trusted as "held" — it counts as stale. Process liveness is an injected
 * probe (`process.kill(pid, 0)` semantics: any other errno than `ESRCH`
 * means a live process) so this module stays effect-free.
 */

/**
 * A holdable lock predates 10 minutes — beyond that it is reaped even if the
 * PID looks alive. Must stay ABOVE the provisioner's fetch ceiling
 * (`DEFAULT_FETCH_TIMEOUT_MS`, 300s): a slow COLD pull legitimately holds
 * the lock longer than the per-request fetch budget (asset + checksum +
 * retries), and a stale threshold equal to a single fetch would let a waiter
 * steal a live, in-progress download mid-pull. 2x the fetch ceiling keeps
 * age-based takeover strictly slower than any live holder's own budget.
 */
export const STALE_LOCK_AGE_MS = 10 * 60 * 1000

export interface LockRecord {
  readonly pid: number
  readonly timestamp: number
}

export type ParseLockOutcome =
  | { readonly _tag: 'ok'; readonly record: LockRecord }
  | { readonly _tag: 'unparseable' }

/**
 * Parses the two-line `${pid}\n${timestamp}` lock payload. Like upstream, the
 * record is destructured from the split, so any trailing extra line is
 * ignored rather than rejected; an empty/malformed payload is unparseable.
 */
export function parseLockInfo(text: string): ParseLockOutcome {
  const [pidStr, tsStr] = text.trim().split('\n')
  const pid = Number(pidStr)
  const timestamp = Number(tsStr)
  if (!Number.isFinite(pid) || !Number.isFinite(timestamp)) {
    return { _tag: 'unparseable' }
  }
  return { _tag: 'ok', record: { pid, timestamp } }
}

export type LockStaleness =
  | { readonly _tag: 'fresh'; readonly pid: number; readonly timestamp: number; readonly ageMs: number }
  | {
    readonly _tag: 'stale'
    readonly reason: 'unparseable' | 'dead-holder' | 'aged-out'
    readonly pid: number | undefined
    readonly timestamp: number | undefined
    readonly ageMs: number | undefined
  }

export interface LockStalenessInput {
  /** The raw lock-file content (`""` when it cannot be read). */
  readonly lockContent: string
  /** Clock input — the current time in epoch millis. */
  readonly now: number
  /** The liveness probe for the recorded PID (injected effect, never called for an unparsed lock). */
  readonly isPidAlive: (pid: number) => boolean
}

/** Fresh, or stale with the reason a waiter may take the lock over. Never throws. */
export function lockStaleness(input: LockStalenessInput): LockStaleness {
  return Match.value(parseLockInfo(input.lockContent)).pipe(
    Match.tag(
      'unparseable',
      () => ({ _tag: 'stale', reason: 'unparseable', pid: undefined, timestamp: undefined, ageMs: undefined }) as const,
    ),
    Match.tag('ok', ({ record }) => {
      const ageMs = input.now - record.timestamp
      if (!input.isPidAlive(record.pid)) {
        return { _tag: 'stale', reason: 'dead-holder', pid: record.pid, timestamp: record.timestamp, ageMs } as const
      }
      if (ageMs > STALE_LOCK_AGE_MS) {
        return { _tag: 'stale', reason: 'aged-out', pid: record.pid, timestamp: record.timestamp, ageMs } as const
      }
      return { _tag: 'fresh', pid: record.pid, timestamp: record.timestamp, ageMs } as const
    }),
    Match.exhaustive,
  )
}
