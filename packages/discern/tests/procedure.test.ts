import * as Discern from '@systemfsoftware/discern'
import * as Procedure from '@systemfsoftware/discern/procedure'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { expect, it } from 'vitest'

const { Model } = Discern

const providerOf = (fn) =>
  Model.provider((options) =>
    Effect.map(
      Effect.promise(async () => fn(options)),
      (answers) => ({ answers, usage: { inputTokens: undefined, outputTokens: undefined } }),
    )
  )

const run = (effect, fn, interceptors = []) =>
  Effect.runPromise(Effect.provide(effect, Model.layer(providerOf(fn), interceptors)))

/**
 * A router that answers the routing classification from a table of preferences.
 *
 * Eligibility can narrow the labels a decision actually carries, so the answer
 * is restricted to whatever was asked about and renormalised. A table that
 * already covers exactly those labels is used verbatim, to keep probabilities
 * exact for assertions.
 */
const routesTo = (preferences) => (options) => {
  const answers = {}
  for (const [key, decision] of Object.entries(options.decisions)) {
    if (decision._tag !== 'Classify') {
      answers[key] = { _tag: 'Probability', probability: 0.9 }
      continue
    }
    const labels = Object.keys(decision.criteria)
    const exact = Object.keys(preferences).length === labels.length &&
      labels.every((label) => Object.hasOwn(preferences, label))
    let probabilities
    if (exact) {
      probabilities = preferences
    } else {
      const weights = labels.map((label) => (Object.hasOwn(preferences, label) ? preferences[label] : 0))
      const total = weights.reduce((sum, weight) => sum + weight, 0)
      probabilities = Object.fromEntries(
        labels.map((label, index) => [label, total === 0 ? 1 / labels.length : weights[index] / total]),
      )
    }
    const label = labels.reduce(
      (best, candidate) => (probabilities[candidate] > probabilities[best] ? candidate : best),
      labels[0],
    )
    answers[key] = { _tag: 'Classify', label, probabilities }
  }
  return answers
}

const Request = Schema.String

const find = Procedure.make({
  id: 'find',
  description: 'Locate code relevant to a behavior, feature or concept',
  examples: ['Find where retries are implemented'],
  input: Request,
  run: (request) => Effect.succeed(`found:${request}`),
})

const review = Procedure.make({
  id: 'review',
  description: 'Review a change for correctness and semantic risk',
  input: Request,
  run: (request) => Effect.succeed(`reviewed:${request}`),
})

const testGaps = Procedure.make({
  id: 'test-gaps',
  description: 'Find behavior that lacks sufficient test coverage',
  input: Request,
  run: (request) => Effect.succeed(`gaps:${request}`),
})

it('a procedure runs directly, with no model involved', async () => {
  expect(await Effect.runPromise(find.run('retries'))).toBe('found:retries')
})

it('a registry routes a confident request to one procedure', async () => {
  const code = Procedure.registry(Request, [find, review, testGaps])

  const result = await run(code.invoke('check my tests'), routesTo({ find: 0.05, review: 0.1, 'test-gaps': 0.85 }))
  expect(result).toBe('gaps:check my tests')
})

it('routing exposes the whole distribution, not just the winner', async () => {
  const code = Procedure.registry(Request, [find, review, testGaps])

  const route = await run(code.route('where is auth'), routesTo({ find: 0.8, review: 0.15, 'test-gaps': 0.05 }))
  expect(route._tag).toBe('Matched')
  expect(route.id).toBe('find')
  expect(route.probability).toBe(0.8)
  expect(Math.round(route.margin * 100) / 100).toBe(0.65)
  expect(route.ranked.map((candidate) => candidate.id)).toStrictEqual(['find', 'review', 'test-gaps'])
})

it('a near-tie is Uncertain rather than a coin flip', async () => {
  const code = Procedure.registry(Request, [find, review, testGaps])
  const muddled = routesTo({ find: 0.31, review: 0.34, 'test-gaps': 0.35 })

  const route = await run(code.route('do something'), muddled)
  expect(route._tag).toBe('Uncertain')
  expect(route.reason).toMatch(/no procedure reached 0\.7/)

  // Uncertainty is reported about the distribution, not about whichever
  // procedure happens to be listed first.
  expect(route.ranked.map((candidate) => candidate.id)).toStrictEqual(['test-gaps', 'review', 'find'])
})

it('a clear leader with too small a margin is still Uncertain', async () => {
  const code = Procedure.registry(Request, [find, review, testGaps])
  const close = routesTo({ find: 0.44, review: 0.46, 'test-gaps': 0.1 })

  const route = await run(code.route('ambiguous', { minProbability: 0.4, minMargin: 0.15 }), close)
  expect(route._tag).toBe('Uncertain')
  expect(route.reason).toMatch(/led find by only 0\.020/)
})

it('an unroutable request fails rather than guessing, unless handled', async () => {
  const code = Procedure.registry(Request, [find, review, testGaps])
  const muddled = routesTo({ find: 0.33, review: 0.34, 'test-gaps': 0.33 })

  await expect(run(code.invoke('???'), muddled)).rejects.toSatisfy(
    (error) => (error?.cause ?? error)?._tag === 'RoutingUncertainError',
  )

  const handled = await run(
    code.invoke('???', { onUncertain: (_input, route) => `ask-a-human:${route.ranked[0].id}` }),
    muddled,
  )
  expect(handled).toBe('ask-a-human:review')
})

it('thresholds are tunable per call', async () => {
  const code = Procedure.registry(Request, [find, review, testGaps])
  const leaning = routesTo({ find: 0.55, review: 0.3, 'test-gaps': 0.15 })

  expect((await run(code.route('x'), leaning))._tag).toBe('Uncertain')

  const relaxed = await run(code.route('x', { minProbability: 0.5, minMargin: 0.2 }), leaning)
  expect(relaxed._tag).toBe('Matched')
  expect(relaxed.id).toBe('find')
})

it('the routing decision is an ordinary pattern, so Eval can measure it', async () => {
  const code = Procedure.registry(Request, [find, review, testGaps])

  // "Is this request for `find`?" evaluated over labeled examples.
  const isFind = code.decision.is('find', { match: 0.7, margin: 0.15 })
  const model = (options) =>
    routesTo(
      options.state === 'where is auth'
        ? { find: 0.9, review: 0.05, 'test-gaps': 0.05 }
        : { find: 0.05, review: 0.9, 'test-gaps': 0.05 },
    )(options)

  const report = await run(
    Discern.Eval.run(Request, isFind, [
      { input: 'where is auth', expected: true },
      { input: 'review this diff', expected: false },
    ]),
    model,
  )

  expect(report.metrics.accuracy).toBe(1)
  expect(report.metrics.uncertain).toBe(0)
})

it('a registry rejects duplicate ids and single-member registries', () => {
  expect(() => Procedure.registry(Request, [find])).toThrow(/at least two procedures/)
  expect(() => Procedure.registry(Request, [find, find])).toThrow(/Duplicate procedure id "find"/)
})

it('observations are attributed to the procedure that made them', async () => {
  const risky = Discern.on(Request).probability({ id: 'risk', instructions: 'Risky' })
  const riskPolicy = Discern.type(Request).pipe(
    Discern.when(risky.above(0.8), () => 'risky'),
    Discern.orElse(() => 'safe'),
  )

  const auditor = Procedure.make({
    id: 'audit',
    description: 'Audit a change for risk',
    input: Request,
    run: (request) => Effect.map(riskPolicy(request), (verdict) => `${verdict}:${request}`),
  })
  const code = Procedure.registry(Request, [auditor, find])

  const observations = Model.store()
  const result = await run(
    code.invoke('deploy on friday'),
    (options) =>
      Object.keys(options.decisions).includes('risk')
        ? { risk: { _tag: 'Probability', probability: 0.95 } }
        : routesTo({ audit: 0.9, find: 0.1 })(options),
    [Model.recording(observations)],
  )
  expect(result).toBe('risky:deploy on friday')

  const tree = Model.tree(observations.snapshot(), 'invoke')
  // Routing is its own scope; the risk decision belongs to the procedure that made it.
  expect(tree.observations).toStrictEqual([])
  expect(tree.children.map((child) => [child.name, child.observations.map((o) => o.decisionId)])).toStrictEqual([
    ['route', [code.decision.id]],
    ['audit', ['risk']],
  ])
})

it('a whole procedure invocation replays from one recording', async () => {
  let calls = 0
  const urgent = Discern.on(Request).probability({ id: 'urgent', instructions: 'Urgent' })
  const urgency = Discern.type(Request).pipe(
    Discern.when(urgent.above(0.8), () => 'now'),
    Discern.orElse(() => 'later'),
  )
  const triage = Procedure.make({
    id: 'triage',
    description: 'Decide how soon a request needs attention',
    input: Request,
    run: (request) => Effect.map(urgency(request), (when) => `${when}:${request}`),
  })
  const code = Procedure.registry(Request, [triage, find])

  const model = (options) => {
    calls += 1
    return Object.keys(options.decisions).includes('urgent')
      ? { urgent: { _tag: 'Probability', probability: 0.95 } }
      : routesTo({ triage: 0.9, find: 0.1 })(options)
  }

  const observations = Model.store()
  expect(await run(code.invoke('prod is down'), model, [Model.recording(observations)])).toBe('now:prod is down')
  expect(calls, 'one call to route, one inside the procedure').toBe(2)

  const replayed = await Effect.runPromise(
    Effect.provide(code.invoke('prod is down'), Model.replayLayer(observations.snapshot())),
  )
  expect(replayed).toBe('now:prod is down')
  expect(calls, 'routing and the procedure body both replayed').toBe(2)
})

it('get rejects an id the registry does not have', () => {
  const code = Procedure.registry(Request, [find, review])
  expect(code.get('find')).toBe(find)
  expect(() => code.get('nope')).toThrow(/No procedure "nope" in this registry \(have: find, review\)/)
})

it('an id that collides with Object.prototype still routes', async () => {
  // Assigning `__proto__` on a plain object literal sets no own property, so a
  // procedure named this way would vanish from the routing criteria.
  const odd = Procedure.make({
    id: '__proto__',
    description: 'A procedure with an awkward name',
    input: Request,
    run: () => Effect.succeed('odd'),
  })
  const code = Procedure.registry(Request, [odd, find])

  expect(Object.keys(code.decision.decision.criteria)).toStrictEqual(['__proto__', 'find'])

  // The distribution has to be built the same careful way, or the fake provider
  // reproduces the very bug this covers.
  const probabilities = Object.fromEntries([
    ['__proto__', 0.9],
    ['find', 0.1],
  ])
  const result = await run(code.invoke('x'), routesTo(probabilities))
  expect(result).toBe('odd')
})

it('registries nest, so each routing decision stays a short question', async () => {
  const lint = Procedure.make({
    id: 'lint',
    description: 'Check style and formatting',
    input: Request,
    run: () => Effect.succeed('linted'),
  })

  // A group of code procedures, presented to the parent as one entry.
  const codeGroup = Procedure.registry(Request, [find, review], { id: 'code-route' })
  const code = Procedure.fromRegistry({
    id: 'code',
    description: 'Anything about reading or reviewing source code',
    registry: codeGroup,
  })
  const top = Procedure.registry(Request, [code, lint], { id: 'top-route' })

  const calls = []
  const model = (options) => {
    const decisionId = Object.keys(options.decisions)[0]
    calls.push(decisionId)
    return routesTo(decisionId === 'top-route' ? { code: 0.9, lint: 0.1 } : { find: 0.05, review: 0.95 })(options)
  }

  const observations = Model.store()
  expect(await run(top.invoke('is this diff safe'), model, [Model.recording(observations)])).toBe(
    'reviewed:is this diff safe',
  )
  expect(calls, 'one decision per level, not one big one').toStrictEqual(['top-route', 'code-route'])

  const tree = Model.tree(observations.snapshot(), 'top')
  expect(tree.children.map((child) => child.name)).toStrictEqual(['route', 'code'])
  expect(tree.children[1].children.map((child) => child.name)).toStrictEqual(['route'])
})

it('nested invocation is bounded by a depth limit', async () => {
  let registry
  const loop = Procedure.make({
    id: 'loop',
    description: 'Routes straight back to the registry it belongs to',
    input: Request,
    run: (request) => registry.invoke(request),
  })
  registry = Procedure.registry(Request, [loop, find])

  let calls = 0
  const model = (options) => {
    calls += 1
    return routesTo({ loop: 0.95, find: 0.05 })(options)
  }

  await expect(run(Procedure.withMaxDepth(3)(registry.invoke('x')), model)).rejects.toSatisfy((error) => {
    const cause = error?.cause ?? error
    return cause?._tag === 'DepthExceededError' && cause.limit === 3
  })
  expect(calls, 'routing stops at the limit rather than recursing forever').toBe(3)
})

it('depth is per-branch, not a running total', async () => {
  // Two sibling invocations each start from the caller's depth.
  const codeGroup = Procedure.registry(Request, [find, review], { id: 'inner' })
  const model = routesTo({ find: 0.9, review: 0.1 })

  const both = Effect.all([codeGroup.invoke('a'), codeGroup.invoke('b')])
  expect(await run(Procedure.withMaxDepth(1)(both), model)).toStrictEqual(['found:a', 'found:b'])
})

// -------------------------------------------------------------------------------------------------
// Routing projection, eligibility and route telemetry
// -------------------------------------------------------------------------------------------------

const Ticket = Schema.Struct({
  ask: Schema.String,
  environment: Schema.String,
  evidence: Schema.String,
})

const ticket = (ask, environment = 'production', evidence = 'a very large blob') => ({
  ask,
  environment,
  evidence,
})

const inspect = Procedure.make({
  id: 'inspect',
  description: 'Look at what a ticket is about',
  input: Ticket,
  run: (request) => Effect.succeed(`inspected:${request.ask}`),
})

const deploy = Procedure.make({
  id: 'deploy',
  description: 'Release the change described by a ticket',
  input: Ticket,
  eligible: (request) => request.environment !== 'local',
  run: (request) => Effect.succeed(`deployed:${request.environment}`),
})

const escalate = Procedure.make({
  id: 'escalate',
  description: 'Hand the ticket to a human',
  input: Ticket,
  run: () => Effect.succeed('escalated'),
})

const rollback = Procedure.make({
  id: 'rollback',
  description: 'Undo the last release',
  input: Ticket,
  eligible: (request) => request.environment !== 'local',
  run: () => Effect.succeed('rolled-back'),
})

it('routing can be projected, so evidence stays out of the prompt', async () => {
  let seen
  const model = (options) => {
    seen = options.state
    return routesTo({ inspect: 0.9, deploy: 0.05, rollback: 0.05 })(options)
  }

  const projected = Procedure.registry(Ticket, [inspect, deploy, rollback], {
    routeBy: { schema: Schema.String, select: (request) => request.ask },
  })

  const result = await run(projected.invoke(ticket('what is this about?')), model)
  expect(result).toBe('inspected:what is this about?')
  expect(seen, 'the router saw only the projection').toBe('what is this about?')
  expect(projected.routeInput).toBe(Schema.String)
})

it('without a projection the router sees the whole input', async () => {
  let seen
  const model = (options) => {
    seen = options.state
    return routesTo({ inspect: 0.9, deploy: 0.05, rollback: 0.05 })(options)
  }

  const whole = Procedure.registry(Ticket, [inspect, deploy, rollback])
  await run(whole.invoke(ticket('what is this about?')), model)
  expect(seen.evidence).toBe('a very large blob')
})

it('ineligible procedures are removed before the model is asked', async () => {
  let asked
  const model = (options) => {
    asked = Object.keys(Object.values(options.decisions)[0].criteria)
    return routesTo({ inspect: 0.9, deploy: 0.04, rollback: 0.03, escalate: 0.03 })(options)
  }

  const registry = Procedure.registry(Ticket, [inspect, deploy, rollback, escalate], {
    routeBy: { schema: Schema.String, select: (request) => request.ask },
  })

  await run(registry.invoke(ticket('what is this?', 'production')), model)
  expect(asked).toStrictEqual(['inspect', 'deploy', 'rollback', 'escalate'])

  await run(registry.invoke(ticket('what is this?', 'local')), model)
  expect(asked, 'deploy and rollback are not offered locally').toStrictEqual(['inspect', 'escalate'])
})

it('a single eligible procedure is routed to without a model call', async () => {
  let calls = 0
  const model = (options) => {
    calls += 1
    return routesTo({ deploy: 0.5, rollback: 0.5 })(options)
  }

  const releases = Procedure.registry(Ticket, [deploy, rollback], {
    routeBy: { schema: Schema.String, select: (request) => request.ask },
  })

  // Locally neither is eligible.
  await expect(run(releases.invoke(ticket('ship it', 'local')), model)).rejects.toSatisfy(
    (error) => (error?.cause ?? error)?._tag === 'NoEligibleProcedureError',
  )
  expect(calls).toBe(0)

  // Narrow to exactly one and the question answers itself.
  const onlyDeploy = Procedure.registry(Ticket, [deploy, inspect], {
    routeBy: { schema: Schema.String, select: (request) => request.ask },
  })
  const route = await run(onlyDeploy.route(ticket('ship it', 'local')), model)
  expect(route._tag).toBe('Matched')
  expect(route.id).toBe('inspect')
  expect(route.by).toBe('elimination')
  expect(calls, 'elimination costs nothing').toBe(0)
})

it('invokeWithRoute exposes the selection alongside the result', async () => {
  const model = routesTo({ inspect: 0.05, deploy: 0.9, rollback: 0.05 })
  const registry = Procedure.registry(Ticket, [inspect, deploy, rollback], {
    routeBy: { schema: Schema.String, select: (request) => request.ask },
  })

  const { route, value } = await run(registry.invokeWithRoute(ticket('please release this')), model)
  expect(value).toBe('deployed:production')
  expect(route._tag).toBe('Matched')
  expect(route.id).toBe('deploy')
  expect(route.by).toBe('model')
  expect(route.probability).toBe(0.9)
  expect(route.ranked.map((candidate) => candidate.id)).toStrictEqual(['deploy', 'inspect', 'rollback'])
})

it('a projected route is addressed by the projection, so evidence does not split the cache', async () => {
  let calls = 0
  const model = (options) => {
    calls += 1
    return routesTo({ inspect: 0.9, deploy: 0.05, rollback: 0.05 })(options)
  }

  const registry = Procedure.registry(Ticket, [inspect, deploy, rollback], {
    routeBy: { schema: Schema.String, select: (request) => request.ask },
  })

  const store = Model.store()
  const cache = [Model.caching(store)]
  await run(registry.invoke(ticket('what is this?', 'production', 'diff A')), model, cache)
  await run(registry.invoke(ticket('what is this?', 'production', 'diff B')), model, cache)
  expect(calls, 'the same question about different evidence reuses the routing answer').toBe(1)
})
