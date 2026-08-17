/**
 * Per-process run identity — one value for the whole lifetime of this
 * process, computed once at module load and re-exported from the main barrel
 * so every consumer (`backend-docker` labels, `backend-msb` names, the
 * hygiene ledger) reads the SAME value rather than each computing its own.
 *
 * This is a correctness requirement, not a style choice (upstream
 * `src/core/run-id.ts` at the fork point, behavior preserved): the reaper and
 * the label cleanup filter container names/labels against `RunId.value` to
 * distinguish "this run's own live containers" from "leftovers of a crashed
 * prior run". Two different values would let a reaper delete this run's own
 * containers (treating them as someone else's orphan) or never clean up the
 * other component's leftovers at all — a silent correctness failure, not a
 * compile error.
 */
import { randomBytes } from 'node:crypto'

/**
 * One value per process: 8 lowercase hex characters, stable for the lifetime
 * of this process.
 */
export const RunId: {
  /** 8 lowercase hex characters, stable for the lifetime of this process. */
  readonly value: string
} = {
  value: randomBytes(4).toString('hex'),
}
