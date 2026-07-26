import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@oh-my-pi/pi-coding-agent'

export const InjectInstructionsTask = (pi: ExtensionAPI): void => {
  pi.on('before_agent_start', async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
    const runtime = await import('./runtime.js').then((mod) => mod.default)
    const { loadReferencedContent } = await import('./inject-instructions.executor.js')
    const { Cause, Config, Effect, Exit } = await import('effect')

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
}
