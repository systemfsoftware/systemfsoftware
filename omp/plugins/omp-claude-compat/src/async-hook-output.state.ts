import { Context, Effect, Ref } from 'effect'

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

const pending: Ref.Ref<string[]> = Ref.makeUnsafe<string[]>([])

export class AsyncHookContextState extends Context.Service<AsyncHookContextState, AsyncHookContextState>()(
  '@systemfsoftware/omp-claude-compat/AsyncHookContextState',
) {}

export function recordAsyncHookContext(context: string): void {
  const text = context.trim()
  if (text.length === 0) return
  Effect.runSync(
    Ref.update(pending, (items) => items.length >= PENDING_CAP ? [...items.slice(1), text] : [...items, text]),
  )
}

export function drainAsyncHookContext(): readonly string[] {
  return Effect.runSync(Ref.getAndSet(pending, []))
}
