import { Effect, Layer } from 'effect'
import { captureCorrection, CaptureCorrectionExecutorDeps } from '../capture-correction.executor.js'
import { ProcessStdio, PromptStdio } from '../process-stdio.adapter.js'

const DepsLive = Layer.effect(
  CaptureCorrectionExecutorDeps,
  Effect.map(
    PromptStdio,
    (stdio) => CaptureCorrectionExecutorDeps.of({ readSubmission: stdio.readSubmission, emit: stdio.emit }),
  ),
).pipe(Layer.provide(ProcessStdio))

await Effect.runPromise(Effect.provide(captureCorrection(), DepsLive))
