/**
 * Shared-state quarantine: an async hook outlives the dispatch that started
 * it, so its context has nowhere to return to. Claude Code delivers that
 * context on the following conversation turn; with nowhere to hold it the
 * context is simply lost, which is the whole point of running the hook.
 *
 * Only the sanctioned `additionalContext` reaches here — `hook-output.acl.ts`
 * drops everything else. Bounded so a runaway or looping hook cannot grow it
 * without limit.
 */
const PENDING_CAP = 64

const pending: string[] = []

export function recordAsyncHookContext(context: string): void {
  const text = context.trim()
  if (text.length === 0) return
  if (pending.length >= PENDING_CAP) pending.shift()
  pending.push(text)
}

export function drainAsyncHookContext(): readonly string[] {
  return pending.splice(0, pending.length)
}
