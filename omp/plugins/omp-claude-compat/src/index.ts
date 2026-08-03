import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { installRuntimeLifecycle } from '@systemfsoftware/omp-utils/runtime-lifecycle'

export default async function claudeCompatExtension(pi: ExtensionAPI): Promise<void> {
  const [{ HookDispatcherTask }, { InjectInstructionsTask }] = await Promise.all([
    import('./hook-dispatcher.handler.js'),
    import('./inject-instructions.handler.js'),
  ])
  HookDispatcherTask(pi)
  InjectInstructionsTask(pi)
  installRuntimeLifecycle(
    (warm) => pi.on('session_start', (_event, ctx) => warm(ctx)),
    () => import('./hook-runtime.state.js'),
  )
}
