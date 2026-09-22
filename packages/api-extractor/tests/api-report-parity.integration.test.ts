import * as NodeServices from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { reviewFixture } from './__fixtures__/extractor-harness.js'

const Feature = makeFeature({ it, layer })

const parityPackage = 'report-parity/simple-pkg'

Feature('Publishing the API reports a package promises')
  .withLayer(NodeServices.layer)
  .body(({ scenario }) => {
    scenario(
      'A package that promises complete, public, and beta reports renders each report exactly as committed',
      Gherkin.Do.pipe(
        Given('a package whose committed reports describe its complete, public, and beta surfaces')(
          'fixture',
          () => Effect.succeed(parityPackage),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture(s.fixture),
        ),
        Then('the review passes without errors or warnings')((s) => {
          expect(s.observed.run.outcome).toMatchObject({
            _tag: 'Success',
            success: { _tag: 'ExtractionPassed', errorCount: 0, warningCount: 0 },
          })
        }),
        Then('each rendered report is byte for byte the committed report')((s) => {
          expect(s.observed.after['temp/simple-pkg.api.md']).toBe(s.observed.before['etc/simple-pkg.api.md'])
          expect(s.observed.after['temp/simple-pkg.public.api.md']).toBe(
            s.observed.before['etc/simple-pkg.public.api.md'],
          )
          expect(s.observed.after['temp/simple-pkg.beta.api.md']).toBe(
            s.observed.before['etc/simple-pkg.beta.api.md'],
          )
        }),
        Then('each report keeps only the declarations its release level promises')((s) => {
          const complete = s.observed.after['temp/simple-pkg.api.md']
          const published = s.observed.after['temp/simple-pkg.public.api.md']
          const beta = s.observed.after['temp/simple-pkg.beta.api.md']
          expect(complete).toContain('export function internalHelper(): void;')
          expect(complete).toContain('export class BetaFeature')
          expect(complete).toContain('export namespace SimpleNamespace')
          expect(beta).toContain('export class BetaFeature')
          expect(beta).toContain('// @beta')
          expect(beta).not.toContain('internalHelper')
          expect(published).toContain('export function computeValue(input: string): number;')
          expect(published).not.toContain('BetaFeature')
          expect(published).not.toContain('internalHelper')
        }),
      ),
    )

    scenario(
      'A warning bound for the report is written into the report instead of the console',
      Gherkin.Do.pipe(
        Given('a package with an internal declaration whose name lacks the required prefix')(
          'fixture',
          () => Effect.succeed(parityPackage),
        ),
        When('the package is reviewed in verification mode')(
          'observed',
          (s) => reviewFixture(s.fixture),
        ),
        Then('the report calls out the internal declaration inside the report text')((s) => {
          expect(s.observed.after['temp/simple-pkg.api.md']).toContain(
            '// Warning: (ae-internal-missing-underscore) The name "internalHelper" should be prefixed',
          )
        }),
        Then('the console says nothing about it')((s) => {
          expect(s.observed.run.stdout).not.toContain('ae-internal-missing-underscore')
          expect(s.observed.run.stderr).toBe('')
        }),
      ),
    )
  })
