import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Either, Stream, TestClock } from 'effect'
import { expect } from 'vitest'
import { Daemon } from '../src/mod.js'
import { dynamic } from '../src/mod.js'
import { run } from '../src/mod.js'
import { NoopLayer } from './helpers/shared-layers.js'
import { BufferedRef } from './helpers/test-utils.js'

const Feature = makeFeature({ it, layer })

Feature('Stream Worker Lifecycle')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Drains all elements from source',
      Gherkin.Do.pipe(
        Given('a buffered ref')('buffer', () => BufferedRef.make<number>()),
        When('a stream worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.stream({
              name: 'drainer',
              stream: Stream.make(1, 2, 3).pipe(
                Stream.tap((n) => BufferedRef.append(s.buffer, n)),
              ),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(10))
            return health
          })),
        Then('buffer contains all elements')((s) =>
          BufferedRef.readAll(s.buffer).pipe(
            Effect.flatMap((items) =>
              Effect.sync(() => {
                expect(items).toEqual([1, 2, 3])
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'Becomes ready on the first emitted element',
      Gherkin.Do.pipe(
        Given('a buffered ref')('buffer', () => BufferedRef.make<number>()),
        When('a stream worker is started')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.stream({
              name: 'ready-on-first',
              stream: Stream.make(1, 2, 3).pipe(
                Stream.tap((n) => BufferedRef.append(s.buffer, n)),
              ),
              tick: { tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(10))
            return health
          })),
        Then('ready is open')((s) => s.health.ready.await),
      ),
    )

    scenario(
      'Stream timeout fails when no element arrives within the timeout window',
      Gherkin.Do.pipe(
        When('a stream worker that never emits is started')('result', () =>
          Effect.scoped(
            Effect.gen(function*() {
              const worker = Daemon.stream({
                name: 'silent-stream',
                stream: Stream.fromEffect(Effect.sleep(Duration.seconds(100))),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const spec = dynamic({
                name: 'silent-stream-sup',
                child: () => worker,
                maxChildren: 1,
              })
              const handle = yield* run.dynamic(spec)
              const ref = yield* handle.startChild(void 0)
              yield* TestClock.adjust(Duration.seconds(91))
              yield* ref.removed
              return { removed: true }
            }),
          )),
        Then('the child ref.removed latch opens after the tick timeout')((s) =>
          Effect.sync(() => {
            expect(s.result.removed).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Stream worker continues running past timeout after first element is received',
      Gherkin.Do.pipe(
        When('a stream worker that emits then blocks is run past timeout')('result', () =>
          Effect.scoped(
            Effect.gen(function*() {
              const worker = Daemon.stream({
                name: 'long-lived-stream',
                stream: Stream.make(1).pipe(
                  Stream.concat(Stream.fromEffect(Effect.never)),
                ),
                tick: { tickTimeout: Duration.seconds(90) },
                lock: { mode: 'none' },
              })
              const spec = dynamic({
                name: 'long-lived-sup',
                child: () => worker,
                maxChildren: 1,
              })
              const handle = yield* run.dynamic(spec)
              const ref = yield* handle.startChild(void 0)
              yield* TestClock.adjust(Duration.seconds(100))
              const stillRunning = yield* ref.removed.pipe(
                Effect.timeout('0 millis'),
                Effect.either,
              )
              return { stillRunning: Either.isLeft(stillRunning) }
            }),
          )),
        Then('worker is still running after timeout')((s) =>
          Effect.sync(() => {
            expect(s.result.stillRunning).toBe(true)
          })
        ),
      ),
    )
  })
