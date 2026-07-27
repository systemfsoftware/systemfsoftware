import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { installRuntimeLifecycle } from '@systemfsoftware/omp-utils/runtime-lifecycle'
import { NoSkillDelegationExtension } from './no-skill-delegation.handler.js'
import { XdRetryGuardExtension } from './xd-retry-guard.handler.js'

export default function agentDisciplineHandler(pi: ExtensionAPI): void {
  NoSkillDelegationExtension(pi)
  XdRetryGuardExtension(pi)
  installRuntimeLifecycle(
    (warm) => pi.on('session_start', (_event, ctx) => warm(ctx)),
    () => import('./runtime.js'),
  )
}
