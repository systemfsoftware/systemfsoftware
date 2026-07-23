import { NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@oh-my-pi/pi-coding-agent'
import { Cause, Config, Effect, Exit, ManagedRuntime } from 'effect'
import { loadReferencedContent } from './inject-instructions.executor.js'

const runtime = ManagedRuntime.make(NodeFileSystem.layer)

const runSafe = async <A, E>(effect: Effect.Effect<A, E, FileSystem>) => {
  const exit = await runtime.runPromise(effect.pipe(Effect.exit))
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
  return exit.value
}

export default function injectInstructionsExtension(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (event: BeforeAgentStartEvent, _ctx: ExtensionContext) =>
    runSafe(Effect.gen(function*() {
      const projectDir = yield* Config.string('CLAUDE_PROJECT_DIR').pipe(
        Config.withDefault(process.cwd()),
      )
      const injected = yield* loadReferencedContent(projectDir)
      if (injected === '') return undefined
      return {
        systemPrompt: [...event.systemPrompt, '', injected],
      } satisfies BeforeAgentStartEventResult
    })))
}
