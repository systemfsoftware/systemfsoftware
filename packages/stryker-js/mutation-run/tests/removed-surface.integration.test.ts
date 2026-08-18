/**
 * The removed config surface: keys and reporter names the rebuild pruned must
 * hard-fail validation with a ConfigError that names the key and its
 * remediation — including when the unknownOptions warning is off — while an
 * unknown-but-not-removed key and a deprecated-but-migrated key stay soft.
 * The removed-names oracle covers every exported name as a config key and
 * inside the reporters array, and the fork schema itself never declares a
 * removed option, so no default can inject it.
 */
import { noopLogger } from '@stryker-mutator/util'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { commonTokens, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Effect } from 'effect'
import * as S from 'effect/Schema'
import { createInjector } from 'typed-inject'
import { expect } from 'vitest'

import { forkCoreSchema } from '../src/config/fork-schema.js'
import { createDefaultOptions, OptionsValidator } from '../src/config/options-validator.js'
import { REMOVED_OPTIONS } from '../src/config/removed-surface.js'
import { ConfigError } from '../src/errors.js'
import { PluginCreator } from '../src/plugins/plugin-creator.js'

const Feature = makeFeature({ it, layer })

const validator = (): OptionsValidator => new OptionsValidator(forkCoreSchema, noopLogger)

/** Runs a throwing construction and returns the error it threw, so the scenario can assert on it. */
const thrownOutcome = (attempt: () => void): unknown => {
  try {
    attempt()
    return undefined
  } catch (error) {
    return error
  }
}

/** The removed names the derived fork schema still declares — empty when none slipped in. */
const removedNamesLeftInForkSchema = (): string[] => {
  const properties = S.decodeUnknownSync(S.Record(S.String, S.Unknown))(
    forkCoreSchema['properties'],
  )
  return Object.keys(properties).filter((name) => Object.hasOwn(REMOVED_OPTIONS, name))
}

Feature('The removed config surface')
  .body(({ scenario }) => {
    scenario(
      'Should_RejectTheDashboardConfigKey_When_AConfigFileSetsIt',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('a config file sets the removed dashboard key')('outcome', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return thrownOutcome(() => v.validate({ dashboard: {} }))
          })),
        Then('a ConfigError names the key and its remediation')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
          expect(String(s.outcome)).toContain('"dashboard"')
          expect(String(s.outcome)).toContain(REMOVED_OPTIONS['dashboard'])
        }),
      ),
    )

    scenario(
      'Should_RejectTheEventReporterConfigKey_When_AConfigFileSetsIt',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('a config file sets the removed eventReporter key')('outcome', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return thrownOutcome(() => v.validate({ eventReporter: {} }))
          })),
        Then('a ConfigError names the key and its remediation')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
          expect(String(s.outcome)).toContain('"eventReporter"')
          expect(String(s.outcome)).toContain(REMOVED_OPTIONS['eventReporter'])
        }),
      ),
    )

    scenario(
      'Should_RejectTheDotsReporterName_When_ItAppearsInsideTheReportersArray',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('the reporters array name the removed dots reporter')('outcome', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return thrownOutcome(() => v.validate({ reporters: ['dots'] }))
          })),
        Then('a ConfigError names the reporter and its remediation')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
          expect(String(s.outcome)).toContain('"dots"')
          expect(String(s.outcome)).toContain(REMOVED_OPTIONS['dots'])
        }),
      ),
    )

    scenario(
      'Should_RejectTheEventRecorderReporterName_When_ItAppearsInsideTheReportersArray',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('the reporters array name the removed event-recorder reporter')('outcome', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return thrownOutcome(() => v.validate({ reporters: ['event-recorder'] }))
          })),
        Then('a ConfigError names the reporter and its remediation')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
          expect(String(s.outcome)).toContain('"event-recorder"')
          expect(String(s.outcome)).toContain(REMOVED_OPTIONS['event-recorder'])
        }),
      ),
    )

    scenario(
      'Should_RejectTheProgressAppendOnlyReporterName_When_ItAppearsInsideTheReportersArray',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('the reporters array name the removed progress-append-only reporter')('outcome', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return thrownOutcome(() => v.validate({ reporters: ['progress-append-only'] }))
          })),
        Then('a ConfigError names the reporter and its remediation')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
          expect(String(s.outcome)).toContain('"progress-append-only"')
          expect(String(s.outcome)).toContain(REMOVED_OPTIONS['progress-append-only'])
        }),
      ),
    )

    scenario(
      'Should_RejectTheDashboardReporterName_When_ItAppearsInsideTheReportersArray',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('the reporters array names the removed dashboard reporter')('outcome', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return thrownOutcome(() => v.validate({ reporters: ['dashboard'] }))
          })),
        Then('a ConfigError names the reporter and its remediation')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
          expect(String(s.outcome)).toContain('"dashboard"')
          expect(String(s.outcome)).toContain(REMOVED_OPTIONS['dashboard'])
        }),
      ),
    )

    scenario(
      'Should_RejectTheRemovedKey_When_TheUnknownOptionsWarningIsDisabled',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('a config file disables the unknownOptions warning and sets dashboard')(
          'outcome',
          (s) =>
            Effect.sync(() => {
              const v: OptionsValidator = s.validator
              return thrownOutcome(() =>
                v.validate({
                  dashboard: {},
                  warnings: { unknownOptions: false },
                })
              )
            }),
        ),
        Then('a ConfigError still names the key')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
          expect(String(s.outcome)).toContain('"dashboard"')
        }),
      ),
    )

    scenario(
      'Should_KeepAnUnknownButNotRemovedKey_When_ItAppearsInTheConfigFile',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('a config sets a future option the scanner does not know')('options', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            const options: Record<string, unknown> = { someFutureOption: 42 }
            v.validate(options)
            return options
          })),
        Then('the key survives untouched')((s) => {
          expect(s.options['someFutureOption']).toBe(42)
        }),
      ),
    )

    scenario(
      'Should_KeepTheDeprecatedFilesKeySoft_When_ItIsRewrittenIntoIgnorePatterns',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('a config file uses the deprecated files key')('options', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            const options: Record<string, unknown> = {
              files: ['src/**/*.js'],
              ignorePatterns: [],
            }
            v.validate(options)
            return options
          })),
        Then('files is rewritten to ignorePatterns instead of being denylisted')((s) => {
          expect(s.options['files']).toBeUndefined()
          expect(s.options['ignorePatterns']).toEqual(['**', '!src/**/*.js'])
        }),
      ),
    )

    scenario(
      'Should_ClassifyAMissingPluginAsConfigError_When_ItIsRequestedFromThePluginCreator',
      Gherkin.Do.pipe(
        Given('a plugin creator with no loaded plugins')('creator', () =>
          Effect.sync(() => {
            const injector = createInjector()
              .provideValue(commonTokens.options, createDefaultOptions())
              .provideValue(commonTokens.fileDescriptions, {})
              .provideValue(commonTokens.getLogger, () => noopLogger)
              .provideValue(commonTokens.logger, noopLogger)
            return new PluginCreator(new Map(), injector)
          })),
        When('a removed or unknown reporter name is created')('outcome', (s) =>
          Effect.sync(() =>
            thrownOutcome(() => {
              s.creator.create(PluginKind.Reporter, 'non-existent')
            })
          )),
        Then('a ConfigError explains the missing plugin')((s) => {
          expect(s.outcome).toBeInstanceOf(ConfigError)
        }),
      ),
    )

    scenario(
      'Should_EnforceEveryExportedRemovedName_When_ItAppearsAsAConfigKey',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('every removed name is placed as a top-level key')('outcomes', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return Object.keys(REMOVED_OPTIONS).map((configKey) => thrownOutcome(() => v.validate({ [configKey]: {} })))
          })),
        Then('each placement is refused with a ConfigError')((s) => {
          for (const outcome of s.outcomes) {
            expect(outcome).toBeInstanceOf(ConfigError)
          }
        }),
      ),
    )

    scenario(
      'Should_EnforceEveryExportedRemovedName_When_ItAppearsInsideTheReportersArray',
      Gherkin.Do.pipe(
        Given('the options validator')('validator', () => Effect.succeed(validator())),
        When('every removed name is placed inside the reporters array')('outcomes', (s) =>
          Effect.sync(() => {
            const v: OptionsValidator = s.validator
            return Object.keys(REMOVED_OPTIONS).map((name) => thrownOutcome(() => v.validate({ reporters: [name] })))
          })),
        Then('each reporter list is refused with a ConfigError')((s) => {
          for (const outcome of s.outcomes) {
            expect(outcome).toBeInstanceOf(ConfigError)
          }
        }),
      ),
    )

    scenario(
      'Should_LeaveNoRemovedNameInTheDerivedForkSchema',
      Gherkin.Do.pipe(
        Given('the fork schema document properties')(
          'properties',
          () => Effect.sync(() => removedNamesLeftInForkSchema()),
        ),
        Then('no removed option is declared, so no default can inject it')((s) => {
          expect(s.properties).toEqual([])
        }),
      ),
    )
  })
