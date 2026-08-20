import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { Effect } from 'effect'
import { expect, vi } from 'vitest'

import {
  createLogger,
  initErrorMessage,
  observeInit,
  resolveTestResource,
  uninitializedCheckerLayer,
} from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const resolver = (...segments: string[]): string => resolveTestResource('errors', ...segments)

const compileErrorTsconfig = resolver('compile-error', 'tsconfig.json')
const invalidTsconfig = resolver('invalid-tsconfig', 'tsconfig.json')
const missingTsconfig = resolver('empty-dir', 'tsconfig.json')

const warningsSpy = vi.fn<Logger['warn']>()

Feature('TypeScript checker initialization errors')
  .body(({ scenario }) => {
    scenario(
      'Should_RejectInitialization_When_InitialCompilationFailed',
      { layer: uninitializedCheckerLayer(compileErrorTsconfig) },
      Gherkin.Do.pipe(
        When('the checker initialises against a fixture with a compile error')(
          'outcome',
          () => observeInit,
        ),
        Then('initialisation fails naming the dry-run compile error')((s) => {
          expect(initErrorMessage(s.outcome)).toContain(
            'Typescript error(s) found in dry run compilation:',
          )
          expect(initErrorMessage(s.outcome)).toContain(
            'testResources/errors/compile-error/add.ts(2,3): error TS2322:',
          )
        }),
      ),
    )

    scenario(
      'Should_RejectInitialization_When_TsConfigWasInvalid',
      { layer: uninitializedCheckerLayer(invalidTsconfig) },
      Gherkin.Do.pipe(
        When('the checker initialises against an invalid tsconfig')(
          'outcome',
          () => observeInit,
        ),
        Then('the failure names the tsconfig parse position')((s) => {
          expect(initErrorMessage(s.outcome)).toContain(
            'Typescript error(s) found in dry run compilation:',
          )
          expect(initErrorMessage(s.outcome)).toContain(
            'testResources/errors/invalid-tsconfig/tsconfig.json(1,1): error TS1005:',
          )
        }),
      ),
    )

    scenario(
      'Should_LogWarning_When_TsConfigParsingFallsBack',
      { layer: uninitializedCheckerLayer(invalidTsconfig, createLogger(warningsSpy)) },
      Gherkin.Do.pipe(
        When('the checker initialises against an invalid tsconfig with a warning listener')(
          'outcome',
          () => observeInit,
        ),
        Then('the failure names the tsconfig parse position')((s) => {
          expect(initErrorMessage(s.outcome)).toContain(
            'testResources/errors/invalid-tsconfig/tsconfig.json(1,1): error TS1005:',
          )
        }),
        Then('a warning names the tsconfig path and the skipped-overrides consequence')(() => {
          const warnings = warningsSpy.mock.calls.map((call) => call.join(' ')).join('\n')
          expect(warnings).toContain('testResources/errors/invalid-tsconfig/tsconfig.json')
          expect(warnings.toLowerCase()).toContain(
            'compiler-option overrides and project-reference walking were skipped',
          )
        }),
      ),
    )

    scenario(
      'Should_RejectInitialization_When_TsConfigFileIsMissing',
      { layer: uninitializedCheckerLayer(missingTsconfig) },
      Gherkin.Do.pipe(
        When('the checker initialises against a missing tsconfig file')(
          'outcome',
          () => observeInit,
        ),
        Then('the failure names the configured tsconfig path')((s) => {
          expect(initErrorMessage(s.outcome)).toContain(
            'The tsconfig file does not exist at:',
          )
          expect(initErrorMessage(s.outcome)).toContain(missingTsconfig)
        }),
      ),
    )
  })
