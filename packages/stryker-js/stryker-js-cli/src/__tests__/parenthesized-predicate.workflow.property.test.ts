import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import { FastCheck as fc } from 'effect/testing'

import { instrument } from '../instrument/index.js'

const LETTER = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''))

const CLASS_ARB: fc.Arbitrary<string> = fc
  .array(LETTER, { minLength: 3, maxLength: 8 })
  .map((chars) => `Run${chars.map((char) => char.toUpperCase()).join('')}`)

const workflowWithPredicate = (className: string, parenDepth: number): string => {
  const open = '('.repeat(parenDepth)
  const close = ')'.repeat(parenDepth)
  return `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

class ${className} {
  readonly _tag = '${className}' as const
}

const classify = (command: { interrupted: boolean }): ${className} | { _tag: 'RunOk' } =>
  command.interrupted ? new ${className}() : { _tag: 'RunOk' }

export const workflow = Workflow.make({} as never, (command) =>
  Match.value(classify(command)).pipe(
    Match.tag('${className}', (error) => Result.fail(error)),
    Match.when(
      (outcome): outcome is { _tag: 'RunOk' } => ${open}!(outcome instanceof ${className})${close},
      (decision) => Result.succeed(decision),
    ),
    Match.exhaustive,
  ),
)
`
}

describe('parenthesized predicate', () => {
  it.effect.prop(
    '∀c,d_ParenthesizedPredicates_≡InstrumentableWithLiveMutants',
    [fc.tuple(CLASS_ARB, fc.nat({ max: 2 }))],
    ([[className, parenDepth]]) =>
      Effect.gen(function*() {
        const result = yield* instrument(
          [{
            name: '/tmp/probe/predicate.workflow.ts',
            content: workflowWithPredicate(className, parenDepth),
            mutate: true,
          }],
          { ignorers: [], excludedMutations: [], parsers: [] },
        )
        return result.mutants.length > 0
      }),
  )
})
