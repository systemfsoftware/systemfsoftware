/* oxlint-disable @systemfsoftware/effect-dmmf/tests-import-public-api -- the validator kernel and the spec parser's rejection path are package-private; the test binds them from source to pin the npm name acceptance boundary */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'
import { validatePackageName } from '../src/internal/PackageNameValidator.js'
import { parsePackageSpec } from '../src/PackageSpec.js'

const Feature = makeFeature({ it, layer })

const outcomeOf = (input: string) => {
  const outcome = parsePackageSpec(input)
  return Result.isSuccess(outcome) ? Result.getOrThrow(outcome) : null
}

Feature('The package spec parser accepts names on the npm boundary').body(({ scenario }) => {
  scenario(
    'warning-only rule violations do not block a spec',
    Gherkin.Do.pipe(
      Given('names whose only violations are the rules npm no longer enforces')(
        'names',
        () => Effect.sync(() => ['Foo', 'http', 'a'.repeat(215), 'foo!bar']),
      ),
      When('the specs are parsed')('outcomes', ({ names }) => Effect.sync(() => names.map(outcomeOf))),
      Then('every name parses')(({ outcomes }) =>
        Effect.sync(() => {
          for (const outcome of outcomes) expect(outcome).not.toBeNull()
          expect(outcomes[0]?.name).toBe('Foo')
          expect(outcomes[2]?.name).toHaveLength(215)
        })
      ),
    ),
  )

  scenario(
    'a name the npm rules reject fails the parse',
    Gherkin.Do.pipe(
      Given('names violating the enforced rules')(
        'names',
        () => Effect.sync(() => ['foo bar', '.foo', '_foo', 'node_modules', 'NODE_MODULES', 'favicon.ico', '%20']),
      ),
      When('the specs are parsed')('outcomes', ({ names }) => Effect.sync(() => names.map(outcomeOf))),
      Then('every name is rejected')(({ outcomes }) =>
        Effect.sync(() => {
          for (const outcome of outcomes) expect(outcome).toBeNull()
        })
      ),
    ),
  )

  scenario(
    'scoped names parse; a bare scope does not',
    Gherkin.Do.pipe(
      Given('a scoped spec and a bare scope')('names', () => Effect.sync(() => ['@scope/pkg@^1.0.0', '@scope'])),
      When('the specs are parsed')('outcomes', ({ names }) => Effect.sync(() => names.map(outcomeOf))),
      Then('the scoped spec parses and the bare scope is rejected')(({ outcomes }) =>
        Effect.sync(() => {
          expect(outcomes[0]?.versionKind).toBe('range')
          expect(outcomes[1]).toBeNull()
        })
      ),
    ),
  )

  scenario(
    'the kernel splits enforced errors from advisory warnings exactly as npm documents them',
    Gherkin.Do.pipe(
      Given('representative names for each rule')('expectedByName', () =>
        Effect.sync(() => ({
          Foo: { errors: [], warnings: ['name can no longer contain capital letters'] },
          http: { errors: [], warnings: ['http is a core module name'] },
          'node_modules': { errors: ['node_modules is a blacklisted name'], warnings: [] },
          '@scope/b%20': { errors: ['name can only contain URL-friendly characters'], warnings: [] },
          'foo bar': { errors: ['name can only contain URL-friendly characters'], warnings: [] },
        }))),
      Then('the errors and warnings match the documented split')(({ expectedByName }) =>
        Effect.sync(() => {
          for (const [name, expected] of Object.entries(expectedByName)) {
            const verdict = validatePackageName(name)
            expect([...verdict.errors]).toEqual(expected.errors)
            expect([...verdict.warnings]).toEqual(expected.warnings)
          }
        })
      ),
    ),
  )
})
