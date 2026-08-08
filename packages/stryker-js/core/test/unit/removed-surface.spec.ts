import { commonTokens, PluginKind } from '@stryker-mutator/api/plugin'
import { noopLogger } from '@stryker-mutator/util'
import { createInjector } from 'typed-inject'
import { describe, expect, it } from 'vitest'

import { forkCoreSchema } from '../../src/config/fork-schema.js'
import { createDefaultOptions, OptionsValidator } from '../../src/config/options-validator.js'
import { REMOVED_OPTIONS } from '../../src/config/removed-surface.js'
import { PluginCreator } from '../../src/di/plugin-creator.js'
import { ConfigError } from '../../src/errors.js'

const validator = (): OptionsValidator => new OptionsValidator(forkCoreSchema, noopLogger)

const entriesFor = (...names: string[]) => names.map((name) => ({ name, remediation: REMOVED_OPTIONS[name] as string }))

const REMOVED_KEYS = entriesFor('dashboard', 'eventReporter')

// The reporter names U9 pruned from the registry. They pass the schema as
// plain string items, so the scan must check the `reporters` array values.
const REMOVED_REPORTERS = entriesFor('dots', 'event-recorder', 'progress-append-only', 'dashboard')

describe('removed surface in a config file', () => {
  it.each(REMOVED_KEYS)(
    'rejects the removed config key "%s" with a ConfigError naming the key',
    ({ name, remediation }) => {
      const attempt = (): void => {
        const v: OptionsValidator = validator()
        v.validate({ [name]: {} })
      }
      expect(attempt).toThrow(ConfigError)
      expect(attempt).toThrow(`"${name}"`)
      expect(attempt).toThrow(remediation)
    },
  )

  it.each(REMOVED_REPORTERS)(
    'rejects the removed reporter name "%s" inside `reporters` with a ConfigError naming it',
    ({ name, remediation }) => {
      const attempt = (): void => {
        const v: OptionsValidator = validator()
        v.validate({ reporters: [name] })
      }
      expect(attempt).toThrow(ConfigError)
      expect(attempt).toThrow(`"${name}"`)
      expect(attempt).toThrow(remediation)
    },
  )

  it('fires with warnings.unknownOptions disabled — it does not ride the warning path', () => {
    // This is the test that catches the wrong placement: had the scan lived
    // inside schemaValidate (or relied on markExcessOptions), a removed key
    // with the unknownOptions warning disabled would pass silently.
    const attempt = (): void => {
      const v: OptionsValidator = validator()
      v.validate({
        dashboard: {},
        warnings: { unknownOptions: false },
      })
    }
    expect(attempt).toThrow(ConfigError)
    expect(attempt).toThrow('"dashboard"')
  })

  it('does not hard-fail an unknown-but-not-removed config key', () => {
    const v: OptionsValidator = validator()
    const options: Record<string, unknown> = { someFutureOption: 42 }
    v.validate(options)
    expect(options['someFutureOption']).toBe(42)
  })

  it('leaves a deprecated-but-migrated key soft instead of denylisting it', () => {
    // `files` was never removed — removeDeprecatedOptions rewrites it into
    // ignorePatterns and the scan must not turn it into a hard error.
    const v: OptionsValidator = validator()
    const options: Record<string, unknown> = {
      files: ['src/**/*.js'],
      ignorePatterns: [],
    }
    v.validate(options)
    expect(options['files']).toBeUndefined()
    expect(options['ignorePatterns']).toEqual(['**', '!src/**/*.js'])
  })
})

describe('the removed-name oracle', () => {
  it('classifies a missing plugin as a config error, not a plain Error', () => {
    const pluginCreator = new PluginCreator(
      new Map(),
      createInjector()
        .provideValue(commonTokens.options, createDefaultOptions())
        .provideValue(commonTokens.fileDescriptions, {})
        .provideValue(commonTokens.getLogger, () => noopLogger)
        .provideValue(commonTokens.logger, noopLogger),
    )
    expect(() => pluginCreator.create(PluginKind.Reporter, 'dots')).toThrow(ConfigError)
    expect(() => pluginCreator.create(PluginKind.Reporter, 'some-typo-reporter')).toThrow(ConfigError)
  })

  it('exports exactly the removed names', () => {
    // Pins the content, so dropping an entry (or smuggling one in) goes red.
    expect(Object.keys(REMOVED_OPTIONS).sort()).toEqual([
      'dashboard',
      'dots',
      'event-recorder',
      'eventReporter',
      'progress-append-only',
    ])
  })

  it('enforces every name it exports as a config key', () => {
    for (const name of Object.keys(REMOVED_OPTIONS)) {
      expect(() => validator().validate({ [name]: {} })).toThrow(ConfigError)
    }
  })

  it('enforces every name it exports inside the reporters array', () => {
    for (const name of Object.keys(REMOVED_OPTIONS)) {
      expect(() => validator().validate({ reporters: [name] })).toThrow(ConfigError)
    }
  })

  it('keeps the removed options out of the schema so no default injects them', () => {
    // The regression that made every consumer fail: AJV injects a default for
    // each declared property, so a declared `dashboard` landed in the resolved
    // options of runs whose config never mentioned it.
    const properties = forkCoreSchema.properties
    if (typeof properties !== 'object' || properties === null) {
      throw new Error('the fork schema declares no properties object')
    }
    expect(Object.keys(properties).filter((name) => Object.hasOwn(REMOVED_OPTIONS, name))).toEqual([])
  })
})
