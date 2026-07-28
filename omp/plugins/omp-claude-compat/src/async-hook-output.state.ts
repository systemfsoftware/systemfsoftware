/**
 * Shared-state quarantine: an async hook outlives the dispatch that started
 * it, so its stdout has nowhere to return to. Claude Code delivers that output
 * on the following conversation turn; with nowhere to hold it the output is
 * simply lost, which is the whole point of running the hook.
 *
 * Bounded so a runaway or looping hook cannot grow it without limit.
 */
const PENDING_CAP = 64

const pending: string[] = []

export function recordAsyncHookOutput(stdout: string): void {
  const text = stdout.trim()
  if (text.length === 0) return
  if (pending.length >= PENDING_CAP) pending.shift()
  pending.push(text)
}

export function drainAsyncHookOutput(): readonly string[] {
  return pending.splice(0, pending.length)
}
