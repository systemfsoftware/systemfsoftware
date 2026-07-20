import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import noSkillDelegationExtension from './no-skill-delegation.js'
import xdRetryGuardExtension from './xd-retry-guard.js'

export default function agentDisciplineExtension(pi: ExtensionAPI): void {
  xdRetryGuardExtension(pi)
  noSkillDelegationExtension(pi)
}
