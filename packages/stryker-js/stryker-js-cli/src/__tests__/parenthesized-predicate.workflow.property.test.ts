import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import { FastCheck as fc } from 'effect/testing'

import { instrument } from '../instrument/index.js'

const WORKFLOW_BODY = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

class RunInterrupted {
  readonly _tag = 'RunInterrupted' as const
}

const classify = (command: { interrupted: boolean }): RunInterrupted | { _tag: 'RunOk' } =>
  command.interrupted ? new RunInterrupted() : { _tag: 'RunOk' }

export const workflow = Workflow.make({} as never, (command) =>
  Match.value(classify(command)).pipe(
    Match.tag('RunInterrupted', (error) => Result.fail(error)),
    Match.when(
      (outcome): outcome is { _tag: 'RunOk' } => !(outcome instanceof RunInterrupted),
      (decision) => Result.succeed(decision),
    ),
    Match.exhaustive,
  ),
)
`

describe('parenthesized predicate', () => {
  it.effect.prop(
    '∀c_ParenthesizedPredicateArm_≡InstrumentableWithLiveMutants',
    [fc.constant(WORKFLOW_BODY)],
    ([source]) =>
      Effect.gen(function*() {
        const result = yield* instrument(
          [{ name: '/tmp/probe/predicate.workflow.ts', content: source, mutate: true }],
          { ignorers: [], excludedMutations: [], parsers: [] },
        )
        return result.mutants.length > 0
      }),
  )
})
