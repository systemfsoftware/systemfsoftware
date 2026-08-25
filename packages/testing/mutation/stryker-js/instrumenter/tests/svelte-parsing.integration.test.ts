import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { instrument } from './__fixtures__/instrument.js'

const COMPONENT = `<script>
  export let n = 1
  const big = n > 10
</script>
<p>{big}</p>
`

interface Mutant {
  readonly mutatorName: string
}

const Feature = makeFeature({ it, layer })

Feature('Svelte component instrumentation')
  .body(({ scenario }) => {
    scenario(
      // Svelte is an OPTIONAL PEER, not a bundled dependency: the parser reads the
      // installed compiler's `VERSION` and branches on v4 versus v5, and resolves
      // `estree-walker` relative to that same install. A build that inlines a copy
      // of the compiler pins whichever version happened to be present when the
      // package was built, and the version branch then reads the wrong answer.
      // This scenario fails if the compiler stops resolving from the consumer's
      // install, which is the only thing that makes the peer declaration honest.
      'Should_ProduceMutants_When_TheSvelteCompilerResolvesFromTheInstall',
      Gherkin.Do.pipe(
        Given('a Svelte component with a comparison')('source', () => Effect.succeed(COMPONENT)),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/component.svelte', content: source, mutate: true }], {
              ignorers: [],
              plugins: null,
              excludedMutations: [],
            }),
        ),
        Then('the script block yields mutants from the expected families')((
          { result }: { result: { mutants: readonly Mutant[] } },
        ) =>
          Effect.sync(() => {
            const families = [...new Set(result.mutants.map((mutant) => mutant.mutatorName))].sort()
            expect(families).toStrictEqual(['ConditionalExpression', 'EqualityOperator'])
            expect(result.mutants).toHaveLength(4)
          })
        ),
      ),
    )
  })
