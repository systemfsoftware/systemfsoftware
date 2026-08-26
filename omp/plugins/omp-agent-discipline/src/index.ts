import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { warmRuntimeAfterStart } from '@systemfsoftware/omp-platform/runtime-lifecycle'
import { runSafe } from './RunSafePolicy.js'

export default async function agentDisciplineHandler(pi: ExtensionAPI): Promise<void> {
  // Handlers are deferred behind dynamic imports so the entry's static
  // closure stays under the eager-entry budget (the host taxes the static
  // graph on every startup; effect and the executors are heavy). Each
  // handler is registered sequentially, in order: DispatchDoctrineExtension
  // MUST register FIRST — the runner's emitToolCall short-circuits on the
  // first { block: true }, so a not-loaded doctrine block must beat a
  // no-skill-delegation block when both would fire on the same dispatch
  // (KTD1, R7).
  const { DispatchDoctrineExtension } = await import('./DispatchDoctrineHandler.js')
  DispatchDoctrineExtension(pi, runSafe)
  const { NoSkillDelegationExtension } = await import('./NoSkillDelegationHandler.js')
  NoSkillDelegationExtension(pi, runSafe)
  const { XdRetryGuardExtension } = await import('./XdRetryGuardMiddleware.js')
  XdRetryGuardExtension(pi)
  warmRuntimeAfterStart(
    (warm) => pi.on('session_start', (_event, ctx) => warm(ctx)),
    () => import('./Runtime.js'),
  )
}
