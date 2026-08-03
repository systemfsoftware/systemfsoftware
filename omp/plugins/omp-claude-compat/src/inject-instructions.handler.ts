import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@oh-my-pi/pi-coding-agent'
import { Cause, Config, Effect, Either, Exit } from 'effect'
import { loadReferencedContent } from './inject-instructions.executor.js'

export const InjectInstructionsTask = (pi: ExtensionAPI): void => {
  pi.on('before_agent_start', async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
    const runtime = await import('./hook-runtime.state.js').then((mod) => mod.default)

    const exit = await runtime.runPromise(
      Effect.gen(function*() {
        const projectDir = yield* Config.string('CLAUDE_PROJECT_DIR').pipe(
          Config.withDefault(process.cwd()),
        )
        const outcome = yield* Effect.either(loadReferencedContent(projectDir))
        return Either.getOrThrow(outcome)
      }).pipe(Effect.exit),
    )
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    const injected = exit.value
    if (injected === '') return undefined
    return {
      systemPrompt: [...event.systemPrompt, '', injected],
    } satisfies BeforeAgentStartEventResult
  })
}
