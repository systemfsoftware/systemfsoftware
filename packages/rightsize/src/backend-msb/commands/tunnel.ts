/**
 * Exec-tunnel timeouts and respawn policy for msb network-alias emulation.
 * Behavioral source: upstream rightsize-node `src/backend-msb/exec-tunnel.ts`
 * (Apache-2.0). Upstream's host-port-publish proxy never propagates the
 * target's own TCP close back to the host-side socket, so a connection would
 * otherwise hold the tunnel open forever after its first exchange. Two
 * separate idle windows: a generous FIRST_BYTE_DEADLINE tolerates a
 * slow-but-real cold response before any target byte has arrived, then the
 * much tighter IDLE_WINDOW takes over once data starts flowing, where a gap
 * that short really does mean this single client-speaks-first exchange is
 * done.
 *
 * Respawn policy (the DECISION, modeled pure; the adapter loops):
 * - a connection that was actually served → respawn immediately (backoff 0);
 * - a spawn that produced no traffic (the in-guest `nc -l` exited without a
 *   client) → reconnect with a backoff that doubles per consecutive failure,
 *   capped, so a busy no-traffic loop cannot spin `msb exec` at full speed;
 * - the listener is given up only when the tunnel itself is closed, or when
 *   the guest listener keeps dying without ever serving (a dead sandbox must
 *   not respawn forever). Upstream loops at a fixed 200 ms indefinitely;
 *   the exponential cap and give-up are a documented bounded deviation so an
 *   orphaned listener cannot spin the CLI driver forever.
 */

export const TUNNEL_TIMING = {
  /** Generous window for the FIRST byte of the response, before any data has flowed. */
  firstByteDeadlineMs: 10_000,
  /** Tight idle window once data starts flowing — the client-speaks-first exchange is done. */
  idleWindowMs: 500,
  /** Base respawn backoff for a no-traffic spawn (upstream's `RESPAWN_BACKOFF_MS`). */
  respawnBackoffBaseMs: 200,
  /** Cap on the doubling backoff (200 → 400 → 800 → 1600 → 3200). */
  respawnBackoffMaximumMs: 3_200,
  /** Consecutive no-traffic spawns tolerated before giving up on the guest listener. */
  maxConsecutiveSpawnFailures: 8,
} as const

export type TunnelRespawnDecision =
  | { readonly _tag: 'reconnect'; readonly backoffMs: number }
  | { readonly _tag: 'give-up'; readonly reason: 'closed' | 'listener-unreachable' }

export interface RespawnDecisionInput {
  /** Whether the tunnel was closed/stopped (adapter state). */
  readonly closed: boolean
  /** Whether the last spawn relayed a connection (vs exiting with no traffic). */
  readonly served: boolean
  /** How many consecutive spawns produced no traffic. */
  readonly consecutiveFailures: number
  /** When the last spawn attempt was made (epoch millis). */
  readonly lastAttemptMs: number
  /** Clock input ("now", epoch millis). */
  readonly nowMs: number
}

/**
 * Whether to reconnect, and after how long — or to give up, and why.
 * Time already spent since the last attempt counts toward the backoff: if the
 * wait budget has lapsed (for example the adapter was blocked elsewhere), the
 * reconnect is immediate rather than piling a fresh sleep on top.
 */
export function respawnDecision(input: RespawnDecisionInput): TunnelRespawnDecision {
  if (input.closed) {
    return { _tag: 'give-up', reason: 'closed' }
  }
  if (input.served) {
    return { _tag: 'reconnect', backoffMs: 0 }
  }
  if (input.consecutiveFailures >= TUNNEL_TIMING.maxConsecutiveSpawnFailures) {
    return { _tag: 'give-up', reason: 'listener-unreachable' }
  }
  const contended = Math.min(
    TUNNEL_TIMING.respawnBackoffBaseMs * 2 ** input.consecutiveFailures,
    TUNNEL_TIMING.respawnBackoffMaximumMs,
  )
  const elapsed = Math.max(0, input.nowMs - input.lastAttemptMs)
  const backoffMs = Math.max(0, contended - elapsed)
  return { _tag: 'reconnect', backoffMs }
}
