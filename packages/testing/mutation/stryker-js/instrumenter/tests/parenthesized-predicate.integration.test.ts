import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { instrument } from './__fixtures__/instrument.js'

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

interface Mutant {
  readonly mutatorName: string
}

const Feature = makeFeature({ it, layer })

Feature('Parenthesized type predicates in make bodies')
  .body(({ scenario }) => {
    scenario(
      'A make body whose when arm carries a type-predicate arrow stays instrumentable',
      Gherkin.Do.pipe(
        Given('a workflow body with a type-predicate when arm')('source', () => Effect.succeed(WORKFLOW_BODY)),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe/predicate.workflow.ts', content: source, mutate: true }], {
              ignorers: [],
              excludedMutations: [],
            }),
        ),
        Then('instrumentation succeeds with a non-empty mutant population')((
          { result }: { result: { mutants: readonly Mutant[] } },
        ) =>
          Effect.sync(() => {
            expect(result.mutants.length).toBeGreaterThan(0)
          })
        ),
      ),
    )
  })
