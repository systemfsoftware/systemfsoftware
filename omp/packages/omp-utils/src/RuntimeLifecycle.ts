interface WarmContext {
  readonly setTimeout: (handler: () => void, ms: number) => unknown
}

type OnSessionStart = (warm: (ctx: WarmContext) => void) => void

/**
 * Warm the runtime after startup.
 *
 * Do NOT warm inside the extension factory. ESM evaluation is synchronous
 * main-thread work and the host awaits the factory, so warming there stalls
 * startup (measured: ~30s). After `session_start` the thread is idle awaiting
 * the first model response, so the work is free and the first `tool_call` still
 * finds the runtime loaded.
 *
 * `ctx.setTimeout` is required over a raw timer: a raw timer that throws is an
 * uncaughtException and tears down the session.
 *
 * Disposal is NOT wired here. This helper runs once per session load — main
 * session and every task subagent — while the runtime it warms is one cached
 * instance shared by all of them, so a teardown hook registered here fires N
 * times against a runtime whose `dispose()` is terminal. The runtime module
 * owns its own teardown.
 */
export const warmRuntimeAfterStart = (
  onSessionStart: OnSessionStart,
  loadRuntime: () => Promise<unknown>,
): void => {
  onSessionStart((ctx) => {
    ctx.setTimeout(() => {
      void loadRuntime()
    }, 0)
  })
}
