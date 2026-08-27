import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'

export default async function agentDisciplineHandler(pi: ExtensionAPI): Promise<void> {
  const { lazyRunSafe, warmRuntimeAfterStart } = await import('@systemfsoftware/omp-runtime')
  const runSafe = lazyRunSafe(() => import('./runtime.js'))
  const { DispatchDoctrineExtension } = await import('./doctrine/mod.js')
  DispatchDoctrineExtension(pi, runSafe)
  const { NoSkillDelegationExtension } = await import('./delegation/mod.js')
  NoSkillDelegationExtension(pi, runSafe)
  const { XdRetryGuardExtension } = await import('./xd-retry/mod.js')
  XdRetryGuardExtension(pi)
  pi.on('session_start', async (_event, ctx) => {
    try {
      const { warmHarnessPolicy } = await import('./runtime.js')
      await runSafe(warmHarnessPolicy(ctx.cwd))
    } catch {
      // fail-open: discipline defaults to no denylist
    }
  })
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_event, ctx) => warm(ctx)), () => import('./runtime.js'))
}
