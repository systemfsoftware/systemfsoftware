import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import hookDispatcherExtension from './hook-dispatcher.handler.js'
import injectInstructionsExtension from './inject-instructions.js'

export default function claudeCompatExtension(pi: ExtensionAPI): void {
  hookDispatcherExtension(pi)
  injectInstructionsExtension(pi)
}
