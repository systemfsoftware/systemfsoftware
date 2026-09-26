import { Conformance } from '@systemfsoftware/conformance-spec'
import { Discern } from '@systemfsoftware/discern'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect, Layer, Schema } from 'effect'
import type * as AiError from 'effect/unstable/ai/AiError'
import { classifyAnswer } from './__fixtures__/counting-model.fixture.js'
import { fakeModel, input, ruleFrom, type StopWorld, stopWorld } from './__fixtures__/stop-world.fixture.js'

const Feature = makeFeature({ it })

type InvocationFailure =
  | AiError.AiError
  | Discern.DecisionIdCollisionError
  | Discern.Procedure.DepthExceededError
  | Discern.Procedure.NoEligibleProcedureError
  | Discern.Procedure.ProcedureCommandRejectedError
  | Discern.Procedure.RoutingUncertainError

const fakeOf = (world: StopWorld): Discern.Model.Provider =>
  fakeModel({
    world,
    answerFor: (request) =>
      Object.fromEntries(
        Object.keys(request.decisions).map((id) => [
          id,
          classifyAnswer({ label: 'find', probabilities: { find: 0.9, review: 0.1 } }),
        ]),
      ),
  })

const ranRule = (world: StopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  ruleFrom(
    world.ran.length < world.acknowledged.length
      ? `acknowledged ${world.acknowledged.length} answer(s) after ${world.ran.length} run(s)`
      : undefined,
  )

const ranOver = (world: StopWorld, member: string, answer: string): Effect.Effect<string> =>
  Effect.as(
    Effect.sync(() => {
      world.ran.push(member)
    }),
    answer,
  )

const proceduresOf = (world: StopWorld) => ({
  find: Discern.Procedure.make({
    description: 'Find code relevant to a request',
    input: Schema.String,
    run: (request: string) => ranOver(world, 'find', `found:${request}`),
  }),
  review: Discern.Procedure.make({
    description: 'Review a change for risk',
    input: Schema.String,
    run: (request: string) => ranOver(world, 'review', `reviewed:${request}`),
  }),
})

const registryProgram = (world: StopWorld): Effect.Effect<void, InvocationFailure> =>
  Effect.gen(function*() {
    const answer = yield* Effect.provide(
      Discern.Procedure.registry(Schema.String, proceduresOf(world)).invoke(input),
      Discern.Model.layer(fakeOf(world), []),
    )
    yield* Effect.sync(() => {
      world.acknowledged.push(answer)
    })
  })

const procedureProgram = (world: StopWorld): Effect.Effect<void> =>
  Effect.gen(function*() {
    const answer = yield* proceduresOf(world).find.run(input)
    yield* Effect.sync(() => {
      world.acknowledged.push(answer)
    })
  })

Feature('Stopping the discern procedure layer at every step', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A registry stopped mid-route never answers without running exactly the member it routed to',
      Gherkin.Do.pipe(
        When('the check stops the registry at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.Procedure.registry,
              world: Effect.sync(stopWorld),
              program: registryProgram,
              restart: registryProgram,
              rule: ranRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('it passes every cut')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
            rendered: expect.stringContaining('every stop cut passed'),
          })
        ),
      ),
    )

    scenario(
      'A procedure stopped mid-run never hands back an answer its body did not produce',
      Gherkin.Do.pipe(
        When('the check stops the procedure at every step')(
          'checked',
          () =>
            Conformance.stopped({
              unit: Discern.Procedure.make,
              world: Effect.sync(stopWorld),
              program: procedureProgram,
              restart: procedureProgram,
              rule: ranRule,
              stopWithin: Duration.zero,
            }),
        ),
        Then('it passes every cut')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
            rendered: expect.stringContaining('every stop cut passed'),
          })
        ),
      ),
    )
  })
