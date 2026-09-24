import { run } from '@systemfsoftware/effect-daemon-spec'
import { Daemon } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Option, Ref, Schema } from 'effect'
import type { Tracer } from 'effect'
import { TestClock } from 'effect/testing'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it })

type AnyAttr<V = unknown> = V
const SPAN_NAME = 'test.work.span' as const

const recordPrereqSpan = (spans: Ref.Ref<ReadonlyArray<Tracer.AnySpan | undefined>>) =>
  Effect.option(Effect.currentSpan).pipe(
    Effect.flatMap((span) => Ref.update(spans, (arr) => [...arr, Option.getOrUndefined(span)])),
  )

const recordWorkSpan = (names: Ref.Ref<string[]>) =>
  Effect.currentSpan.pipe(
    Effect.flatMap((span) => Ref.update(names, (arr) => [...arr, span.name])),
  )

/** The latch's Result at zero virtual millis: a Success means it was already open. */
const awaitAtZero = (await_: Effect.Effect<void>) => await_.pipe(Effect.timeout('0 millis'), Effect.result)

Feature('Poll Prereq Gate')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'A poll whose prereq finds nothing emits no work span',
      Gherkin.Do.pipe(
        Given('span probes')('probes', () =>
          Effect.all({
            prereqSpans: Ref.make<ReadonlyArray<Tracer.AnySpan | undefined>>([]),
            workSpanNames: Ref.make<string[]>([]),
          })),
        When('a poll worker whose prereq finds no work runs')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-none',
              prereq: recordPrereqSpan(s.probes.prereqSpans).pipe(
                Effect.as(Option.none<number>()),
              ),
              work: () => recordWorkSpan(s.probes.workSpanNames),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(20))
            return health
          })),
        Then('no work span is created, the prereq ran without a span, and the worker still becomes ready')(
          (s, expect) =>
            Effect.gen(function*() {
              const names = yield* Ref.get(s.probes.workSpanNames)
              const prereqSpans = yield* Ref.get(s.probes.prereqSpans)
              const ready = yield* awaitAtZero(s.health.ready.await)
              yield* expect({ names, prereqSpans, ready }).toMatchObject({
                names: [],
                prereqSpans: expect.schemaMatching(Schema.NonEmptyArray(Schema.Undefined)),
                ready: { _tag: 'Success', success: undefined },
              })
            }),
        ),
      ),
    )

    scenario(
      'A poll whose prereq finds work runs it inside the named span',
      Gherkin.Do.pipe(
        Given('span probes')('probes', () =>
          Effect.all({
            prereqSpans: Ref.make<ReadonlyArray<Tracer.AnySpan | undefined>>([]),
            workSpanNames: Ref.make<string[]>([]),
            workData: Ref.make<number[]>([]),
          })),
        When('a poll worker whose prereq finds work runs')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-some',
              prereq: recordPrereqSpan(s.probes.prereqSpans).pipe(
                Effect.as(Option.some(42)),
              ),
              work: (data) =>
                recordWorkSpan(s.probes.workSpanNames).pipe(
                  Effect.andThen(Ref.update(s.probes.workData, (arr) => [...arr, data])),
                ),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(20))
            return health
          })),
        Then('work runs inside the named span with the data the prereq found, and no prereq tick has a span')(
          (s, expect) =>
            Effect.gen(function*() {
              const names = yield* Ref.get(s.probes.workSpanNames)
              const data = yield* Ref.get(s.probes.workData)
              const prereqSpans = yield* Ref.get(s.probes.prereqSpans)
              yield* expect({ data, names, prereqSpans }).toMatchObject({
                data: expect.schemaMatching(Schema.Array(Schema.Literal(42))),
                names: expect.schemaMatching(Schema.NonEmptyArray(Schema.Literal(SPAN_NAME))),
                prereqSpans: expect.schemaMatching(Schema.Array(Schema.Undefined)),
              })
            }),
        ),
      ),
    )

    scenario(
      'Each work span starts a new trace, ignoring the caller trace',
      Gherkin.Do.pipe(
        Given('a rooted probe')('workSpanParents', () => Ref.make<ReadonlyArray<Tracer.AnySpan | undefined>>([])),
        When('a poll worker with work runs while a caller trace is active')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-root',
              prereq: Effect.succeedSome(1),
              work: () =>
                Effect.currentSpan.pipe(
                  Effect.flatMap((span) =>
                    Ref.update(s.workSpanParents, (arr) => [...arr, Option.getOrUndefined(span.parent)])
                  ),
                ),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker).pipe(Effect.withSpan('caller.trace'))
            yield* TestClock.adjust(Duration.millis(20))
            return health
          })),
        Then('every work span has no parent')((s, expect) =>
          Ref.get(s.workSpanParents).pipe(
            Effect.flatMap((parents) =>
              expect({ parents }).toMatchObject({
                parents: expect.schemaMatching(Schema.NonEmptyArray(Schema.Undefined)),
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'Configured span attributes annotate the conditional work span',
      Gherkin.Do.pipe(
        Given('a captured attribute map')(
          'attrs',
          () => Ref.make<Option.Option<ReadonlyMap<string, AnyAttr>>>(Option.none()),
        ),
        When('a poll worker configured with span attributes finds work')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-attrs',
              prereq: Effect.succeedSome(1),
              work: () =>
                Effect.currentSpan.pipe(
                  Effect.flatMap((span) => Ref.set(s.attrs, Option.some(span.attributes))),
                ),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              tickHooks: { spanAttributes: Effect.succeed({ 'app.gate': 'on' }) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(20))
            return health
          })),
        Then('the work span carries the configured attribute')((s, expect) =>
          Ref.get(s.attrs).pipe(
            Effect.flatMap((attrs) =>
              expect(Option.map(attrs, (attributes) => attributes.get('app.gate'))).toEqual(Option.some('on'))
            ),
          )
        ),
      ),
    )

    scenario(
      'A failing prereq fails the tick without running work',
      Gherkin.Do.pipe(
        Given('a work counter')('workCount', () => Ref.make(0)),
        When('a poll worker whose prereq fails runs')('result', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-prereq-fail',
              prereq: Effect.fail('prereq-boom'),
              work: () => Ref.update(s.workCount, (n) => n + 1),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(20))
            return { health }
          })),
        Then('the worker never becomes ready and work is never invoked')((s, expect) =>
          Effect.gen(function*() {
            const ready = yield* awaitAtZero(s.result.health.ready.await)
            const workCount = yield* Ref.get(s.workCount)
            yield* expect({ ready, workCount }).toEqual({
              ready: expect.objectContaining({
                _tag: 'Failure',
                failure: expect.objectContaining({ _tag: 'TimeoutError' }),
              }),
              workCount: 0,
            })
          })
        ),
      ),
    )

    scenario(
      'Omitting the prereq runs work inside the span on every tick',
      Gherkin.Do.pipe(
        Given('a span probe')('workSpanNames', () => Ref.make<string[]>([])),
        When('a poll worker without a prereq runs')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'no-prereq',
              work: recordWorkSpan(s.workSpanNames),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(20))
            return health
          })),
        Then('a work span is created on every tick')((s, expect) =>
          Ref.get(s.workSpanNames).pipe(
            Effect.flatMap((names) =>
              expect(names).toSatisfy(
                (values) => values.length >= 3 && values.every((name) => name === SPAN_NAME),
                `at least three ticks each created a work span named '${SPAN_NAME}'`,
              )
            ),
          )
        ),
      ),
    )

    scenario(
      'A failure inside work propagates and stops the worker',
      Gherkin.Do.pipe(
        Given('a span probe')('workSpanNames', () => Ref.make<string[]>([])),
        When('a poll worker whose work fails after the prereq runs')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-work-fail',
              prereq: Effect.succeedSome(7),
              work: () =>
                recordWorkSpan(s.workSpanNames).pipe(
                  Effect.andThen(Effect.fail('work-boom')),
                ),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.millis(20))
            return health
          })),
        Then('the work span was entered at least once and the worker never becomes ready')((s, expect) =>
          Effect.gen(function*() {
            const names = yield* Ref.get(s.workSpanNames)
            const ready = yield* awaitAtZero(s.health.ready.await)
            yield* expect({ names, ready }).toEqual({
              names: expect.arrayContaining([SPAN_NAME]),
              ready: expect.objectContaining({
                _tag: 'Failure',
                failure: expect.objectContaining({ _tag: 'TimeoutError' }),
              }),
            })
          })
        ),
      ),
    )

    scenario(
      'A prereq slower than the tick timeout fails the tick before any work span',
      Gherkin.Do.pipe(
        Given('a work counter')('workCount', () => Ref.make(0)),
        When('a poll worker whose prereq exceeds the tick timeout runs')('result', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-prereq-timeout',
              prereq: Effect.sleep(Duration.seconds(100)).pipe(
                Effect.as(Option.some(1)),
              ),
              work: () => Ref.update(s.workCount, (n) => n + 1),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker)
            yield* TestClock.adjust(Duration.seconds(91))
            return { health }
          })),
        Then('the worker never becomes ready and work is never invoked')((s, expect) =>
          Effect.gen(function*() {
            const ready = yield* awaitAtZero(s.result.health.ready.await)
            const workCount = yield* Ref.get(s.workCount)
            yield* expect({ ready, workCount }).toEqual({
              ready: expect.objectContaining({
                _tag: 'Failure',
                failure: expect.objectContaining({ _tag: 'TimeoutError' }),
              }),
              workCount: 0,
            })
          })
        ),
      ),
    )
  })
