import { Effect, Layer } from 'effect'
import { guardFrustration, GuardFrustrationExecutorDeps } from '../guard-frustration.executor.js'
import { ProcessStdio, PromptStdio } from '../process-stdio.adapter.js'

const DepsLive = Layer.effect(
  GuardFrustrationExecutorDeps,
  Effect.map(
    PromptStdio,
    (stdio) => GuardFrustrationExecutorDeps.of({ readSubmission: stdio.readSubmission, emit: stdio.emit }),
  ),
).pipe(Layer.provide(ProcessStdio))

await Effect.runPromise(Effect.provide(guardFrustration(), DepsLive))
