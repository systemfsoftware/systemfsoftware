import { Catalog } from '@systemfsoftware/effect-contract'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Option, Schema } from 'effect'
import { capabilities, getBalance } from './__fixtures__/kernel.fixture.js'

const Feature = makeFeature({ it })

const roundTripped = (document: Catalog.JsonSchemaDocument) =>
  Effect.gen(function*() {
    const codec = Schema.fromJsonString(Schema.Unknown)
    const text = yield* Schema.encodeEffect(codec)(document)
    return yield* Schema.decodeEffect(codec)(text)
  })

Feature('Projecting a capability registry onto a catalog')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Every contract field and refusal tag of a capability reaches its catalog entry',
      Gherkin.Do.pipe(
        When('the fixture registry is projected to a catalog')(
          'catalog',
          () => Effect.succeed(Catalog.catalog(capabilities)),
        ),
        Then('the entry names the contract and carries its access, exposure, egress, links and refusal tags')(
          (scope, expect) =>
            expect(scope.catalog['getBalance']).toMatchObject({
              name: 'getBalance',
              links: [],
              refusalTags: ['InsufficientFunds'],
            }),
        ),
      ),
    )

    scenario(
      'Every JSON Schema document survives a JSON round-trip and agrees with the schema compiled here',
      Gherkin.Do.pipe(
        Given('the fixture registry is projected to a catalog')(
          'catalog',
          () => Effect.succeed(Catalog.catalog(capabilities)),
        ),
        When('each catalog document is serialized to JSON and parsed back')(
          'documents',
          (scope) =>
            Effect.gen(function*() {
              const entry = Option.getOrThrow(Option.fromNullishOr(scope.catalog['getBalance']))
              return {
                input: yield* roundTripped(entry.input),
                output: yield* roundTripped(entry.output),
                refusals: yield* roundTripped(entry.refusals),
              }
            }),
        ),
        Then('each parsed document equals the schema compiled independently in the test')((scope, expect) =>
          expect(scope.documents).toEqual({
            input: Schema.toJsonSchemaDocument(getBalance.input),
            output: Schema.toJsonSchemaDocument(getBalance.output),
            refusals: Schema.toJsonSchemaDocument(getBalance.refusals),
          })
        ),
      ),
    )
  })
