import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as Match from 'effect/Match'
import type { Sandbox } from 'microsandbox'
import { LoopbackViolationError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import { PortAllocator } from './PortAllocator.js'
import type { PortBinding, SandboxPlan } from './render-sandbox-plan.schema.js'
import { PlanSandbox, renderSandboxPlan } from './render-sandbox-plan.workflow.js'
import { SandboxRuntime } from './SandboxRuntime.js'

export interface AcquiredVM {
  readonly spec: MicroVMSpec
  readonly plan: SandboxPlan
  readonly sandbox: Sandbox
}

const createSandbox = (
  spec: MicroVMSpec,
  plan: SandboxPlan,
): Effect.Effect<AcquiredVM, SandboxBootError> =>
  Effect.flatMap(
    SandboxRuntime,
    (runtime) => Effect.map(runtime.acquire(plan), (sandbox): AcquiredVM => ({ spec, plan, sandbox })),
  )

const teardown = (sandbox: Sandbox): Effect.Effect<void> =>
  Effect.flatMap(SandboxRuntime, (runtime) => runtime.release(sandbox))

const allocateBinding = (guest: number): Effect.Effect<PortBinding, PortAllocationError> =>
  Effect.scoped(Effect.flatMap(PortAllocator, (allocator) => allocator.reserve(guest)))

const allocateBindings = (guests: ReadonlyArray<number>) =>
  Effect.forEach(guests, (guest) => allocateBinding(guest), { concurrency: 'unbounded' })

const readPlanCommand = (spec: MicroVMSpec) =>
  Effect.gen(function*() {
    const crypto = yield* Crypto.Crypto
    const ports = Match.value(spec).pipe(
      Match.tag('Service', (s) => s.ports),
      Match.tag('Job', () => []),
      Match.exhaustive,
    )
    const bindings = yield* allocateBindings(ports)
    const id = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
    return new PlanSandbox({
      spec,
      bindings,
      name: `effect-microsandbox-${process.pid}-${id.slice(0, 8)}`,
    })
  })

export const bootSandbox = Sandwich.named('boot_sandbox')(readPlanCommand)
  .decide(renderSandboxPlan)
  .write({
    PlanApproved: (approved, command) =>
      Effect.acquireRelease(createSandbox(command.spec, approved.plan), (vm) => teardown(vm.sandbox)),
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
