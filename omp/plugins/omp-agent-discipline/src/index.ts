import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { installRuntimeLifecycle } from '@systemfsoftware/omp-utils/runtime-lifecycle'
import { DispatchDoctrineExtension } from './dispatch-doctrine.handler.js'
import { NoSkillDelegationExtension } from './no-skill-delegation.handler.js'
import { XdRetryGuardExtension } from './xd-retry-guard.handler.js'

export default function agentDisciplineHandler(pi: ExtensionAPI): void {
  // DispatchDoctrineExtension MUST register FIRST: the runner's
  // emitToolCall short-circuits on the first { block: true }, so a
  // not-loaded doctrine block must beat a no-skill-delegation block
  // when both would fire on the same dispatch (KTD1, R7).
  DispatchDoctrineExtension(pi)
  NoSkillDelegationExtension(pi)
  XdRetryGuardExtension(pi)
  installRuntimeLifecycle(
    (warm) => pi.on('session_start', (_event, ctx) => warm(ctx)),
    () => import('./runtime.js'),
  )
}
