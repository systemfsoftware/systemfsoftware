interface DisposableRuntime {
  readonly dispose: () => Promise<void>
}

type LoadRuntime = () => Promise<{ readonly default: DisposableRuntime }>

interface WarmContext {
  readonly setTimeout: (handler: () => void, ms: number) => unknown
}

type OnSessionStart = (warm: (ctx: WarmContext) => void) => void

/**
 * Warm the runtime after startup, dispose it on termination.
 *
 * Do NOT warm inside the extension factory. ESM evaluation is synchronous
 * main-thread work and the host awaits the factory, so warming there stalls
 * startup (measured: ~30s). After `session_start` the thread is idle awaiting
 * the first model response, so the work is free and the first `tool_call` still
 * finds the runtime loaded.
 *
 * `ctx.setTimeout` is required over a raw timer: a raw timer that throws is an
 * uncaughtException and tears down the session.
 */
export const installRuntimeLifecycle = (
  onSessionStart: OnSessionStart,
  loadRuntime: LoadRuntime,
): void => {
  onSessionStart((ctx) => {
    ctx.setTimeout(() => {
      void loadRuntime()
    }, 0)
  })

  const dispose = () => {
    void loadRuntime().then(({ default: runtime }) => runtime.dispose())
  }
  process.on('SIGINT', dispose)
  process.on('SIGTERM', dispose)
}
