import { Scheduler } from 'effect'

/**
 * Reports an unhandled error by throwing it in a separate macrotask, so global
 * error handlers observe it without it escaping into the interpreter. This is
 * core's `reportUnhandledError` timing; the macrotask comes from Effect's
 * `Scheduler` — the repo's timer seam — so no global timer is called here.
 */
export function reportUnhandledError(err: unknown): void {
  Scheduler.Scheduler.defaultValue().makeDispatcher().scheduleTask(() => {
    throw err
  }, 0)
}
