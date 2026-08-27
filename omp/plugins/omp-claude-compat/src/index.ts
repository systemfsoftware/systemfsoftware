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
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_e, ctx) => warm(ctx)), () => import('./runtime.js'))
}
