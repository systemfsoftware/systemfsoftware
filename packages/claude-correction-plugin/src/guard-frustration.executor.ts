import { Context, Effect, Option } from 'effect'
import { frustrationSignal } from './frustration-signal.kernel.js'
import type { PromptStdio } from './process-stdio.adapter.js'
import { decodeSubmission } from './prompt-submission.acl.js'

export class GuardFrustrationExecutorDeps extends Context.Tag('GuardFrustrationExecutorDeps')<
  GuardFrustrationExecutorDeps,
  {
    readonly readSubmission: PromptStdio['Type']['readSubmission']
    readonly emit: PromptStdio['Type']['emit']
  }
>() {}

export const guardFrustration = Effect.fn('guardFrustration')(function*() {
  const deps = yield* GuardFrustrationExecutorDeps
  const raw = yield* deps.readSubmission
  const notice = yield* decodeSubmission(raw).pipe(
    Effect.map((submission) => frustrationSignal(submission.prompt)),
    Effect.orElseSucceed(() => Option.none<string>()),
  )
  yield* Option.match(notice, { onNone: () => Effect.void, onSome: deps.emit })
})
