import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import { FastCheck as fc } from 'effect/testing'

import { instrument } from '../instrument/index.js'

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

describe('method expression mutation', () => {
  it.effect.prop(
    '∀c_PrototypeNamedCalls_≡NoMethodReplacementIsProposed',
    [fc.constant(SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const result = yield* instrument([{ name: '/tmp/prototype-methods.ts', content: source, mutate: true }], {
          ignorers: [],
          excludedMutations: [],
          parsers: [],
        })
        const methodMutants = result.mutants.filter((mutant) => mutant.mutatorName === 'MethodExpression')
        return methodMutants.length === 0
      }),
  )
})
