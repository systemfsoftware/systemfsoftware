import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { type Context, Effect, Predicate } from 'effect'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { SandboxBootError, WaitTimeoutError } from './MicroVMError.schema.js'
import { ResolveWaitStrategy, resolveWaitStrategy } from './resolve-wait-strategy.workflow.js'

const WAIT_TIMEOUT_MS = 30_000
const WAIT_POLL_MS = 250

const logSourceOf = (sandbox: AcquiredVM['sandbox']): Context.Service.Shape<typeof Readiness.LogSource> => ({
  entries: Effect.map(
    Effect.tryPromise({
      try: () => sandbox.logs(),
      catch: (cause) => new Readiness.LogSourceError({ source: sandbox.name, cause }),
    }),
    (entries) => entries.map((entry) => entry.text()),
  ),
})

const awaitWait = (
  vm: AcquiredVM,
  condition: Readiness.Condition,
  label: string,
): Effect.Effect<void, WaitTimeoutError | SandboxBootError, Readiness.HostProber> =>
  Readiness.target(vm.plan.portBindings, { timeoutMs: WAIT_TIMEOUT_MS, pollMs: WAIT_POLL_MS }).awaitCondition(
    condition,
  ).pipe(
    Effect.provideService(Readiness.LogSource, logSourceOf(vm.sandbox)),
    Effect.mapError((cause) => new SandboxBootError({ sandboxName: vm.sandbox.name, cause })),
    Effect.filterOrFail(
      Predicate.isTagged('Satisfied'),
      () => new WaitTimeoutError({ wait: label, timeoutMs: WAIT_TIMEOUT_MS }),
    ),
    Effect.asVoid,
  )

export type AwaitReadinessRead = (typeof ResolveWaitStrategy)['Encoded'] & AcquiredVM

const readReadiness = (vm: AcquiredVM): Effect.Effect<AwaitReadinessRead> =>
  Effect.succeed({ ...vm, _tag: 'ResolveWaitStrategy' })

export const awaitReadiness = Sandwich.named('await_readiness')(readReadiness)
  .decide(resolveWaitStrategy)
  .write({
    WaitRequired: (required, snapshot) => Effect.as(awaitWait(snapshot, required.condition, required.label), snapshot),
    WaitSkipped: (_skipped, snapshot) => Effect.succeed(snapshot),
    CommandRejected: (rejected, snapshot) =>
      Effect.fail(new SandboxBootError({ sandboxName: snapshot.sandbox.name, cause: rejected })),
  })
