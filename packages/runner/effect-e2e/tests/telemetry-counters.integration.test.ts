import type { MemorySite } from '@systemfsoftware/effect-e2e/engine'
import { renderList, type Report1 } from '@systemfsoftware/effect-e2e/report'
import type { StepHandle, TestSessionShape } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import type * as Metric from 'effect/Metric'

import { done, GREET_SITE, RENAMED_SITE, tap } from './__fixtures__/agent-sites.fixture.js'
import { resolveCheck } from './__fixtures__/judgment-sites.fixture.js'
import { totalIn } from './__fixtures__/otlp-body.schema.js'
import { collected } from './__fixtures__/otlp-collector.fixture.js'
import { decodedFromJson, reportOf } from './__fixtures__/report-runs.fixture.js'
import { countedEngine, inTry, type World, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const ALL_DONE = resolveCheck({
  combine: 'all',
  literals: [{ predicate: 'text', target: { ref: 'done' }, match: 'contains', value: 'All done' }],
})

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const continuesToTheEnd = (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined))
    yield* session.act({ instruction: 'continue to the end' }).pipe(Effect.flatMap(joined), Effect.result)
    yield* session.assert({ statement: 'the page says all done' }).pipe(Effect.flatMap(joined), Effect.result)
    return yield* session.endAttempt({ _tag: 'Finished', errors: [] })
  })

const triedOn = (world: World, retry: number, site: MemorySite) =>
  Effect.flatMap(
    countedEngine(site),
    (engine) => inTry({ world, retry, engine: engine.source, body: continuesToTheEnd }),
  )

const mixedRun = Effect.gen(function*() {
  const world = yield* worldOf({
    mode: 'read-write',
    answers: [tap('greet'), tap('next'), done('continued'), ALL_DONE, tap('next'), done('continued')],
  })
  yield* triedOn(world, 0, GREET_SITE)
  yield* triedOn(world, 1, GREET_SITE)
  yield* triedOn(world, 2, RENAMED_SITE)
  return yield* decodedFromJson(reportOf({ world, entries: yield* world.log.entries }))
})

interface Metered {
  readonly lookup: string
  readonly modelCalls: number
  readonly input: number
  readonly output: number
}

const meteredStepsOf = (report: Report1): ReadonlyArray<Metered> =>
  report.results.flatMap((result) =>
    result.attempts.flatMap((attempt) =>
      Match.valueTags(attempt, {
        Ran: ({ steps }) =>
          steps.flatMap((step) =>
            Match.value(step).pipe(
              Match.tag('ActStep', 'AssertStep', 'WaitForStep', 'ExtractStep', (metered): ReadonlyArray<Metered> => [{
                lookup: metered.cache.lookup._tag,
                modelCalls: metered.modelCalls,
                input: metered.tokens.input,
                output: metered.tokens.output,
              }]),
              Match.orElse((): ReadonlyArray<Metered> => []),
            )
          ),
        Skipped: (): ReadonlyArray<Metered> => [],
      })
    )
  )

const foldedOf = (steps: ReadonlyArray<Metered>) => ({
  replayed: steps.filter((step) => step.lookup === 'Replayed').length,
  handedOff: steps.filter((step) => step.lookup === 'HandedOff').length,
  missed: steps.filter((step) => step.lookup === 'Missed').length,
  modelCalls: steps.reduce((total, step) => total + step.modelCalls, 0),
  inputTokens: steps.reduce((total, step) => total + step.input, 0),
  outputTokens: steps.reduce((total, step) => total + step.output, 0),
})

const EXPECTED = { replayed: 3, handedOff: 1, missed: 2, modelCalls: 6, inputTokens: 600, outputTokens: 60 }

Feature('Counting replays, model calls and tokens the way the report does')
  .withLayer(Layer.empty)
  .live('the run exports to a real loopback OTLP receiver over a real HTTP client')
  .body(({ scenario }) => {
    scenario(
      'The exported counters equal the step records, and the hit rate is replayed over every cache-eligible step',
      Gherkin.Do.pipe(
        Given('a run exporting to the collector')('registry', () => Effect.succeed<Metric.MetricRegistry>(new Map())),
        When('one test misses and records, then replays, then hands off on a renamed control')(
          'exported',
          ({ registry }) => collected(registry)(mixedRun),
        ),
        Then(
          'the counters, the records, the summary and the printed list agree on three replays, one handoff and two misses',
        )((
          s,
          expect,
        ) => {
          const total = totalIn(s.exported.metrics)
          return expect({
            exported: {
              replayed: total('e2e.replay.outcomes', { outcome: 'replayed' }),
              handedOff: total('e2e.replay.outcomes', { outcome: 'handed_off' }),
              missed: total('e2e.replay.outcomes', { outcome: 'missed' }),
              modelCalls: total('e2e.model.calls'),
              inputTokens: total('e2e.model.tokens', { kind: 'input' }),
              outputTokens: total('e2e.model.tokens', { kind: 'output' }),
            },
            records: foldedOf(meteredStepsOf(s.exported.value)),
            hitRate: s.exported.value.summary.hitRate,
            listed: renderList(s.exported.value).split('\n').filter((line) => line.startsWith('cache:')),
          }).toEqual({
            exported: EXPECTED,
            records: EXPECTED,
            hitRate: 0.5,
            listed: ['cache: 3 replayed, 1 handed off, 2 missed (hit rate 50%)'],
          })
        }),
      ),
    )
  })
