import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@oh-my-pi/pi-coding-agent'
import type { TomlLoader } from '@systemfsoftware/omp-utils'
import { Config, Effect, Result } from 'effect'
import type { FileSystem } from 'effect/FileSystem'
import type * as PathModule from 'effect/Path'
import type { HookRunner } from './HookRunner.js'
import { loadReferencedContent } from './InjectInstructionsExecutor.js'

export const InjectInstructionsTask = (
  pi: ExtensionAPI,
  runner: HookRunner<FileSystem | PathModule.Path | TomlLoader>,
): void => {
  pi.on('before_agent_start', async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
    const injected = await runner.runSafe(
      Effect.gen(function*() {
        const projectDir = yield* Config.string('CLAUDE_PROJECT_DIR').pipe(
          Config.withDefault(process.cwd()),
        )
        const outcome = yield* Effect.result(loadReferencedContent(projectDir))
        return Result.getOrThrow(outcome)
      }),
    )
    if (injected === '') return undefined
    return {
      systemPrompt: [...event.systemPrompt, '', injected],
    } satisfies BeforeAgentStartEventResult
  })
}
