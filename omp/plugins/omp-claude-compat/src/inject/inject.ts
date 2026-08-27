import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
} from '@oh-my-pi/pi-coding-agent'
import { Effect } from 'effect'
import { ReferencedContent } from './referenced-content.js'

export const InjectInstructionsTask = (
  pi: ExtensionAPI,
  runSafe: <A, E>(effect: Effect.Effect<A, E, ReferencedContent>) => Promise<A>,
): void => {
  pi.on('before_agent_start', async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    const injected = await runSafe(
      Effect.gen(function*() {
        const rc = yield* ReferencedContent
        return yield* rc.load(ctx.cwd)
      }),
    )
    if (injected === '') return undefined
    return {
      systemPrompt: [...event.systemPrompt, '', injected],
    } satisfies BeforeAgentStartEventResult
  })
}
