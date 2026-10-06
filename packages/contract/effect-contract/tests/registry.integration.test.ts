import { Operations, Principal } from '@systemfsoftware/effect-contract'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Schema } from 'effect'
import { capabilities, immediateCapabilities } from './__fixtures__/kernel.fixture.js'
import { operationsScenarioEnvironment } from './__fixtures__/operations-runtime.fixture.js'

const Feature = makeFeature({ it })

const unbegunOperationId = 'AAAAAAAAAAAAAAAAAAAAAA'

Feature('Reading a durable operation through the registry built-in capability')
  .withScenarioLayer(operationsScenarioEnvironment)
  .body(({ scenario }) => {
    scenario(
      'The registry adds getOperation only when a registered contract is durable',
      Gherkin.Do.pipe(
        When('both fixture registries are inspected')('keys', () =>
          Effect.succeed({
            durable: Object.keys(capabilities),
            immediate: Object.keys(immediateCapabilities),
          })),
        Then('only the durable registry carries the built-in read capability')((scope, expect) =>
          expect(scope.keys).toEqual({
            durable: ['getBalance', 'hold', 'getOperation'],
            immediate: ['getBalance'],
          })
        ),
      ),
    )

    scenario(
      'The built-in capability reads a pending operation begun for an anonymous owner',
      Gherkin.Do.pipe(
        When('an anonymous owner begins an operation and the built-in capability reads it')(
          'answer',
          () =>
            Effect.gen(function*() {
              const operations = yield* Operations.Operations
              const id = yield* operations.begin(new Principal.Anonymous({}))
              return yield* capabilities.getOperation.cell.run({
                input: { operation: id },
                principal: new Principal.Anonymous({}),
              })
            }),
        ),
        Then('the answer is Completed with the pending operation state')((scope, expect) =>
          expect(scope.answer).toMatchObject({ _tag: 'Completed', output: { _tag: 'Pending' } })
        ),
      ),
    )

    scenario(
      'An operation the service never began is refused',
      Gherkin.Do.pipe(
        When('the built-in capability reads an id no operation holds')('answer', () =>
          Effect.gen(function*() {
            const operation = yield* Schema.decodeEffect(Operations.OperationId)(unbegunOperationId)
            return yield* capabilities.getOperation.cell.run({
              input: { operation },
              principal: new Principal.Anonymous({}),
            })
          })),
        Then('the answer is Refused with the operation not found refusal')((scope, expect) =>
          expect(scope.answer).toMatchObject({ _tag: 'Refused', refusal: { _tag: 'OperationNotFound' } })
        ),
      ),
    )
  })
