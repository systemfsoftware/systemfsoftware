import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { type Context, Effect, Match } from 'effect'
import * as Stream from 'effect/Stream'
import { SandboxBootError, WaitTimeoutError } from './MicroVMError.schema.js'
import type { MicroVMSpec, WaitStrategy } from './MicroVMSpec.schema.js'
import { ResolveWaitStrategy, resolveWaitStrategy } from './resolve-wait-strategy.workflow.js'
import { logs, type RunningVMType } from './running-vm.handle.js'

const WAIT_TIMEOUT_MS = 30_000
const WAIT_POLL_MS = 250

const waitLabel = (strategy: WaitStrategy): string =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => `port:${port}`),
    Match.tag('Http', ({ path, port }) => `http:${path}@${port}`),
    Match.tag('Log', ({ pattern }) => `log:${pattern}`),
    Match.exhaustive,
  )

const conditionOf = (strategy: WaitStrategy): Readiness.Condition =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => Readiness.Wait.forTcp(port)),
    Match.tag('Http', ({ path, port }) => Readiness.Wait.forHttp(path, port)),
    Match.tag('Log', ({ pattern }) => Readiness.Wait.forLog(pattern)),
    Match.exhaustive,
  )

const logSourceOf = (vm: RunningVMType): Context.Service.Shape<typeof Readiness.LogSource> => ({
  entries: logs(vm).pipe(
    Stream.map((entry) => entry.text),
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
    Effect.mapError((cause) => new Readiness.LogSourceError({ source: vm.name, cause })),
  ),
})

const awaitReadinessForStrategy = (
  vm: RunningVMType,
  strategy: WaitStrategy,
): Effect.Effect<void, WaitTimeoutError | SandboxBootError, Readiness.HostProber> =>
  Effect.gen(function*() {
    const target = Readiness.target(vm.portBindings, {
      timeoutMs: WAIT_TIMEOUT_MS,
      pollMs: WAIT_POLL_MS,
    })
    const condition = conditionOf(strategy)
    const verdict = yield* Readiness.awaitCondition(target, condition).pipe(
      Effect.provideService(Readiness.LogSource, logSourceOf(vm)),
      Effect.mapError((cause) => new SandboxBootError({ sandboxName: vm.name, cause })),
    )
    return yield* Match.value(verdict).pipe(
      Match.tag('Satisfied', () => Effect.void),
      Match.tag('TimedOut', () =>
        Effect.fail(new WaitTimeoutError({ wait: waitLabel(strategy), timeoutMs: WAIT_TIMEOUT_MS }))),
      Match.exhaustive,
    )
  })

export interface ReadinessInput {
  readonly vm: RunningVMType
  readonly spec: MicroVMSpec
}

/**
 * What the cell's `read` returns, and so what every write handler receives and what the cell
 * answers with: the encoded `ResolveWaitStrategy` command the library decodes for the decision,
 * joined to the live handle it was read from. The handle carries the guest-to-host bindings the
 * readiness target needs, and the resource's `ready` needs that same handle back, so the cell's
 * input passes through whole rather than being split into a command and a service.
 */
export type AwaitReadinessRead = (typeof ResolveWaitStrategy)['Encoded'] & Readonly<{ vm: RunningVMType }>

const readReadiness = (input: ReadinessInput): Effect.Effect<AwaitReadinessRead> =>
  Effect.succeed({ _tag: 'ResolveWaitStrategy', spec: input.spec, vm: input.vm })

export const awaitReadiness = Sandwich.named('await_readiness')(readReadiness)
  .decide(resolveWaitStrategy)
  .write({
    WaitRequired: (required, snapshot) =>
      Effect.as(awaitReadinessForStrategy(snapshot.vm, required.strategy), snapshot.vm),
    WaitSkipped: (_skipped, snapshot) => Effect.succeed(snapshot.vm),
    CommandRejected: (rejected, snapshot) =>
      Effect.fail(new SandboxBootError({ sandboxName: snapshot.vm.name, cause: rejected })),
  })
