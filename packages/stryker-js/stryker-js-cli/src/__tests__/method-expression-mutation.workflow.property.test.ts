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

const MEMBER_SUBSET_ARB = fc.subarray([...OBJECT_PROTOTYPE_MEMBERS], { minLength: 1, maxLength: 7 })

const LETTER = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''))

const IDENTIFIER_ARB: fc.Arbitrary<string> = fc
  .array(LETTER, { minLength: 3, maxLength: 8 })
  .map((chars) => chars.join(''))

const methodMutants = (
  mutants: readonly { readonly mutatorName: string }[],
): readonly { readonly mutatorName: string }[] => mutants.filter((mutant) => mutant.mutatorName === 'MethodExpression')

describe('method expression mutation', () => {
  it.effect.prop(
    '∀s_PrototypeMemberSubsets_≡NoMethodReplacementIsProposed',
    [MEMBER_SUBSET_ARB],
    ([members]) => {
      const source = members
        .map((member, index) => `export const v${index} = String(globalThis).${member}()`)
        .join('\n')
      return Effect.gen(function*() {
        const result = yield* instrument([{ name: '/tmp/prototype-methods.ts', content: source, mutate: true }], {
          ignorers: [],
          excludedMutations: [],
          parsers: [],
        })
        return methodMutants(result.mutants).length === 0
      })
    },
  )

  it.effect.prop(
    '∀w_Haystacks_≡ADictionaryMethodCallIsProposed',
    [IDENTIFIER_ARB],
    ([receiver]) => {
      const source = `export const lowered = ${receiver}.toLowerCase()`
      return Effect.gen(function*() {
        const result = yield* instrument([{ name: '/tmp/plain-method.ts', content: source, mutate: true }], {
          ignorers: [],
          excludedMutations: [],
          parsers: [],
        })
        return methodMutants(result.mutants).length > 0
      })
    },
  )
})
