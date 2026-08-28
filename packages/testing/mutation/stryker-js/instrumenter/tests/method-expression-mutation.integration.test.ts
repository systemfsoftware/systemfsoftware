import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { instrument } from './__fixtures__/instrument.js'

const OBJECT_PROTOTYPE_MEMBERS: readonly string[] = [
  'toString',
  'valueOf',
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]

const SOURCE = OBJECT_PROTOTYPE_MEMBERS
  .map((member, index) => `export const v${index} = String(globalThis).${member}()`)
  .join('\n')

interface Mutant {
  readonly mutatorName: string
}

const Feature = makeFeature({ it, layer })

Feature('Mutating a method named after an Object.prototype member')
  .body(({ scenario }) => {
    scenario(
      'Should_Instrument_When_TheCalledMethodSharesItsNameWithAPrototypeMember',
      Gherkin.Do.pipe(
        Given('a module calling each prototype-named method')('source', () => Effect.succeed(SOURCE)),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/prototype-methods.ts', content: source, mutate: true }], {
              ignorers: [],
              plugins: null,
              excludedMutations: [],
            }),
        ),
        Then('instrumentation succeeds and proposes no method replacement')((
          { result }: { result: { mutants: readonly Mutant[] } },
        ) =>
          Effect.sync(() => {
            const methodMutants = result.mutants.filter((mutant) => mutant.mutatorName === 'MethodExpression')
            expect(methodMutants).toEqual([])
          })
        ),
      ),
    )
  })
