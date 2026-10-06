import { Contract, Operations, Principal } from '@systemfsoftware/effect-contract'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Schema, Stream } from 'effect'
import { operationsScenarioEnvironment } from './__fixtures__/operations-runtime.fixture.js'

const Feature = makeFeature({ it })

const confirmed: Contract.Completed = { _tag: 'Completed', output: { confirmed: true }, next: [] }
const expired: Contract.Refused = { _tag: 'Refused', refusal: { _tag: 'HoldExpired' }, next: [] }

const neverMinted = 'AAAAAAAAAAAAAAAAAAAAAA'

const unmintedOperation: Effect.Effect<Operations.OperationId, Schema.SchemaError> = Schema.decodeEffect(
  Operations.OperationId,
)(neverMinted)

Feature('Settling a durable operation held in memory')
  .withScenarioLayer(operationsScenarioEnvironment)
  .body(({ scenario }) => {
    scenario(
      'An operation begun for an anonymous owner reads back as pending',
      Gherkin.Do.pipe(
        When('an anonymous owner begins an operation')('state', () =>
          Effect.gen(function*() {
            const operations = yield* Operations.Operations
            const id = yield* operations.begin(new Principal.Anonymous({}))
            return yield* operations.get(id)
          })),
        Then('the operation is recorded as pending')((scope, expect) =>
          expect(scope.state).toMatchObject({ _tag: 'Pending' })
        ),
      ),
    )

    scenario(
      'A watched operation keeps its first settlement and ends its stream there',
      Gherkin.Do.pipe(
        When('an operation is begun, watched, settled with the same answer twice and a different one once')(
          'observed',
          () =>
            Effect.gen(function*() {
              const operations = yield* Operations.Operations
              const id = yield* operations.begin(new Principal.Anonymous({}))
              const watching = yield* Effect.forkChild(Stream.runCollect(operations.watch(id)))
              const first = yield* operations.settle(id, confirmed)
              const repeated = yield* operations.settle(id, confirmed)
              const refused = yield* Effect.flip(operations.settle(id, expired))
              const recorded = yield* operations.get(id)
              const states = yield* Fiber.join(watching)
              return { first, repeated, refused, recorded, states }
            }),
        ),
        Then('the first settlement is idempotent, the different answer is refused and the stream ends there')(
          (scope, expect) =>
            expect({
              repeated: scope.observed.repeated,
              recorded: scope.observed.recorded,
              refused: scope.observed.refused,
              streamEnd: scope.observed.states.at(-1),
            }).toEqual({
              repeated: scope.observed.first,
              recorded: scope.observed.first,
              refused: new Operations.AlreadySettled({ state: scope.observed.first, answer: expired }),
              streamEnd: scope.observed.first,
            }),
        ),
      ),
    )

    scenario(
      'An operation the service never began is not found',
      Gherkin.Do.pipe(
        Given('an operation id that was never begun')('operation', () => unmintedOperation),
        When('the unbegun operation is read, watched and settled')('refusals', (scope) =>
          Effect.gen(function*() {
            const operations = yield* Operations.Operations
            const id = scope.operation
            return {
              read: yield* Effect.flip(operations.get(id)),
              watched: yield* Effect.flip(Stream.runCollect(operations.watch(id))),
              settled: yield* Effect.flip(operations.settle(id, confirmed)),
            }
          })),
        Then('every access answers the operation not found refusal')((scope, expect) =>
          expect(scope.refusals).toMatchObject({
            read: { _tag: 'OperationNotFound' },
            watched: { _tag: 'OperationNotFound' },
            settled: { _tag: 'OperationNotFound' },
          })
        ),
      ),
    )
  })
