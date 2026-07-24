import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { HookDispatcherTask } from './hook-dispatcher.handler.js'
import { InjectInstructionsTask } from './inject-instructions.handler.js'
import { runtime } from './runtime.js'

export default function claudeCompatExtension(pi: ExtensionAPI): void {
  Effect.runSync(
    Effect.scoped(
      Layer.build(
        Layer.mergeAll(
          InjectInstructionsTask(pi),
          HookDispatcherTask(pi),
        ),
      ),
    ),
  )

  ManagedRuntime.make(
    Layer.mergeAll(
      InjectInstructionsTask(pi),
      HookDispatcherTask(pi),
    ),
  )

  process.on('SIGINT', () => {
    void runtime.dispose()
  })
  process.on('SIGTERM', () => {
    void runtime.dispose()
  })
}
