import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@oh-my-pi/pi-coding-agent'
import { Cause, Config, Effect, Exit } from 'effect'
import { loadReferencedContent } from './inject-instructions.executor.js'
import type { AppRuntime } from './runtime.js'

export const injectInstructionsTask = (pi: ExtensionAPI, runtime: AppRuntime): Effect.Effect<void> =>
  Effect.sync(() => {
    pi.on('before_agent_start', async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
      const exit = await runtime.runPromise(
        Effect.gen(function*() {
          const projectDir = yield* Config.string('CLAUDE_PROJECT_DIR').pipe(
            Config.withDefault(process.cwd()),
          )
          return yield* loadReferencedContent(projectDir)
        }).pipe(Effect.exit),
      )
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
      const injected = exit.value
      if (injected === '') return undefined
      return {
        systemPrompt: [...event.systemPrompt, '', injected],
      } satisfies BeforeAgentStartEventResult
    })
  })
