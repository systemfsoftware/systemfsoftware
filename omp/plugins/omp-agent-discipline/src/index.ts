import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Effect } from 'effect'
import noSkillDelegationExtension from './no-skill-delegation.handler.js'
import { createRuntime } from './runtime.js'
import xdRetryGuardExtension from './xd-retry-guard.handler.js'

export default function agentDisciplineHandler(pi: ExtensionAPI): void {
  const runtime = createRuntime()

  runtime.runSync(
    Effect.all([
      Effect.sync(() => noSkillDelegationExtension(pi, runtime)),
      Effect.sync(() => xdRetryGuardExtension(pi)),
    ], { concurrency: 1 }),
  )
}
