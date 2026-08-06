import { Context, Effect, Option } from 'effect'
import { correctionSignal } from './correction-signal.kernel.js'
import type { PromptStdio } from './process-stdio.adapter.js'
import { decodeSubmission } from './prompt-submission.acl.js'

export class CaptureCorrectionExecutorDeps extends Context.Tag(
  '@systemfsoftware/claude-correction-plugin/capture-correction.executor/CaptureCorrectionExecutorDeps',
)<
  CaptureCorrectionExecutorDeps,
  {
    readonly readSubmission: PromptStdio['Type']['readSubmission']
    readonly emit: PromptStdio['Type']['emit']
  }
>() {}

export const captureCorrection = Effect.fn('captureCorrection')(function*() {
  const deps = yield* CaptureCorrectionExecutorDeps
  const raw = yield* deps.readSubmission
  const notice = yield* decodeSubmission(raw).pipe(
    Effect.map((submission) => correctionSignal(submission.prompt)),
    Effect.orElseSucceed(() => Option.none<string>()),
  )
  yield* Option.match(notice, { onNone: () => Effect.void, onSome: deps.emit })
})
