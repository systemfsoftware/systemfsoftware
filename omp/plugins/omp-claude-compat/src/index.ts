import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { warmRuntimeAfterStart } from '@systemfsoftware/omp-utils/runtime-lifecycle'

import type { HookRunner } from './hook-runner.kernel.js'
import type { HookRuntimeContext } from './hook-runtime.state.js'

// The runtime module stays lazy so the platform-node layer never evaluates
// at plugin-registration time.
const loadRuntime = () => import('./hook-runtime.state.js').then((mod) => mod.default)

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
    import('./hook-dispatcher.handler.js'),
    import('./inject-instructions.handler.js'),
  ])
  HookDispatcherTask(pi, runner)
  InjectInstructionsTask(pi, runner)
  warmRuntimeAfterStart((warm) => pi.on('session_start', (_event, ctx) => warm(ctx)), loadRuntime)
}
