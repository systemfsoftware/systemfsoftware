import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Effect } from 'effect'
import { hookDispatcherTask } from './hook-dispatcher.handler.js'
import { injectInstructionsTask } from './inject-instructions.handler.js'
import { createRuntime } from './runtime.js'

export default function claudeCompatExtension(pi: ExtensionAPI): void {
  const runtime = createRuntime()

  runtime.runSync(
    Effect.all([
      injectInstructionsTask(pi, runtime),
      hookDispatcherTask(pi, runtime),
    ], { concurrency: 1 }),
  )
}
