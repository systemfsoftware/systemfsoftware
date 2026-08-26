import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { warmRuntimeAfterStart } from '@systemfsoftware/omp-platform/runtime-lifecycle'

import type { HookRunner } from './HookRunner.js'
import type { HookRuntimeContext } from './HookRuntime.js'

// The runtime module stays lazy so the platform-node layer never evaluates
// at plugin-registration time.
const loadRuntime = () => import('./HookRuntime.js').then((mod) => mod.default)

const runner: HookRunner<HookRuntimeContext> = {
  runSafe: async (effect) => {
    const [runtime, Cause, Effect, Exit] = await Promise.all([
      loadRuntime(),
      import('effect/Cause'),
      import('effect/Effect'),
      import('effect/Exit'),
    ])
    const exit = await runtime.runPromise(effect.pipe(Effect.exit))
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    return exit.value
  },
}

export default async function claudeCompatExtension(pi: ExtensionAPI): Promise<void> {
  const [{ HookDispatcherTask }, { InjectInstructionsTask }] = await Promise.all([
    import('./HookDispatcherHandler.js'),
    import('./InjectInstructionsHandler.js'),
  ])
  HookDispatcherTask(pi, runner)
  InjectInstructionsTask(pi, runner)
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_event, ctx) => warm(ctx)), loadRuntime)
}
