import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { HookDispatcherTask } from './hook-dispatcher.handler.js'
import { InjectInstructionsTask } from './inject-instructions.handler.js'

export default function claudeCompatExtension(pi: ExtensionAPI): void {
  void import('./runtime.js')

  HookDispatcherTask(pi)
  InjectInstructionsTask(pi)

  process.on('SIGINT', () => {
    void import('./runtime.js').then(({ default: runtime }) => runtime.dispose())
  })
  process.on('SIGTERM', () => {
    void import('./runtime.js').then(({ default: runtime }) => runtime.dispose())
  })
}
