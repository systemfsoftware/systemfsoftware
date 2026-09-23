import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer, Match } from 'effect'
import type { Sandbox } from 'microsandbox'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { SandboxBootError, WaitTimeoutError } from './MicroVMError.schema.js'
import type { WaitStrategy } from './MicroVMSpec.schema.js'
import type { SandboxPlan } from './render-sandbox-plan.schema.js'
import { ResolveWaitStrategy, resolveWaitStrategy } from './resolve-wait-strategy.workflow.js'

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

const logSourceOf = (sandbox: AcquiredVM['sandbox']): Layer.Layer<Readiness.LogSource> =>
  Layer.succeed(Readiness.LogSource, {
    entries: Effect.map(
      Effect.tryPromise({
        try: () => sandbox.logs(),
        catch: (cause) => new Readiness.LogSourceError({ source: sandbox.name, cause }),
      }),
      (entries) => entries.map((entry) => entry.text()),
    ),
  })

const awaitReadinessForStrategy = (
  vm: AcquiredVM,
  strategy: WaitStrategy,
): Effect.Effect<void, WaitTimeoutError | SandboxBootError> =>
  Effect.gen(function*() {
    const target = Readiness.target(vm.plan.portBindings, {
      timeoutMs: WAIT_TIMEOUT_MS,
      pollMs: WAIT_POLL_MS,
    })
    const condition = conditionOf(strategy)
    const env = Layer.merge(Readiness.NodeHostProber, logSourceOf(vm.sandbox))
    const verdict = yield* Readiness.awaitCondition(target, condition).pipe(
      Effect.provide(env),
      Effect.mapError((cause) => new SandboxBootError({ sandboxName: vm.sandbox.name, cause })),
    )
    return yield* Match.value(verdict).pipe(
      Match.tag('Satisfied', () => Effect.void),
      Match.tag('TimedOut', () =>
        Effect.fail(new WaitTimeoutError({ wait: waitLabel(strategy), timeoutMs: WAIT_TIMEOUT_MS }))),
      Match.exhaustive,
    )
  })

/**
 * The read snapshot the write handlers receive: the encoded `ResolveWaitStrategy` command the
 * library decodes, plus the acquired VM the write phase needs (the port bindings of the plan
 * and the live sandbox handle). The command schema cannot carry a live handle, so the read
 * carries it beside the command it returned.
 */
type AwaitReadinessSnapshot = (typeof ResolveWaitStrategy)['Encoded'] & {
  readonly plan: SandboxPlan
  readonly sandbox: Sandbox
}

const readReadinessSnapshot = (vm: AcquiredVM): Effect.Effect<AwaitReadinessSnapshot> =>
  Effect.succeed({ _tag: 'ResolveWaitStrategy', spec: vm.spec, plan: vm.plan, sandbox: vm.sandbox })

export const awaitReadiness = Sandwich.named('await_readiness')(readReadinessSnapshot)
  .decide(resolveWaitStrategy)
  .write({
    WaitRequired: (required, snapshot) => Effect.as(awaitReadinessForStrategy(snapshot, required.strategy), snapshot),
    WaitSkipped: (_skipped, snapshot) => Effect.succeed(snapshot),
    CommandRejected: (rejected, snapshot) =>
      Effect.fail(new SandboxBootError({ sandboxName: snapshot.sandbox.name, cause: rejected })),
  })
