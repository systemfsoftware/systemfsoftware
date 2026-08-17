/**
 * Logs contract (R12), ported from upstream `test/it/contract.test.ts`
 * and extended with the slice's no-duplicate guarantee: `logs()` snapshot
 * ordering (including a genuinely-empty interior line as real output), and
 * `followOutput` streaming — lines in order, no duplicates between a
 * snapshot and the follow of the same workload, the final unterminated
 * line delivered exactly once on the workload's natural end, close halting
 * delivery, and delivery ending when the container stops. All through the
 * real docker backend; every scenario runs REAL containers (RS-LANE).
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage, toRunningContainer } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.js'
import { Wait } from '../../src/wait/strategies.js'
import { laneOutcome, outcomeFailure } from './helpers.js'
import { waitUntil } from './probes.js'

const Feature = makeFeature({ it, layer })

/** Splits a logs snapshot into lines, dropping exactly the trailing stream-end newline (never interior empties). */
const snapshotLines = (logs: string): ReadonlyArray<string> => {
  const withoutTrailing = logs.endsWith('\n') ? logs.slice(0, -1) : logs
  return withoutTrailing.split('\n')
}

/** One follow session bound into the scenario scope: the collected lines plus the close handle. */
interface FollowSession {
  readonly received: string[]
  readonly handle: { readonly close: Effect.Effect<void> } | undefined
}

/** Converts a follow-handle into the session binding used by the shared steps. */
const sessionOf = (received: string[], handle: { readonly close: Effect.Effect<void> }): FollowSession => ({
  received,
  handle,
})

Feature('the log contract runs real containers through the docker backend').liveClock().body(({ scenario }) => {
  scenario(
    'ShouldWaitOnABootMarkerAndSnapshotOrderedWorkloadLines',
    Gherkin.Do.pipe(
      Given('a container that prints a boot marker and stays up')(
        'container',
        () =>
          laneOutcome(
            fromImage('alpine:3.19')
              .withCommand('sh', '-c', 'echo BOOT-MARKER; sleep 60')
              .waitingFor(Wait.forLogMessage('BOOT-MARKER'))
              .withStartupTimeout(30_000)
              .start(),
          ),
      ),
      When('a logs snapshot is taken')('snapshot', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.logs)
          : Effect.succeed(outcomeFailure<string>('launch-failed', s.container.failureMessage))),
      Then('the snapshot carries the marker as ordered real output')((s) => {
        expect(s.container.ok).toBe(true)
        expect(s.snapshot.ok).toBe(true)
        if (s.snapshot.ok && s.snapshot.value !== undefined) {
          expect(s.snapshot.value).toContain('BOOT-MARKER')
          expect(snapshotLines(s.snapshot.value)).toEqual(['BOOT-MARKER'])
        }
      }),
    ),
  )

  scenario(
    'ShouldPreserveAnEmptyInteriorLineInTheLogSnapshot',
    Gherkin.Do.pipe(
      Given('a container printing before, an empty line, and after')(
        'container',
        () =>
          laneOutcome(
            fromImage('alpine:3.19')
              .withCommand('sh', '-c', "echo before; echo ''; echo after; sleep 60")
              .waitingFor(Wait.forLogMessage('after'))
              .withStartupTimeout(30_000)
              .start(),
          ),
      ),
      When('a logs snapshot is taken')('snapshot', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.logs)
          : Effect.succeed(outcomeFailure<string>('launch-failed', s.container.failureMessage))),
      Then('the interior empty line is real output, not a manufactured gap')((s) => {
        expect(s.snapshot.ok).toBe(true)
        if (s.snapshot.ok && s.snapshot.value !== undefined) {
          const lines = snapshotLines(s.snapshot.value)
          const beforeIdx = lines.indexOf('before')
          expect(beforeIdx).not.toBe(-1)
          expect(lines.slice(beforeIdx, beforeIdx + 3)).toEqual(['before', '', 'after'])
        }
      }),
    ),
  )

  scenario(
    'ShouldFollowLinesInOrderWithoutDuplicatesAndHaltDeliveryOnClose',
    Gherkin.Do.pipe(
      Given('a container trickling five lines and staying alive')(
        'container',
        () =>
          laneOutcome(
            fromImage('alpine:3.19')
              .withCommand('sh', '-c', 'for i in 1 2 3 4 5; do echo line-$i; sleep 0.3; done; sleep 60')
              .waitingFor(Wait.forLogMessage('line-5'))
              .withStartupTimeout(30_000)
              .start(),
          ),
      ),
      When('a logs snapshot is taken after the trickle finished')(
        'snapshot',
        (s) =>
          s.container.ok && s.container.value !== undefined
            ? laneOutcome(s.container.value.logs)
            : Effect.succeed(outcomeFailure<string>('launch-failed', s.container.failureMessage)),
      ),
      When('a follow starts and collects into a local array')('follow', (s) => {
        const received: string[] = []
        return s.container.ok && s.container.value !== undefined
          ? laneOutcome(
            Effect.map(
              s.container.value.followOutput((line) => received.push(line)),
              (handle) => sessionOf(received, handle),
            ),
          )
          : Effect.succeed(outcomeFailure<FollowSession>('launch-failed', s.container.failureMessage))
      }),
      When('the follow has replayed the five lines')('replayed', (s) => {
        const follow = s.follow.ok && s.follow.value !== undefined ? s.follow.value : undefined
        return follow === undefined
          ? Effect.succeed(false)
          : Effect.promise(() => waitUntil(() => follow.received.length >= 5, 15_000))
      }),
      When('the follow is closed')(
        'closed',
        (s) =>
          s.follow.ok && s.follow.value !== undefined && s.follow.value.handle !== undefined
            ? s.follow.value.handle.close
            : Effect.void,
      ),
      When('a quiet window passes')('quiet', (s) => {
        const received = s.follow.ok && s.follow.value !== undefined ? s.follow.value.received : undefined
        return received === undefined
          ? Effect.succeed(false)
          : Effect.promise(() => {
            const countAfterClose = received.length
            return waitUntil(() => received.length > countAfterClose, 800)
          })
      }),
      Then('the snapshot and the follow agree line-for-line, each line delivered once')((s) => {
        expect(s.container.ok).toBe(true)
        expect(s.snapshot.ok).toBe(true)
        expect(s.replayed).toBe(true)
        expect(s.quiet).toBe(false)
        const received = s.follow.ok && s.follow.value !== undefined ? s.follow.value.received : []
        const snapshotContent = s.snapshot.ok && s.snapshot.value !== undefined ? s.snapshot.value : ''
        expect(received.slice(0, 5)).toEqual(snapshotLines(snapshotContent))
        expect(received.length).toBe(5)
        expect(new Set(received).size).toBe(received.length)
      }),
    ),
  )

  scenario(
    'ShouldDeliverTheFinalUnterminatedLineExactlyOnceAfterTheWorkloadExits',
    Gherkin.Do.pipe(
      Given('a container whose workload exits after two lines')(
        'container',
        () =>
          laneOutcome(
            fromImage('alpine:3.19')
              .withCommand('sh', '-c', "sleep 1; echo first; printf 'unterminated-tail'")
              .withStartupTimeout(30_000)
              .start(),
          ),
      ),
      When('a follow observes the whole lifetime')('follow', (s) => {
        const received: string[] = []
        return s.container.ok && s.container.value !== undefined
          ? laneOutcome(
            Effect.map(
              s.container.value.followOutput((line) => received.push(line)),
              (handle) => sessionOf(received, handle),
            ),
          )
          : Effect.succeed(outcomeFailure<FollowSession>('launch-failed', s.container.failureMessage))
      }),
      When('the final tail line is delivered')('tail', (s) => {
        const follow = s.follow.ok && s.follow.value !== undefined ? s.follow.value : undefined
        return follow === undefined
          ? Effect.succeed(false)
          : Effect.promise(() => waitUntil(() => follow.received.includes('unterminated-tail'), 15_000))
      }),
      When('a quiet window passes to expose any duplicate delivery')('quiet', (s) => {
        const received = s.follow.ok && s.follow.value !== undefined ? s.follow.value.received : undefined
        return received === undefined
          ? Effect.succeed(false)
          : Effect.promise(() => waitUntil(() => received.length > 2, 800))
      }),
      Then('the workload exit flushed the tail exactly once')((s) => {
        expect(s.container.ok).toBe(true)
        expect(s.tail).toBe(true)
        expect(s.quiet).toBe(false)
        const received = s.follow.ok && s.follow.value !== undefined ? s.follow.value.received : []
        expect(received).toEqual(['first', 'unterminated-tail'])
      }),
      When('the follow is closed and the exited container is torn down')('cleanup', (s) =>
        Effect.all([
          s.follow.ok && s.follow.value !== undefined && s.follow.value.handle !== undefined
            ? s.follow.value.handle.close
            : Effect.void,
          s.container.ok && s.container.value !== undefined
            ? laneOutcome(s.container.value.stop)
            : Effect.void,
        ])),
    ),
  )

  scenario(
    'ShouldStopDeliveryWhenTheContainerStops',
    Gherkin.Do.pipe(
      Given('a container started through the launch executor, ticking three lines and staying alive')(
        'container',
        () =>
          laneOutcome(
            Effect.map(
              launchContainer(
                fromImage('alpine:3.19')
                  .withCommand('sh', '-c', 'for i in 1 2 3; do echo tick-$i; sleep 0.3; done; sleep 60')
                  .withStartupTimeout(30_000)
                  .spec,
              ),
              toRunningContainer,
            ),
          ),
      ),
      When('a follow starts')('follow', (s) => {
        const received: string[] = []
        return s.container.ok && s.container.value !== undefined
          ? laneOutcome(
            Effect.map(
              s.container.value.followOutput((line) => received.push(line)),
              (handle) => sessionOf(received, handle),
            ),
          )
          : Effect.succeed(outcomeFailure<FollowSession>('launch-failed', s.container.failureMessage))
      }),
      When('all three ticks are observed')('ticks', (s) => {
        const follow = s.follow.ok && s.follow.value !== undefined ? s.follow.value : undefined
        return follow === undefined
          ? Effect.succeed(false)
          : Effect.promise(() => waitUntil(() => follow.received.length >= 3, 15_000))
      }),
      When('the container is stopped')('stopped', (s) =>
        laneOutcome(
          s.container.ok && s.container.value !== undefined
            ? s.container.value.stop
            : Effect.void,
        )),
      When('a quiet window passes to expose any post-stop delivery')('quiet', (s) => {
        const received = s.follow.ok && s.follow.value !== undefined ? s.follow.value.received : undefined
        return received === undefined
          ? Effect.succeed(false)
          : Effect.promise(() => {
            const countAtStop = received.length
            return waitUntil(() => received.length > countAtStop, 800)
          })
      }),
      Then('the stream ended with the stop: delivery is frozen at exactly the three ticks')((s) => {
        expect(s.ticks).toBe(true)
        expect(s.stopped.ok).toBe(true)
        expect(s.quiet).toBe(false)
        const received = s.follow.ok && s.follow.value !== undefined ? s.follow.value.received : []
        expect(received).toEqual(['tick-1', 'tick-2', 'tick-3'])
      }),
    ),
  )
})
