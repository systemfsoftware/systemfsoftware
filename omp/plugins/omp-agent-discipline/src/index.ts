import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { NoSkillDelegationExtension } from './no-skill-delegation.handler.js'
import { XdRetryGuardExtension } from './xd-retry-guard.handler.js'

export default function agentDisciplineHandler(pi: ExtensionAPI): void {
  void import('./runtime.js')

  NoSkillDelegationExtension(pi)
  XdRetryGuardExtension(pi)

  process.on('SIGINT', () => {
    void import('./runtime.js').then(({ default: runtime }) => runtime.dispose())
  })
  process.on('SIGTERM', () => {
    void import('./runtime.js').then(({ default: runtime }) => runtime.dispose())
  })
}
