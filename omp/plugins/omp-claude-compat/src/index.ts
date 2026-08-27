import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'

export default async function claudeCompatExtension(pi: ExtensionAPI): Promise<void> {
  const { lazyRunSafe, warmRuntimeAfterStart } = await import('@systemfsoftware/omp-runtime')
  const runSafe = lazyRunSafe(() => import('./runtime.js'))
  const [{ HookDispatcherTask }, { InjectInstructionsTask }] = await Promise.all([
    import('./hooks/mod.js'),
    import('./inject/mod.js'),
  ])
  HookDispatcherTask(pi, runSafe)
  InjectInstructionsTask(pi, runSafe)
  pi.on('session_start', async (_e, ctx) => {
    try {
      // dynamic import: runtime is warmed after session_start per PLG4; static import would block factory
      const { warmHarnessPolicy } = await import('./runtime.js')
      await runSafe(warmHarnessPolicy(ctx.cwd))
    } catch (error) {
      // fail-open: warm failure leaves NoInjectRefs at default ['AGENTS.md']; custom no_inject_refs is ignored so user-suppressed refs may be over-injected
      try {
        pi.logger.warn('[omp-claude-compat] warmHarnessPolicy failed', { error, cwd: ctx.cwd })
      } catch {
        // logger must never throw
      }
    }
  })
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_e, ctx) => warm(ctx)), () => import('./runtime.js'))
}
