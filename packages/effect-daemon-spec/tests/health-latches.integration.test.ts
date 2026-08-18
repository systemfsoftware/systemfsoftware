import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Latch, Metric, Ref, Result, Schedule, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { healthStateGauge } from '../src/mod.js'
import { BoundedIntensity } from '../src/mod.js'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/mod.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it, layer })

Feature('Health Latch Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Worker starts with ready closed and healthy open',
      Gherkin.Do.pipe(
        When('a poll worker is started without advancing time')('health', () =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'latch-init-worker',
              work: Effect.void,
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            return yield* run.worker(worker)
          })),
        Then('ready is closed')((s) =>
          s.health.ready.await.pipe(
            Effect.timeout('0 millis'),
            Effect.result,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result).toEqual(Result.fail(expect.anything()))
              })
            ),
            Effect.asVoid,
          )
        ),
        And('healthy is open')((s) => s.health.healthy.await),
      ),
    )

    scenario(
      'Worker starts with paused open',
      Gherkin.Do.pipe(
        When('a poll worker is started without advancing time')('health', () =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'latch-init-worker-paused',
              work: Effect.void,
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            return yield* run.worker(worker)
          })),
        Then('paused is open')((s) => s.health.paused.await),
      ),
    )

    scenario(
      'Supervisor starts with ready closed and healthy open',
      Gherkin.Do.pipe(
        When('a supervisor is started without advancing time')('health', () =>
          Effect.gen(function*() {
            const sup = oneForOne({
              name: 'latch-init-sup',
              children: [
                Daemon.poll({
                  name: 'latch-init-sup-child',
                  work: Effect.void,
                  interval: Duration.millis(1),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
              ],
              supervision: Supervision.worker(Duration.minutes(5)),
              lock: { mode: 'none' },
            })
            return yield* run.supervisor(sup)
          })),
        Then('ready is closed')((s) =>
          s.health.ready.await.pipe(
            Effect.timeout('0 millis'),
            Effect.result,
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result).toEqual(Result.fail(expect.anything()))
              })
            ),
            Effect.asVoid,
          )
        ),
        And('healthy is open')((s) => s.health.healthy.await),
      ),
    )

    scenario(
      'Supervisor starts with paused open',
      Gherkin.Do.pipe(
        When('a supervisor is started without advancing time')('health', () =>
          Effect.gen(function*() {
            const sup = oneForOne({
              name: 'latch-init-sup-paused',
              children: [
                Daemon.poll({
                  name: 'latch-init-sup-paused-child',
                  work: Effect.void,
                  interval: Duration.millis(1),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
              ],
              supervision: Supervision.worker(Duration.minutes(5)),
              lock: { mode: 'none' },
            })
            return yield* run.supervisor(sup)
          })),
        Then('paused is open')((s) => s.health.paused.await),
      ),
    )

    scenario(
      'Worker health metrics match initial latch states',
      Gherkin.Do.pipe(
        When('worker health is allocated through a running worker')('out', () =>
          Effect.gen(function*() {
            const daemon = 'metric-init-worker'
            const worker = Daemon.poll({
              name: daemon,
              work: Effect.void,
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            yield* run.worker(worker)
            const gr = Metric.withAttributes(healthStateGauge, { daemon: daemon, latch: 'ready' })
            const gh = Metric.withAttributes(healthStateGauge, { daemon: daemon, latch: 'healthy' })
            const gp = Metric.withAttributes(healthStateGauge, { daemon: daemon, latch: 'paused' })
            const sr = yield* Metric.value(gr)
            const sh = yield* Metric.value(gh)
            const sp = yield* Metric.value(gp)
            return { sr, sh, sp }
          })),
        Then('ready gauge is zero and healthy and paused are one')((s) =>
          Effect.sync(() => {
            expect(s.out.sr.value).toBe(0)
            expect(s.out.sh.value).toBe(1)
            expect(s.out.sp.value).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'Ready metric reflects open after first successful poll tick',
      Gherkin.Do.pipe(
        When('a poll worker completes a tick')('out', () =>
          Effect.gen(function*() {
            const daemon = 'metric-ready-poll'
            const worker = Daemon.poll({
              name: daemon,
              work: Effect.void,
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const gr = Metric.withAttributes(healthStateGauge, { daemon: daemon, latch: 'ready' })
            yield* run.worker(worker).pipe(Effect.provide(NoopLayer))
            yield* TestClock.adjust(Duration.millis(5))
            const st = yield* Metric.value(gr)
            return { st }
          })),
        Then('ready gauge is one')((s) =>
          Effect.sync(() => {
            expect(s.out.st.value).toBe(1)
          })
        ),
      ),
    )

    scenario(
      'Supervisor healthy metric drops when exhaustion closes the healthy latch',
      Gherkin.Do.pipe(
        When('a zero-restart supervisor exhausts')('out', () =>
          Effect.gen(function*() {
            const supName = 'metric-exhaust-sup'
            const gh = Metric.withAttributes(healthStateGauge, { daemon: supName, latch: 'healthy' })
            const worker = Daemon.poll({
              name: 'metric-exhaust-child',
              work: Effect.fail('boom'),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const sup = oneForOne({
              name: supName,
              children: [worker],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 0, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.millis(1), 1),
                cooldown: Duration.hours(1),
              }),
              lock: { mode: 'none' },
            })
            const health = yield* run.supervisor(sup).pipe(Effect.provide(NoopLayer))
            yield* TestClock.adjust(Duration.seconds(2))
            const st = yield* Metric.value(gh)
            const healthyClosed = yield* health.healthy.await.pipe(
              Effect.timeout('0 millis'),
              Effect.matchEffect({
                onFailure: () => Effect.succeed(true),
                onSuccess: () => Effect.succeed(false),
              }),
            )
            return { st, healthyClosed }
          })),
        Then('healthy gauge is zero and latch is closed')((s) =>
          Effect.sync(() => {
            expect(s.out.healthyClosed).toBe(true)
            expect(s.out.st.value).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'Worker ready opens after first successful tick',
      Gherkin.Do.pipe(
        Given('a counter')('counterRef', () => Ref.make(0)),
        When('the worker runs')('result', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'tick',
              work: Ref.update(s.counterRef, (n) => n + 1),
              interval: Duration.millis(1),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(10))
            yield* health.ready.await
            const count = yield* Ref.get(s.counterRef)
            expect(count).toBeGreaterThanOrEqual(1)
            return { health }
          })),
      ),
    )

    scenario(
      'Supervisor ready opens when all children ready',
      Gherkin.Do.pipe(
        Given('two counter refs')('counterRefs', () => Effect.all({ a: Ref.make(0), b: Ref.make(0) })),
        When('the supervisor runs')('result', (s) =>
          Effect.gen(function*() {
            const sup = oneForOne({
              name: 'parent',
              children: [
                Daemon.poll({
                  name: 'child-a',
                  work: Ref.update(s.counterRefs.a, (n) => n + 1),
                  interval: Duration.millis(1),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
                Daemon.poll({
                  name: 'child-b',
                  work: Ref.update(s.counterRefs.b, (n) => n + 1),
                  interval: Duration.millis(1),
                  tick: { tickTimeout: Duration.seconds(90) },
                  lock: { mode: 'none' },
                }),
              ],
              supervision: Supervision.custom({
                intensity: BoundedIntensity.make({ restarts: 5, window: Duration.seconds(60) }),
                backoff: Schedule.exponential(Duration.seconds(10)).pipe(
                  Schedule.jittered,
                  Schedule.upTo({ duration: Duration.minutes(5) }),
                ),
                cooldown: Duration.minutes(30),
              }),
              lock: { mode: 'none' },
            })
            const health = yield* run.supervisor(sup)
            yield* TestClock.adjust(Duration.millis(10))
            yield* health.ready.await
            return { health }
          })),
      ),
    )

    scenario(
      'Closing supervisor pause gate delays child restart until reopened',
      Gherkin.Do.pipe(
        Given('a restartable child controlled by a release latch')(
          'ctx',
          () =>
            Effect.gen(function*() {
              const starts = yield* Ref.make(0)
              const release = yield* Latch.make(false)
              const child = Daemon.stream({
                name: 'pausable-restart-child',
                tick: { tickTimeout: Duration.seconds(90) },
                stream: Stream.concat(
                  Stream.fromEffect(Ref.update(starts, (n) => n + 1)),
                  Stream.fromEffect(Effect.andThen(release.await, Effect.fail('boom'))),
                ),
                lock: { mode: 'none' },
              })
              const sup = oneForOne({
                name: 'pausable-restart-parent',
                children: [child],
                supervision: Supervision.custom({
                  intensity: BoundedIntensity.make({ restarts: 10, window: Duration.seconds(60) }),
                  backoff: Schedule.exponential(Duration.millis(1), 1),
                  cooldown: Duration.minutes(30),
                }),
                lock: { mode: 'none' },
              })
              const health = yield* run.supervisor(sup)
              yield* health.ready.await
              return { health, starts, release }
            }),
        ),
        When('the supervisor is paused before the child fails')('startsWhilePaused', (s) =>
          Effect.gen(function*() {
            yield* s.ctx.health.paused.close
            yield* s.ctx.release.open
            yield* TestClock.adjust(Duration.millis(10))
            return yield* Ref.get(s.ctx.starts)
          })),
        Then('the child does not restart until the supervisor is resumed')((s) =>
          Effect.gen(function*() {
            expect(s.startsWhilePaused).toBe(1)
            yield* s.ctx.health.paused.open
            yield* TestClock.adjust(Duration.millis(10))
            expect(yield* Ref.get(s.ctx.starts)).toBeGreaterThan(1)
          })
        ),
      ),
    )
  })
