import * as Discern from '@systemfsoftware/discern'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { expect, it } from 'vitest'

const { Model } = Discern

/** A provider built from `(options) => Record<decisionId, ProviderAnswer>`. */
const providerOf = (fn) =>
  Model.provider((options) =>
    Effect.map(
      Effect.promise(async () => fn(options)),
      (answers) => ({ answers, usage: { inputTokens: undefined, outputTokens: undefined } }),
    )
  )

/** Run an Effect against a provider function and an optional middleware stack. */
const run = (effect, fn, middleware = []) =>
  Effect.runPromise(Effect.provide(effect, Model.layer(providerOf(fn), middleware)))

/** Map every requested decision to a provider answer. */
const answersFor = (options, values) => {
  const answers = {}
  for (const [key, decision] of Object.entries(options.decisions)) {
    answers[key] = values(decision, key)
  }
  return answers
}

const classifyAnswer = (label, probabilities) => ({ _tag: 'Classify', label, probabilities })
const probabilityAnswer = (probability) => ({ _tag: 'Probability', probability })
const rateAnswer = (rating, probabilities) => ({ _tag: 'Rate', rating, probabilities })

/**
 * Plain Error subclasses are wrapped by Effect; AiError is yieldable and
 * arrives as itself (and exposes its reason as `.cause`).
 */
const causeOf = (error) => error?.cause ?? error

it('batches unique decisions and reuses a classification across cases', async () => {
  let calls = 0
  let decisionCount = 0
  const model = (options) => {
    calls += 1
    decisionCount = Object.keys(options.decisions).length
    return answersFor(options, (decision) =>
      decision._tag === 'Classify'
        ? classifyAnswer('breaking', { none: 0.01, behavioral: 0.09, breaking: 0.9 })
        : probabilityAnswer(0.91))
  }

  const OnChange = Discern.on(Schema.String)
  const impact = OnChange.classify({
    id: 'api-impact',
    instructions: 'Classify API impact',
    criteria: { none: 'none', behavioral: 'behavioral', breaking: 'breaking' },
  })
  const risky = OnChange.probability({ id: 'regression-risk', instructions: 'Likely to regress' })

  const review = Discern.type(Schema.String).pipe(
    Discern.when(Discern.and(impact.is('breaking'), risky.above(0.8)), (change) => `block:${change}`),
    Discern.when(impact.is('breaking'), (change) => `migrate:${change}`),
    Discern.orElse((change) => `ship:${change}`),
  )

  expect(await run(review('change-1'), model)).toBe('block:change-1')
  expect(calls, 'one provider call for the whole matcher').toBe(1)
  expect(decisionCount, 'the shared classification is requested once').toBe(2)
  expect(review.plan.decisions.length).toBe(2)
  expect(review.plan.decisions[0].id).toBe('api-impact')
})

it('tri-state uncertainty does not silently fall through to the fallback', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(0.7))

  const risk = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const matcher = Discern.type(Schema.String).pipe(
    Discern.when(risk.above(0.8, { missBelow: 0.5 }), () => 'block', { id: 'high-risk' }),
    Discern.onUncertain((_input, context) => `review:${context.caseId}`),
    Discern.orElse(() => 'ship'),
  )

  expect(await run(matcher('x'), model)).toBe('review:high-risk')

  const unsafeFallback = Discern.type(Schema.String).pipe(
    Discern.when(risk.above(0.8, { missBelow: 0.5 }), () => 'block', { id: 'high-risk' }),
    Discern.orElse(() => 'ship'),
  )

  // `assert.rejects(fn, predicate)` has no matcher form: the run must reject with
  // an `UncertainMatchError`, so resolving instead fails the checks below.
  const rejected = await run(unsafeFallback('x'), model).then(
    () => undefined,
    (error) => error,
  )
  expect(rejected).toBeDefined()
  expect(causeOf(rejected)?._tag).toBe('UncertainMatchError')
})

it('semantic and deterministic patterns compose and can avoid the provider', async () => {
  let calls = 0
  const model = (options) => {
    calls += 1
    return answersFor(options, () => probabilityAnswer(0.99))
  }

  const risk = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const onlySourceFiles = Discern.deterministic((path) => path.endsWith('.ts'), {
    id: 'source-file',
    description: 'Only TypeScript source files',
  })
  const riskySource = Discern.and(onlySourceFiles, risk.above(0.8))

  const policy = Discern.type(Schema.String).pipe(
    Discern.when(riskySource, () => 'review'),
    Discern.orElse(() => 'skip'),
  )

  expect(await run(policy('README.md'), model)).toBe('skip')
  expect(calls, 'a deterministic miss makes the semantic observation unnecessary').toBe(0)
  expect(await run(policy('index.ts'), model)).toBe('review')
  expect(calls).toBe(1)
})

it('classification match is exhaustively dispatched by label', async () => {
  const model = (options) =>
    answersFor(
      options,
      () => classifyAnswer('behavioral', { none: 0.05, additive: 0.1, behavioral: 0.8, breaking: 0.05 }),
    )

  const impact = Discern.on(Schema.String).classify({
    id: 'impact',
    instructions: 'Classify impact',
    criteria: { none: 'none', additive: 'additive', behavioral: 'behavioral', breaking: 'breaking' },
  })

  const handle = Discern.match(impact).pipe(
    Discern.case('none', () => 'ship'),
    Discern.case('additive', () => 'docs'),
    Discern.case('behavioral', () => 'review'),
    Discern.case('breaking', () => 'migrate'),
    Discern.exhaustive,
  )

  expect(await run(handle('change'), model)).toBe('review')
})

it('ordered ratings compare by position on the scale', async () => {
  const model = (options) => answersFor(options, () => rateAnswer(2, { trivial: 0, minor: 0, major: 1, critical: 0 }))

  const severity = Discern.on(Schema.String).rate({
    id: 'severity',
    instructions: 'Rate severity',
    criteria: ['trivial', 'minor', 'major', 'critical'],
  })

  const triage = Discern.type(Schema.String).pipe(
    Discern.when(severity.atMost('minor'), () => 'queue'),
    Discern.when(severity.atLeast('major'), () => 'escalate'),
    Discern.orElse(() => 'unclassified'),
  )

  expect(await run(triage('x'), model)).toBe('escalate')
})

it('compiled plans are inspectable and stable for stable decision ids', () => {
  const make = () => {
    const OnChange = Discern.on(Schema.String)
    const impact = OnChange.classify({
      id: 'impact',
      instructions: 'Classify impact',
      criteria: { safe: 'safe', breaking: 'breaking' },
    })
    return Discern.type(Schema.String).pipe(
      Discern.when(impact.is('breaking'), () => 'block', { id: 'breaking' }),
    )
  }

  const a = Discern.compile(make())
  const b = Discern.compile(make())
  expect(a).toStrictEqual(b)
  expect(a.decisions[0].id).toBe('impact')
  expect(a.fingerprint).toMatch(/^plan_/)
})

it('a trace reports which cases were evaluated and how each resolved', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(0.2))
  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })

  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => 'block', { id: 'high' }),
    Discern.orElse(() => 'ship'),
  )

  const { value, trace } = await run(policy.runWithTrace('x'), model)
  expect(value).toBe('ship')
  expect(trace.version).toBe(2)
  expect(trace.cases.map((item) => [item.id, item.status])).toStrictEqual([['high', 'Miss']])
  expect(trace.selected).toStrictEqual({ _tag: 'Fallback' })
  expect(trace.answers.risk.probability).toBe(0.2)
})

it('reusing one decision id for two different definitions is rejected', () => {
  const OnChange = Discern.on(Schema.String)
  const a = OnChange.probability({ id: 'risk', instructions: 'Risky' })
  const b = OnChange.probability({ id: 'risk', instructions: 'Something else entirely' })

  expect(() => Discern.and(a.above(0.8), b.above(0.8))).toThrow(/Decision id collision/)
})

it('Eval.sweep reuses one semantic observation per example across thresholds', async () => {
  let calls = 0
  const model = (options) => {
    calls += 1
    return answersFor(options, () => probabilityAnswer(Number(options.state)))
  }

  const schema = Schema.String
  const risky = Discern.on(schema).probability({ id: 'risk', instructions: 'Risky' })
  const examples = [
    { input: '0.95', expected: true },
    { input: '0.80', expected: true },
    { input: '0.55', expected: false },
    { input: '0.10', expected: false },
  ]

  const result = await run(
    Discern.Eval.calibrate({
      schema,
      values: [0.5, 0.7, 0.9],
      pattern: (threshold) => risky.atLeast(threshold),
      examples,
      metric: 'f1',
    }),
    model,
  )

  expect(calls, 'a threshold sweep does not multiply provider calls').toBe(examples.length)
  expect(result.best.value).toBe(0.7)
  expect(result.best.report.metrics.f1).toBe(1)
})

// -------------------------------------------------------------------------------------------------
// DecisionModel middleware
// -------------------------------------------------------------------------------------------------

it('recording captures observations that replay reruns without a provider', async () => {
  let calls = 0
  let handled = 0
  const model = (options) => {
    calls += 1
    return answersFor(options, () => probabilityAnswer(0.95))
  }

  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), (input) => {
      handled += 1
      return `block:${input}`
    }),
    Discern.orElse((input) => `ship:${input}`),
  )

  const store = Model.store()
  expect(await run(policy('x'), model, [Model.recording(store)])).toBe('block:x')
  expect(calls).toBe(1)
  expect(handled).toBe(1)
  expect(store.size()).toBe(1)

  const replayed = await Effect.runPromise(policy.replay('x', store.snapshot()))
  expect(replayed).toBe('block:x')
  expect(calls, 'replay reaches no provider').toBe(1)
  expect(handled, 'ordinary handler logic is replayed, not memoized').toBe(2)
})

it('observations are serializable and reload into a fresh store', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(0.95))
  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => 'block'),
    Discern.orElse(() => 'ship'),
  )

  const store = Model.store()
  await run(policy('x'), model, [Model.recording(store)])

  const roundTripped = JSON.parse(JSON.stringify(store.snapshot()))
  expect(await Effect.runPromise(policy.replay('x', roundTripped))).toBe('block')
})

it('replay fails when the decision definition changed since recording', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(0.95))
  const OnChange = Discern.on(Schema.String)

  const before = OnChange.probability({ id: 'risk', instructions: 'Risky' })
  const after = OnChange.probability({ id: 'risk', instructions: 'Risky, reworded' })

  const policyOf = (decision) =>
    Discern.type(Schema.String).pipe(
      Discern.when(decision.above(0.8), () => 'block'),
      Discern.orElse(() => 'ship'),
    )

  const store = Model.store()
  await run(policyOf(before)('x'), model, [Model.recording(store)])

  expect(await Effect.runPromise(policyOf(before).replay('x', store.snapshot()))).toBe('block')
  const replayMiss = await Effect.runPromise(policyOf(after).replay('x', store.snapshot())).then(
    () => undefined,
    (error) => error,
  )
  expect(replayMiss).toBeDefined()
  expect(Model.isReplayMiss(replayMiss)).toBe(true)
})

it('the same decision asked about different inputs is recorded separately', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(options.state === 'risky.ts' ? 0.95 : 0.05))

  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => 'block'),
    Discern.orElse(() => 'ship'),
  )

  const store = Model.store()
  expect(await run(policy('risky.ts'), model, [Model.recording(store)])).toBe('block')
  expect(await run(policy('safe.ts'), model, [Model.recording(store)])).toBe('ship')
  expect(store.size(), 'content addressing keys on the input, not just the decision id').toBe(2)

  expect(await Effect.runPromise(policy.replay('risky.ts', store.snapshot()))).toBe('block')
  expect(await Effect.runPromise(policy.replay('safe.ts', store.snapshot()))).toBe('ship')
})

it('caching reuses observations but not handler effects', async () => {
  let calls = 0
  let handled = 0
  const model = (options) => {
    calls += 1
    return answersFor(options, () => probabilityAnswer(0.95))
  }

  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => {
      handled += 1
      return 'block'
    }),
    Discern.orElse(() => 'ship'),
  )

  const store = Model.store()
  const cache = [Model.caching(store)]
  expect(await run(policy('same'), model, cache)).toBe('block')
  expect(await run(policy('same'), model, cache)).toBe('block')
  expect(calls).toBe(1)
  expect(handled).toBe(2)
})

it('caching is partial: only uncached decisions reach the provider', async () => {
  const asked = []
  const model = (options) => {
    asked.push(Object.keys(options.decisions).sort())
    return answersFor(options, () => probabilityAnswer(0.9))
  }

  const OnChange = Discern.on(Schema.String)
  const a = OnChange.probability({ id: 'a', instructions: 'First' })
  const b = OnChange.probability({ id: 'b', instructions: 'Second' })

  const onlyA = Discern.type(Schema.String).pipe(
    Discern.when(a.above(0.8), () => 'a'),
    Discern.orElse(() => 'none'),
  )
  const both = Discern.type(Schema.String).pipe(
    Discern.when(Discern.and(a.above(0.8), b.above(0.8)), () => 'both'),
    Discern.orElse(() => 'none'),
  )

  const store = Model.store()
  const cache = [Model.caching(store)]
  expect(await run(onlyA('x'), model, cache)).toBe('a')
  expect(await run(both('x'), model, cache)).toBe('both')

  expect(asked, 'the second run asks only for the decision it lacks').toStrictEqual([['a'], ['b']])
})

it('a budget limits provider spend and reports what was used', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(0.9))
  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => 'block'),
    Discern.orElse(() => 'ship'),
  )

  const spend = Model.budget({ decisions: 2 })
  const limited = [Model.budgeted(spend)]

  expect(await run(policy('a'), model, limited)).toBe('block')
  expect(await run(policy('b'), model, limited)).toBe('block')
  expect(spend.spent()).toStrictEqual({ decisions: 2, calls: 2 })

  const overBudget = await run(policy('c'), model, limited).then(
    () => undefined,
    (error) => error,
  )
  expect(overBudget).toBeDefined()
  expect(Model.isBudgetExceeded(overBudget)).toBe(true)
})

it('cached observations do not draw from the budget', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(0.9))
  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => 'block'),
    Discern.orElse(() => 'ship'),
  )

  const store = Model.store()
  const spend = Model.budget({ decisions: 1 })
  const stack = [Model.caching(store), Model.budgeted(spend)]

  expect(await run(policy('x'), model, stack)).toBe('block')
  expect(await run(policy('x'), model, stack)).toBe('block')
  expect(spend.spent(), 'the second run was served from cache').toStrictEqual({
    decisions: 1,
    calls: 1,
  })
})

it('one store records and replays a program spanning several policies', async () => {
  let calls = 0
  const model = (options) => {
    calls += 1
    return answersFor(
      options,
      (decision) => decision.instructions === 'Risky' ? probabilityAnswer(0.95) : probabilityAnswer(0.1),
    )
  }

  const OnChange = Discern.on(Schema.String)
  const risky = OnChange.probability({ id: 'risk', instructions: 'Risky' })
  const urgent = OnChange.probability({ id: 'urgent', instructions: 'Urgent' })

  const riskPolicy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => 'risky'),
    Discern.orElse(() => 'safe'),
  )
  const urgencyPolicy = Discern.type(Schema.String).pipe(
    Discern.when(urgent.above(0.8), () => 'now'),
    Discern.orElse(() => 'later'),
  )

  // Two independent policies inside one ordinary Effect program.
  const program = (input) =>
    Effect.gen(function*() {
      const risk = yield* riskPolicy(input)
      const when = yield* urgencyPolicy(input)
      return `${risk}/${when}`
    })

  const store = Model.store()
  expect(await run(program('x'), model, [Model.recording(store)])).toBe('risky/later')
  expect(calls, 'each policy made its own provider call').toBe(2)
  expect(store.size()).toBe(2)

  // The whole program replays from one store, including code Discern never sees.
  const replayed = await Effect.runPromise(
    Effect.provide(program('x'), Model.replayLayer(store.snapshot())),
  )
  expect(replayed).toBe('risky/later')
  expect(calls, 'replaying the composed program reaches no provider').toBe(2)
})

it('interceptors decorate a DecisionModel layer Discern did not build', async () => {
  let calls = 0

  // A layer built with the plain Effect API, as a provider package would ship it.
  const thirdParty = Layer.effect(DecisionModel.DecisionModel)(
    DecisionModel.make({
      decide: (options) =>
        Effect.sync(() => {
          calls += 1
          return {
            answers: answersFor(options, () => probabilityAnswer(0.95)),
            usage: { inputTokens: 7, outputTokens: 3 },
          }
        }),
    }),
  )

  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const policy = Discern.type(Schema.String).pipe(
    Discern.when(risky.above(0.8), () => 'block'),
    Discern.orElse(() => 'ship'),
  )

  const observations = Model.store()
  const spend = Model.budget({ calls: 1 })
  const decorated = thirdParty.pipe(
    Model.intercept([Model.recording(observations), Model.caching(observations), Model.budgeted(spend)]),
  )

  expect(await Effect.runPromise(Effect.provide(policy('x'), decorated))).toBe('block')
  expect(calls).toBe(1)
  expect(observations.size()).toBe(1)

  // The cache absorbs the second run, so the one-call budget is never charged again.
  expect(await Effect.runPromise(Effect.provide(policy('x'), decorated))).toBe('block')
  expect(calls).toBe(1)
  expect(spend.spent()).toStrictEqual({ decisions: 1, calls: 1 })

  expect(await Effect.runPromise(policy.replay('x', observations.snapshot()))).toBe('block')
})

it('reordering classification criteria is a cache miss, not a silent reuse', async () => {
  // Criteria reach the provider in declaration order, so a reorder may change
  // the answer. Addresses must not treat the two as interchangeable.
  const make = (criteria) => Discern.on(Schema.String).classify({ id: 'impact', instructions: 'Classify', criteria })

  const a = make({ safe: 'Safe', breaking: 'Breaks callers' })
  const b = make({ breaking: 'Breaks callers', safe: 'Safe' })
  expect(a.fingerprint).not.toBe(b.fingerprint)

  let calls = 0
  const model = (options) => {
    calls += 1
    return answersFor(options, () => classifyAnswer('safe', { safe: 0.9, breaking: 0.1 }))
  }
  const policyOf = (decision) =>
    Discern.type(Schema.String).pipe(
      Discern.when(decision.is('safe'), () => 'ok'),
      Discern.orElse(() => 'no'),
    )

  const store = Model.store()
  const cache = [Model.caching(store)]
  await run(policyOf(a)('x'), model, cache)
  await run(policyOf(b)('x'), model, cache)
  expect(calls, 'the reordered decision is asked again rather than reusing the answer').toBe(2)
})

it('input objects are addressed structurally, so key order does not split the cache', async () => {
  const Ticket = Schema.Record(Schema.String, Schema.Number)
  const busy = Discern.on(Ticket).probability({ id: 'busy', instructions: 'Busy' })
  const policy = Discern.type(Ticket).pipe(
    Discern.when(busy.above(0.8), () => 'yes'),
    Discern.orElse(() => 'no'),
  )

  let calls = 0
  const model = (options) => {
    calls += 1
    return answersFor(options, () => probabilityAnswer(0.9))
  }

  const store = Model.store()
  const cache = [Model.caching(store)]
  expect(await run(policy({ a: 1, b: 2 }), model, cache)).toBe('yes')
  expect(await run(policy({ b: 2, a: 1 }), model, cache)).toBe('yes')
  expect(calls, 'the same JSON object in a different key order is the same input').toBe(1)
})

it('ask requires a schema-scoped decision', () => {
  const unscoped = Discern.probability({ id: 'u', instructions: 'x' })
  expect(() => Discern.ask(unscoped, 'x')).toThrow(/requires a schema-scoped decision/)
})

it('Eval.sweep skips decisions that deterministic structure already settles', async () => {
  let asked = 0
  const model = (options) => {
    asked += 1
    return answersFor(options, () => probabilityAnswer(0.9))
  }

  const risky = Discern.on(Schema.String).probability({ id: 'risk', instructions: 'Risky' })
  const sourceOnly = Discern.deterministic((path) => path.endsWith('.ts'), { id: 'source' })

  const result = await run(
    Discern.Eval.sweep({
      schema: Schema.String,
      values: [0.5, 0.9],
      pattern: (threshold) => Discern.and(sourceOnly, risky.atLeast(threshold)),
      examples: [
        { input: 'a.ts', expected: true },
        { input: 'b.md', expected: false },
        { input: 'c.md', expected: false },
      ],
    }),
    model,
  )

  expect(asked, 'only the .ts example needs the model').toBe(1)
  expect(result.map((entry) => [entry.value, entry.report.metrics.accuracy])).toStrictEqual([
    [0.5, 1],
    [0.9, 1],
  ])
})

it('replaying can fall through to the model for anything it lacks', async () => {
  const asked = []
  const model = (options) => {
    asked.push(Object.keys(options.decisions).sort())
    return answersFor(options, () => probabilityAnswer(0.9))
  }

  const OnChange = Discern.on(Schema.String)
  const a = OnChange.probability({ id: 'a', instructions: 'First' })
  const b = OnChange.probability({ id: 'b', instructions: 'Second' })

  const onlyA = Discern.type(Schema.String).pipe(
    Discern.when(a.above(0.8), () => 'a'),
    Discern.orElse(() => 'none'),
  )
  const both = Discern.type(Schema.String).pipe(
    Discern.when(Discern.and(a.above(0.8), b.above(0.8)), () => 'both'),
    Discern.orElse(() => 'none'),
  )

  const store = Model.store()
  await run(onlyA('x'), model, [Model.recording(store)])
  expect(asked).toStrictEqual([['a']])

  // Strict replay refuses, because `b` was never recorded.
  const replayMiss = await Effect.runPromise(both.replay('x', store.snapshot())).then(
    () => undefined,
    (error) => error,
  )
  expect(replayMiss).toBeDefined()
  expect(Model.isReplayMiss(replayMiss)).toBe(true)

  // `onMissing: "ask"` replays what it has and asks for the rest.
  const result = await run(both('x'), model, [Model.replaying(store, { onMissing: 'ask' })])
  expect(result).toBe('both')
  expect(asked, 'only the unrecorded decision reached the model').toStrictEqual([['a'], ['b']])
})

it('load replaces the store, so a snapshot round-trips exactly', async () => {
  const model = (options) => answersFor(options, () => probabilityAnswer(0.9))
  const OnChange = Discern.on(Schema.String)
  const a = OnChange.probability({ id: 'a', instructions: 'First' })
  const b = OnChange.probability({ id: 'b', instructions: 'Second' })
  const policyOf = (decision) =>
    Discern.type(Schema.String).pipe(
      Discern.when(decision.above(0.8), () => 'hit'),
      Discern.orElse(() => 'miss'),
    )

  const first = Model.store()
  await run(policyOf(a)('x'), model, [Model.recording(first)])
  const second = Model.store()
  await run(policyOf(b)('x'), model, [Model.recording(second)])

  first.load(second.snapshot())
  expect(first.size(), 'loading replaces rather than merges').toBe(1)

  // `a` was deliberately absent from the loaded fixture, so replay must miss.
  const replayMiss = await Effect.runPromise(policyOf(a).replay('x', first.snapshot())).then(
    () => undefined,
    (error) => error,
  )
  expect(replayMiss).toBeDefined()
  expect(Model.isReplayMiss(replayMiss)).toBe(true)
  expect(await Effect.runPromise(policyOf(b).replay('x', first.snapshot()))).toBe('hit')
})

it('an observation format from another version is rejected, not trusted', () => {
  expect(() => Model.store({ version: 1, entries: {} })).toThrow(/Unsupported observation format v1/)
  expect(() => Model.store().load({ version: 99, entries: {} })).toThrow(
    /Unsupported observation format v99/,
  )
})
