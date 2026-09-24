import { Metamorphic } from '@systemfsoftware/differential-spec'
import { Discern } from '@systemfsoftware/discern'
import { Effect, MutableRef, Schema } from 'effect'
import * as fc from 'fast-check'
import { answersFor, probabilityAnswer } from './__fixtures__/counting-model.fixture.js'
import { Facts, type FactSet } from './__fixtures__/facts.schema.js'

const risk = Discern.on(Facts).probability({ id: 'risk', instructions: 'How risky are these facts' })

const triage = Discern.type(Facts).pipe(
  Discern.when(risk.above(0.5), () => 'escalate'),
  Discern.orElse(() => 'accept'),
)

const uncountedUsage = { inputTokens: undefined, outputTokens: undefined } as const

const calls = MutableRef.make(0)

const orderSignatureOf = (text: string, from: number): number =>
  from >= text.length ? 0 : (text.charCodeAt(from) * (from + 1) + orderSignatureOf(text, from + 1)) % 1009

const probabilityOfState = (state: Schema.Json): number => (orderSignatureOf(JSON.stringify(state), 0) % 101) / 100

const provider = Discern.Model.provider((request) =>
  Effect.sync(() => {
    MutableRef.set(calls, MutableRef.get(calls) + 1)
    return {
      answers: answersFor({ request, answerOf: () => probabilityAnswer(probabilityOfState(request.state)) }),
      usage: uncountedUsage,
    }
  })
)

const store = Discern.Model.store()

const triagedFacts = (facts: FactSet) =>
  Effect.gen(function*() {
    const before = yield* Effect.sync(() => MutableRef.get(calls))
    const verdict = yield* Effect.provide(triage(facts), Discern.Model.layer(provider, [Discern.Model.caching(store)]))
    const after = yield* Effect.sync(() => MutableRef.get(calls))
    return { verdict, calls: after - before }
  })

const scalarValues: fc.Arbitrary<string | number | boolean | null> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
)

const factSets: fc.Arbitrary<FactSet> = fc
  .uniqueArray(fc.tuple(fc.string().map((key) => `k_${key}`), scalarValues), {
    minLength: 3,
    maxLength: 6,
    selector: (entry) => entry[0],
  })
  .map((entries): FactSet => Object.fromEntries(entries))

const reorderKeys = (facts: FactSet): FactSet => Object.fromEntries(Object.entries(facts).reverse())

Metamorphic.on({
  name: 'reordering the keys of a fact set reuses the cached verdict without asking the model again',
  system: triagedFacts,
})
  .relation({
    transformInput: reorderKeys,
    assertOutput: (baseline, followUp) => followUp.calls === 0 && baseline.verdict === followUp.verdict,
  })
  .on(factSets)
