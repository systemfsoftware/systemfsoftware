import type { ModelAnswer } from '@systemfsoftware/effect-e2e/model'
import { buildReport, decodeReport, renderJson, type Report1, RunId, TestId } from '@systemfsoftware/effect-e2e/report'
import type { AttemptEntry, AttemptTest, StepHandle, TestSessionShape } from '@systemfsoftware/effect-e2e/run'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { done, GREET_SITE, tap } from './agent-sites.fixture.js'
import { proposeCause, resolveCheck } from './judgment-sites.fixture.js'
import { countedEngine, inTry, type World } from './run-sessions.fixture.js'

export const SAVES: AttemptTest = {
  id: TestId.make('tests/save.e2e.ts > saves'),
  title: 'saves',
  file: 'tests/save.e2e.ts',
}

const STARTED = DateTime.makeUnsafe('2026-10-23T09:00:00.000Z')
const ENDED = DateTime.makeUnsafe('2026-10-23T09:05:00.000Z')

export const helloContains = (value: string): ModelAnswer =>
  resolveCheck({
    combine: 'all',
    literals: [{ predicate: 'text', target: { ref: 'hello' }, match: 'contains', value }],
  })

export const NOT_GOODBYE: ModelAnswer = proposeCause({
  cause: 'product',
  evidence: [{ ref: 'hello' }],
  reason: 'it says hello',
})

export const GREETS_ANSWERS: ReadonlyArray<ModelAnswer> = [tap('greet'), done('greeted Ada'), helloContains('Hello')]

const joined = <A, E>(handle: StepHandle<A, E>): Effect.Effect<A, E> => handle.join

const greetsAndChecks = (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined))
    yield* session.act({ instruction: 'press Greet' }).pipe(Effect.flatMap(joined), Effect.result)
    yield* session.assert({ statement: 'the greeting says hello' }).pipe(Effect.flatMap(joined), Effect.result)
    return yield* session.endAttempt({ _tag: 'Finished', errors: [] })
  })

const asserts = (statement: string) => (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/greeted').pipe(Effect.flatMap(joined))
    yield* session.assert({ statement }).pipe(Effect.flatMap(joined), Effect.result)
    return yield* session.endAttempt({ _tag: 'Finished', errors: [] })
  })

const unreachable = (session: TestSessionShape) =>
  Effect.gen(function*() {
    yield* session.open('/').pipe(Effect.flatMap(joined), Effect.result)
    yield* session.open('/missing').pipe(Effect.flatMap(joined), Effect.result)
    return yield* session.endAttempt({ _tag: 'Finished', errors: [] })
  })

export const greets = (world: World) =>
  Effect.flatMap(
    countedEngine(GREET_SITE),
    (engine) => inTry({ world, retry: 0, engine: engine.source, body: greetsAndChecks }),
  )

export const asserting = (input: {
  readonly world: World
  readonly retry: number
  readonly statement: string
  readonly test?: AttemptTest
}) =>
  Effect.flatMap(countedEngine(GREET_SITE), (engine) =>
    inTry({
      world: input.world,
      retry: input.retry,
      engine: engine.source,
      test: input.test ?? SAVES,
      body: asserts(input.statement),
    }))

export const blockedTry = (input: { readonly world: World; readonly test: AttemptTest }) =>
  Effect.flatMap(
    countedEngine(GREET_SITE),
    (engine) => inTry({ world: input.world, retry: 0, engine: engine.source, test: input.test, body: unreachable }),
  )

export const reportOf = (input: { readonly world: World; readonly entries: ReadonlyArray<AttemptEntry> }): Report1 =>
  buildReport({
    run: {
      id: RunId.make('run-508'),
      project: input.world.config.projectId,
      startedAt: STARTED,
      finishedAt: ENDED,
      errors: [],
    },
    entries: input.entries,
  })

export const decodedFromJson = (report: Report1): Effect.Effect<Report1, Schema.SchemaError> =>
  renderJson(report).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))),
    Effect.flatMap(decodeReport),
  )
