import { registry } from '@systemfsoftware/contract-fixtures'
import { Catalog } from '@systemfsoftware/effect-contract'
import { declarationsOf } from '@systemfsoftware/effect-contract/code-mode'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { diagnosticsOf } from './__fixtures__/compile.fixture.js'

const Feature = makeFeature({ it })

const VALID_PROGRAM = `
async function program(): Promise<void> {
  await tools.getBalance({ account: 'acct_abcd1234' })
  await tools.getStatement({ account: 'acct_abcd1234' })
  await tools.ping({})
  await tools.topUp({ account: 'acct_abcd1234', amountCents: 100 })
  await tools.transfer({ account: 'acct_abcd1234', cents: 100 })
  await tools.quoteRate({ currency: 'usd' })
  await tools.hold({ ttlMs: 1000 })
  await tools.confirmHold({ operation: 'AAAAAAAAAAAAAAAAAAAAAA' })
  await tools.getOperation({ operation: 'AAAAAAAAAAAAAAAAAAAAAA' })
  await tools.runProgram({ program: 'return 1', programId: 'p1', lifetime: { _tag: 'Request' } })
}
`

const WRONG_PROGRAM = `
async function program() {
  return await tools.transfer({ account: 'acct_abcd1234', cents: 'not-a-number' })
}
`

const declarationsOfRegistry = (): string => declarationsOf(Catalog.catalog(registry))

Feature('Writing an agent program against the generated code-mode declarations')
  .withLayer(Layer.empty)
  .live('the TypeScript 6 compiler checks the generated declarations in process')
  .body(({ scenario }) => {
    scenario(
      'A program that calls every capability with a well-typed input compiles',
      Gherkin.Do.pipe(
        Given('the fixture registry is projected to code-mode declarations')(
          'declarations',
          () => Effect.succeed(declarationsOfRegistry()),
        ),
        When('a program calls every capability with a well-typed input')(
          'diagnostics',
          (scope) => Effect.succeed(diagnosticsOf(`${scope.declarations}\n${VALID_PROGRAM}`)),
        ),
        Then('the compiler reports no problem')((scope, expect) => expect(scope.diagnostics).toEqual([])),
      ),
    )

    scenario(
      'A program that passes a text where a number is expected is refused',
      Gherkin.Do.pipe(
        Given('the fixture registry is projected to code-mode declarations')(
          'declarations',
          () => Effect.succeed(declarationsOfRegistry()),
        ),
        When('a program passes a text where a number is expected')(
          'diagnostics',
          (scope) => Effect.succeed(diagnosticsOf(`${scope.declarations}\n${WRONG_PROGRAM}`)),
        ),
        Then('the compiler reports a problem')((scope, expect) => expect(scope.diagnostics).not.toEqual([])),
      ),
    )
  })
