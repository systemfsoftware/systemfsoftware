import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Layer, Match } from 'effect'
import * as Result from 'effect/Result'
import type { AcquiredVM } from './boot-sandbox.cell.js'
import { SandboxBootError, WaitTimeoutError } from './MicroVMError.schema.js'
import type { WaitStrategy } from './MicroVMSpec.schema.js'
import {
  ResolveWaitStrategy,
  resolveWaitStrategy,
  type WaitRequired,
  type WaitSkipped,
} from './resolve-wait-strategy.workflow.js'

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

const readReadinessCommand = (vm: AcquiredVM) => Effect.succeed(vm)

const writeReadiness = (outcome: Result.Result<WaitRequired | WaitSkipped, never>, vm: AcquiredVM) =>
  Match.value(Result.getOrThrow(outcome)).pipe(
    Match.tag(
      'WaitRequired',
      ({ strategy }) => Effect.as(awaitReadinessForStrategy(vm, strategy), vm),
    ),
    Match.tag('WaitSkipped', () => Effect.succeed(vm)),
    Match.exhaustive,
  )

export const awaitReadiness = Sandwich.named('await_readiness')(readReadinessCommand)
  .decode(Sandwich.pure((vm: AcquiredVM) => Result.succeed(new ResolveWaitStrategy({ spec: vm.spec }))))
  .decide(resolveWaitStrategy)
  .encode(Sandwich.pure(Result.succeed))
  .write(writeReadiness)
