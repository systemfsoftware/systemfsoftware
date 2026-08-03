import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@oh-my-pi/pi-coding-agent'
import { Config, Effect, Either } from 'effect'
import type { HookRunner } from './hook-runner.kernel.js'
import { InjectInstructionsExecutorDeps, loadReferencedContent } from './inject-instructions.executor.js'

export const InjectInstructionsTask = (
  pi: ExtensionAPI,
  runner: HookRunner<InjectInstructionsExecutorDeps>,
): void => {
  pi.on('before_agent_start', async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
    const injected = await runner.runSafe(
      Effect.gen(function*() {
        const projectDir = yield* Config.string('CLAUDE_PROJECT_DIR').pipe(
          Config.withDefault(process.cwd()),
        )
        const outcome = yield* Effect.either(loadReferencedContent(projectDir))
        return Either.getOrThrow(outcome)
      }),
    )
    if (injected === '') return undefined
    return {
      systemPrompt: [...event.systemPrompt, '', injected],
    } satisfies BeforeAgentStartEventResult
  })
}
