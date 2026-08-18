import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Option, Ref, Result } from 'effect'
import { TestClock } from 'effect/testing'
import { expect } from 'vitest'
import { run } from '../src/mod.js'
import { Daemon } from '../src/mod.js'
import { NoopLayer } from './__fixtures__/SharedLayers.js'

const Feature = makeFeature({ it, layer })

const SPAN_NAME = 'test.work.span' as const

const recordPrereqSpan = (seen: Ref.Ref<boolean[]>) =>
  Effect.option(Effect.currentSpan).pipe(
    Effect.flatMap((span) => Ref.update(seen, (arr) => [...arr, Option.isSome(span)])),
  )

const recordWorkSpan = (names: Ref.Ref<string[]>) =>
  Effect.currentSpan.pipe(
    Effect.flatMap((span) => Ref.update(names, (arr) => [...arr, span.name])),
  )

const readyStaysClosed = (await_: Effect.Effect<void>) =>
  await_.pipe(
    Effect.timeout('0 millis'),
    Effect.result,
    Effect.tap((result) =>
      Effect.sync(() => {
        expect(result).toEqual(Result.fail(expect.anything()))
      })
    ),
    Effect.asVoid,
  )

Feature('Poll Prereq Gate')
  .withLayer(NoopLayer)
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'A poll whose prereq finds nothing emits no work span',
      Gherkin.Do.pipe(
        Given('span probes')('probes', () =>
          Effect.all({
            prereqSpanSeen: Ref.make<boolean[]>([]),
            workSpanNames: Ref.make<string[]>([]),
          })),
        When('a poll worker whose prereq finds no work runs')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-none',
              prereq: recordPrereqSpan(s.probes.prereqSpanSeen).pipe(
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
        Then('no work span is created')((s) =>
          Ref.get(s.probes.workSpanNames).pipe(
            Effect.flatMap((names) =>
              Effect.sync(() => {
                expect(names).toEqual([])
              })
            ),
          )
        ),
        And('the prereq ran without a span')((s) =>
          Ref.get(s.probes.prereqSpanSeen).pipe(
            Effect.flatMap((seen) =>
              Effect.sync(() => {
                expect(seen.length).toBeGreaterThan(0)
                expect(seen.every((value) => value === false)).toBe(true)
              })
            ),
          )
        ),
        And('the worker still becomes ready')((s) => s.health.ready.await),
      ),
    )

    scenario(
      'A poll whose prereq finds work runs it inside the named span',
      Gherkin.Do.pipe(
        Given('span probes')('probes', () =>
          Effect.all({
            prereqSpanSeen: Ref.make<boolean[]>([]),
            workSpanNames: Ref.make<string[]>([]),
            workData: Ref.make<number[]>([]),
          })),
        When('a poll worker whose prereq finds work runs')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-some',
              prereq: recordPrereqSpan(s.probes.prereqSpanSeen).pipe(
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
        Then('work runs inside the named span')((s) =>
          Ref.get(s.probes.workSpanNames).pipe(
            Effect.flatMap((names) =>
              Effect.sync(() => {
                expect(names.length).toBeGreaterThan(0)
                expect(names.every((name) => name === SPAN_NAME)).toBe(true)
              })
            ),
          )
        ),
        And('the work receives the data the prereq found')((s) =>
          Ref.get(s.probes.workData).pipe(
            Effect.flatMap((data) =>
              Effect.sync(() => {
                expect(data.every((value) => value === 42)).toBe(true)
              })
            ),
          )
        ),
        And('the prereq ran without a span')((s) =>
          Ref.get(s.probes.prereqSpanSeen).pipe(
            Effect.flatMap((seen) =>
              Effect.sync(() => {
                expect(seen.every((value) => value === false)).toBe(true)
              })
            ),
          )
        ),
      ),
    )

    scenario(
      'Each work span starts a new trace, ignoring the caller trace',
      Gherkin.Do.pipe(
        Given('a rooted probe')('workSpanRooted', () => Ref.make<boolean[]>([])),
        When('a poll worker with work runs while a caller trace is active')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-root',
              prereq: Effect.succeed(Option.some(1)),
              work: () =>
                Effect.currentSpan.pipe(
                  Effect.flatMap((span) => Ref.update(s.workSpanRooted, (arr) => [...arr, Option.isNone(span.parent)])),
                ),
              interval: Duration.millis(1),
              tick: { spanName: SPAN_NAME, tickTimeout: Duration.seconds(90) },
              lock: { mode: 'none' },
            })
            const health = yield* run.worker(worker).pipe(Effect.withSpan('caller.trace'))
            yield* TestClock.adjust(Duration.millis(20))
            return health
          })),
        Then('every work span has no parent')((s) =>
          Ref.get(s.workSpanRooted).pipe(
            Effect.flatMap((rooted) =>
              Effect.sync(() => {
                expect(rooted.length).toBeGreaterThan(0)
                expect(rooted.every((value) => value === true)).toBe(true)
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
          () => Ref.make<Option.Option<ReadonlyMap<string, unknown>>>(Option.none()),
        ),
        When('a poll worker configured with span attributes finds work')('health', (s) =>
          Effect.gen(function*() {
            const worker = Daemon.poll({
              name: 'gate-attrs',
              prereq: Effect.succeed(Option.some(1)),
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
        Then('the work span carries the configured attribute')((s) =>
          Ref.get(s.attrs).pipe(
            Effect.flatMap((attrs) =>
              Effect.sync(() => {
                expect(Option.isSome(attrs)).toBe(true)
                expect(Option.getOrThrow(attrs).get('app.gate')).toBe('on')
              })
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
        Then('the worker never becomes ready')((s) => readyStaysClosed(s.result.health.ready.await)),
        And('work is never invoked')((s) =>
          Ref.get(s.workCount).pipe(
            Effect.flatMap((count) =>
              Effect.sync(() => {
                expect(count).toBe(0)
              })
            ),
          )
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
        Then('a work span is created on every tick')((s) =>
          Ref.get(s.workSpanNames).pipe(
            Effect.flatMap((names) =>
              Effect.sync(() => {
                expect(names.length).toBeGreaterThanOrEqual(3)
                expect(names.every((name) => name === SPAN_NAME)).toBe(true)
              })
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
              prereq: Effect.succeed(Option.some(7)),
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
        Then('the work span was entered')((s) =>
          Ref.get(s.workSpanNames).pipe(
            Effect.flatMap((names) =>
              Effect.sync(() => {
                expect(names).toContain(SPAN_NAME)
              })
            ),
          )
        ),
        And('the worker never becomes ready')((s) => readyStaysClosed(s.health.ready.await)),
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
        Then('the worker never becomes ready')((s) => readyStaysClosed(s.result.health.ready.await)),
        And('work is never invoked')((s) =>
          Ref.get(s.workCount).pipe(
            Effect.flatMap((count) =>
              Effect.sync(() => {
                expect(count).toBe(0)
              })
            ),
          )
        ),
      ),
    )
  })
