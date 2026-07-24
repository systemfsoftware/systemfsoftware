import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { NoSkillDelegationExtension } from './no-skill-delegation.handler.js'
import { runtime } from './runtime.js'
import { XdRetryGuardExtension } from './xd-retry-guard.handler.js'

export default function agentDisciplineHandler(pi: ExtensionAPI): void {
  Effect.runSync(
    Effect.scoped(
      Layer.build(
        Layer.mergeAll(
          NoSkillDelegationExtension(pi),
          XdRetryGuardExtension(pi),
        ),
      ),
    ),
  )

  ManagedRuntime.make(
    Layer.mergeAll(
      NoSkillDelegationExtension(pi),
      XdRetryGuardExtension(pi),
    ),
  )

  process.on('SIGINT', () => {
    void runtime.dispose()
  })
  process.on('SIGTERM', () => {
    void runtime.dispose()
  })
}
