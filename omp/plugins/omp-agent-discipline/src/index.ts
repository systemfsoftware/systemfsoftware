import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'

export default async function agentDisciplineHandler(pi: ExtensionAPI): Promise<void> {
  // Handlers are deferred behind dynamic imports so the entry's static graph
  // stays under the eager-entry budget (the host taxes it on every startup).
  // DispatchDoctrineExtension MUST register FIRST — the runner's emitToolCall
  // short-circuits on the first { block: true }, so a not-loaded doctrine
  // block must beat a no-skill-delegation block on the same dispatch (PLG3).
  const { lazyRunSafe, warmRuntimeAfterStart } = await import('@systemfsoftware/omp-runtime')
  const runSafe = lazyRunSafe(() => import('./runtime.js'))
  const { DispatchDoctrineExtension } = await import('@systemfsoftware/agent-discipline')
  DispatchDoctrineExtension(pi, runSafe)
  const { NoSkillDelegationExtension } = await import('@systemfsoftware/agent-discipline')
  NoSkillDelegationExtension(pi, runSafe)
  const { XdRetryGuardExtension } = await import('@systemfsoftware/agent-discipline')
  XdRetryGuardExtension(pi)
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_event, ctx) => warm(ctx)), () => import('./runtime.js'))
}
