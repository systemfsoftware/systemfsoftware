import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import * as Crypto from 'effect/Crypto'
import { LoopbackViolationError, SandboxBootError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import type { PortBinding } from './render-sandbox-plan.schema.js'
import { PlanSandbox, renderSandboxPlan } from './render-sandbox-plan.workflow.js'
import type { BootInput } from './running-vm.handle.js'

export interface SandboxDraft {
  readonly spec: MicroVMSpec
  readonly bindings: ReadonlyArray<PortBinding>
}

const SANDBOX_PREFIX = 'effect-microsandbox-'

const readPlanCommand = (draft: SandboxDraft): Effect.Effect<PlanSandbox, never, Crypto.Crypto> =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto
    const id = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
    return new PlanSandbox({
      spec: draft.spec,
      bindings: draft.bindings,
      name: `${SANDBOX_PREFIX}${process.pid}-${id.slice(0, 8)}`,
    })
  })

export const bootSandbox = Sandwich.named('boot_sandbox')(readPlanCommand)
  .decide(renderSandboxPlan)
  .write({
    PlanApproved: (approved, command) =>
      Effect.succeed<BootInput>({ spec: command.spec, plan: approved.plan, bindings: command.bindings }),
    PlanRefused: (refused) =>
      Effect.fail(
        new LoopbackViolationError({
          sandboxName: refused.sandboxName,
          host: refused.host,
          guestPort: refused.guestPort,
        }),
      ),
    CommandRejected: (rejected, command) =>
      Effect.fail(new SandboxBootError({ sandboxName: command.name, cause: rejected })),
  })
