import { Conformance } from '@systemfsoftware/conformance-spec'
import { LeaderLock, LeaderLockFromPrimitive, type LeaderLockInfraError } from '@systemfsoftware/effect-daemon-spec'
import {
  Leadership,
  leadershipOver,
  LockCommand,
  lockModel,
  runLockCommand,
} from '@systemfsoftware/effect-daemon-spec/testing'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Match, Option } from 'effect'
import { LeadershipStillHeld } from './__fixtures__/LeadershipStillHeld.schema.js'
import { mkStatefulLockPrimitive } from './__fixtures__/LockPrimitiveFakes.js'

const Feature = makeFeature({ it })

const leadership: Layer.Layer<Leadership | LeaderLock> = leadershipOver(mkStatefulLockPrimitive)

const sharedContext = <S>(
  stack: Layer.Layer<S>,
): Effect.Effect<Context.Context<S>> => Effect.scoped(Effect.map(Layer.build(stack), (context) => context))

const locksShared = Layer.provideMerge(LeaderLockFromPrimitive, mkStatefulLockPrimitive)

const claimLeadership = Effect.flatMap(
  LeaderLock,
  (lock) => lock.withLock('leadership', Effect.succeed('led')),
)

const freshClaimant: Effect.Effect<void, LeadershipStillHeld | LeaderLockInfraError, LeaderLock> = Effect.scoped(
  Effect.flatMap(
    LeaderLock,
    (lock) =>
      Effect.flatMap(lock.withLock('leadership', Effect.void), (granted) =>
        Option.isSome(granted)
          ? Effect.void
          : Effect.fail(new LeadershipStillHeld({ key: 'leadership' }))),
  ),
)

const passedRuns = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (pass) => pass.histories),
    Match.orElse(() => {
      throw new Error(`expected the check to pass, but it read: ${Conformance.render(report)}`)
    }),
  )

Feature('Keeping one leadership for one daemon at a time', { timeout: 120_000 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'Daemons asking for the leadership from <workers> sides are handed it one at a time',
      [{ workers: 2, operations: 2 }, { workers: 3, operations: 1 }, { workers: 4, operations: 1 }] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a leadership lock whose holder is one claimant or nobody')(
            'subject',
            () => Effect.succeed(leadership),
          ),
          When('<workers> daemons claim and hand back the leadership in every order their claims can interleave')(
            'report',
            (s) =>
              Conformance.linearizable(s.subject, {
                commands: LockCommand,
                model: lockModel,
                run: runLockCommand,
                fibers: row.workers,
                operations: row.operations,
                preemptions: 2,
                maxSchedules: 100_000,
                timeoutMs: 60_000,
              }),
          ),
          Then('every interleaving matches the daemons taking turns one after the other')((s) => {
            passedRuns(s.report)
          }),
        ),
    )

    scenario(
      'A daemon stopped while taking the leadership lets a fresh claimant take it',
      Gherkin.Do.pipe(
        Given('a leadership lock held on one shared store')(
          'locks',
          () => sharedContext(locksShared),
        ),
        When('the daemon taking the leadership is stopped at every step and a fresh claimant asks after each stop')(
          'report',
          (s) =>
            Conformance.released(Effect.provide(claimLeadership, s.locks), {
              probe: Effect.provide(freshClaimant, s.locks),
            }),
        ),
        Then('the fresh claimant gets the leadership after every stop')((s) => {
          passedRuns(s.report)
        }),
      ),
    )
  })
