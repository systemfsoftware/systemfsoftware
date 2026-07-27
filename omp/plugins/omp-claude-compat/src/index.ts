import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { installRuntimeLifecycle } from '@systemfsoftware/omp-utils/runtime-lifecycle'
import { HookDispatcherTask } from './hook-dispatcher.handler.js'
import { InjectInstructionsTask } from './inject-instructions.handler.js'

export default function claudeCompatExtension(pi: ExtensionAPI): void {
  HookDispatcherTask(pi)
  InjectInstructionsTask(pi)
  installRuntimeLifecycle(
    (warm) => pi.on('session_start', (_event, ctx) => warm(ctx)),
    () => import('./runtime.js'),
  )
}
