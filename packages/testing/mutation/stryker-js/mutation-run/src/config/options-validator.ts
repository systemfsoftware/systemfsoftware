import os from 'node:os'
import path from 'node:path'

import { type StrykerOptions, StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { Minimatch } from 'minimatch'
import { deepFreeze, type Immutable } from './config-freeze.js'
import { findUnserializables } from './config-serializability.js'

import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { IGNORE_PATTERN_CHARACTER, MUTATION_RANGE_REGEX } from '../project/index.js'
import { isCommandRunner } from '../test-runner/command-test-runner.js'
import { ConfigError } from './config-reader.schema.js'

import { isWarningEnabled } from './is-warning-enabled.js'
import { optionsPath } from './options-path.js'
import { REMOVED_OPTIONS } from './removed-surface.js'
import { describeErrors } from './validation-errors.js'

export type ValidationSchemaDocument = {
  readonly properties?: unknown
  readonly [key: string]: unknown
}

const decodeOptions = S.decodeUnknownResult(StrykerOptionsSchema, { errors: 'all' })

function recordOf(value: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    out[key] = Reflect.get(value, key)
  }
  return out
}

function validateRemovedSurface(
  rawOptions: Record<string, unknown>,
  log: Logger,
): Effect.Effect<void, ConfigError> {
  const errors: string[] = []
  for (const key of Object.keys(rawOptions)) {
    if (Object.hasOwn(REMOVED_OPTIONS, key)) {
      errors.push(`Config option "${key}" is no longer supported. ${REMOVED_OPTIONS[key]}`)
    }
  }
  const reporters = rawOptions['reporters']
  if (Array.isArray(reporters)) {
    for (const name of reporters) {
      if (typeof name === 'string' && Object.hasOwn(REMOVED_OPTIONS, name)) {
        errors.push(
          `Config option "reporters" contains removed reporter name "${name}". ${REMOVED_OPTIONS[name]}`,
        )
      }
    }
  }
  errors.forEach((error) => log.error(error))
  return throwErrorIfNeeded(errors)
}

function removeStringMutator(rawOptions: Record<string, unknown>, log: Logger): void {
  const mutator = rawOptions['mutator']
  if (typeof mutator !== 'string') return
  log.warn(
    'DEPRECATED. Use of "mutator" as string is no longer needed. You can remove it from your configuration. Stryker now supports mutating of JavaScript and friend files out of the box.',
  )
  delete rawOptions['mutator']
}

function removeMutatorName(rawOptions: Record<string, unknown>, log: Logger): void {
  const mutator = rawOptions['mutator']
  if (typeof mutator !== 'object' || mutator === null) return
  const mutatorRecord = recordOf(mutator)
  if (!mutatorRecord['name']) return
  log.warn(
    'DEPRECATED. Use of "mutator.name" is no longer needed. You can remove "mutator.name" from your configuration. Stryker now supports mutating of JavaScript and friend files out of the box.',
  )
  delete mutatorRecord['name']
  rawOptions['mutator'] = mutatorRecord
}

function removeTestFramework(rawOptions: Record<string, unknown>, log: Logger): void {
  if (!Object.keys(rawOptions).includes('testFramework')) return
  log.warn(
    'DEPRECATED. Use of "testFramework" is no longer needed. You can remove it from your configuration. Your test runner plugin now handles its own test framework integration.',
  )
  delete rawOptions['testFramework']
}

function removeTranspilers(rawOptions: Record<string, unknown>, log: Logger): void {
  const transpilers = rawOptions['transpilers']
  if (!Array.isArray(transpilers)) return
  const example = transpilers.includes('babel')
    ? 'babel src --out-dir lib'
    : transpilers.includes('typescript')
    ? 'tsc -b'
    : transpilers.includes('webpack')
    ? 'webpack --config webpack.config.js'
    : 'npm run build'
  log.warn(
    `DEPRECATED. Support for "transpilers" is removed. You can now configure your own "${
      optionsPath('buildCommand')
    }". For example, ${example}.`,
  )
  delete rawOptions['transpilers']
}

function rewriteFiles(rawOptions: Record<string, unknown>, log: Logger): void {
  const files = rawOptions['files']
  if (!Array.isArray(files)) return
  const ignorePatternsName = optionsPath('ignorePatterns')
  const isString = (uncertain: unknown): uncertain is string => typeof uncertain === 'string'
  const filePatterns = files.filter(isString)
  const newIgnorePatterns: string[] = [
    '**',
    ...filePatterns.map((filePattern) =>
      filePattern.startsWith(IGNORE_PATTERN_CHARACTER)
        ? filePattern.slice(1)
        : `${IGNORE_PATTERN_CHARACTER}${filePattern}`
    ),
  ]
  delete rawOptions['files']
  log.warn(
    `DEPRECATED. Use of "files" is deprecated, please use "${ignorePatternsName}" instead (or remove "files" altogether will probably work as well). For now, rewriting them as ${
      JSON.stringify(newIgnorePatterns)
    }. See https://stryker-mutator.io/docs/stryker-js/configuration/#ignorepatterns-string`,
  )
  const existingIgnorePatterns: unknown[] = Array.isArray(rawOptions[ignorePatternsName])
    ? rawOptions[ignorePatternsName]
    : []
  rawOptions[ignorePatternsName] = [...newIgnorePatterns, ...existingIgnorePatterns]
}

function removeJestEnableBail(rawOptions: Record<string, unknown>, log: Logger): void {
  const jestOptions = rawOptions['jest']
  if (typeof jestOptions !== 'object' || jestOptions === null) return
  const jestRecord = recordOf(jestOptions)
  const enableBail = jestRecord['enableBail']
  if (enableBail === undefined) return
  log.warn(
    'DEPRECATED. Use of "jest.enableBail" is deprecated, please use "disableBail" instead. See https://stryker-mutator.io/docs/stryker-js/configuration#disablebail-boolean',
  )
  rawOptions['disableBail'] = !enableBail
  delete jestRecord['enableBail']
  rawOptions['jest'] = jestRecord
}

function removeHtmlReporterBaseDir(rawOptions: Record<string, unknown>, log: Logger): void {
  const htmlReporter = rawOptions['htmlReporter']
  if (typeof htmlReporter !== 'object' || htmlReporter === null) return
  const reporter = recordOf(htmlReporter)
  const baseDir = reporter['baseDir']
  if (!baseDir) return
  log.warn(
    `DEPRECATED. Use of "htmlReporter.baseDir" is deprecated, please use "${
      optionsPath('htmlReporter', 'fileName')
    }" instead. See https://stryker-mutator.io/docs/stryker-js/configuration/#reporters-string`,
  )
  const baseDirText = typeof baseDir === 'string' ? baseDir : JSON.stringify(baseDir) ?? ''
  if (!reporter['fileName']) {
    reporter['fileName'] = path.join(baseDirText, 'index.html')
  }
  delete reporter['baseDir']
  rawOptions['htmlReporter'] = reporter
}

function migrateMaxConcurrentTestRunners(
  rawOptions: Record<string, unknown>,
  log: Logger,
): void {
  const maxConcurrent = rawOptions['maxConcurrentTestRunners']
  if (typeof maxConcurrent !== 'number' || maxConcurrent === Number.MAX_SAFE_INTEGER) return
  log.warn(
    'DEPRECATED. Use of "maxConcurrentTestRunners" is deprecated. Please use "concurrency" instead.',
  )
  const concurrency = rawOptions['concurrency']
  if (!concurrency && maxConcurrent < os.availableParallelism() - 1) {
    rawOptions['concurrency'] = maxConcurrent
  }
}

function removeDeprecatedOptions(rawOptions: Record<string, unknown>, log: Logger): void {
  removeStringMutator(rawOptions, log)
  removeMutatorName(rawOptions, log)
  removeTestFramework(rawOptions, log)
  removeTranspilers(rawOptions, log)
  rewriteFiles(rawOptions, log)
  removeJestEnableBail(rawOptions, log)
  removeHtmlReporterBaseDir(rawOptions, log)
  migrateMaxConcurrentTestRunners(rawOptions, log)
}

function customValidation(
  options: StrykerOptions,
  log: Logger,
): Effect.Effect<void, ConfigError> {
  const additionalErrors: string[] = []
  if (options.thresholds.high < options.thresholds.low) {
    additionalErrors.push('Config option "thresholds.high" should be higher than "thresholds.low".')
  }
  if (isCommandRunner(options.testRunner)) {
    if (options.testRunnerNodeArgs.length) {
      log.warn(
        'Using "testRunnerNodeArgs" together with the "command" test runner is not supported, these arguments will be ignored. You can add your custom arguments by setting the "commandRunner.command" option.',
      )
    }
  }
  if (options.ignoreStatic && options.coverageAnalysis !== 'perTest') {
    additionalErrors.push(
      `Config option "${
        optionsPath('ignoreStatic')
      }" is not supported with coverage analysis "${options.coverageAnalysis}". Either turn off "${
        optionsPath('ignoreStatic')
      }", or configure "${optionsPath('coverageAnalysis')}" to be "perTest".`,
    )
  }
  options.mutate.forEach((mutateString, index) => {
    const match = MUTATION_RANGE_REGEX.exec(mutateString)
    if (match) {
      if (new Minimatch(mutateString).hasMagic()) {
        additionalErrors.push(
          `Config option "mutate[${index}]" is invalid. Cannot combine a glob expression with a mutation range in "${mutateString}".`,
        )
      } else {
        const [_, _fileName, mutationRange, startLine, _startColumn, endLine, _endColumn] = match
        const start = Number.parseInt(startLine ?? '', 10)
        const end = Number.parseInt(endLine ?? '', 10)
        if (start < 1) {
          additionalErrors.push(
            `Config option "mutate[${index}]" is invalid. Mutation range "${mutationRange}" is invalid, line ${start} does not exist (lines start at 1).`,
          )
        }
        if (start > end) {
          additionalErrors.push(
            `Config option "mutate[${index}]" is invalid. Mutation range "${mutationRange}" is invalid. The "from" line number (${start}) should be less then the "to" line number (${end}).`,
          )
        }
      }
    }
  })
  additionalErrors.forEach((error) => log.error(error))
  return throwErrorIfNeeded(additionalErrors)
}

function schemaValidate(
  options: Record<string, unknown>,
  log: Logger,
): Effect.Effect<StrykerOptions, ConfigError> {
  const decoded = decodeOptions(options)
  if (Result.isFailure(decoded)) {
    const describedErrors = describeErrors(decoded.failure)
    describedErrors.forEach((error) => log.error(error))
    const headline = describedErrors.length === 1
      ? 'Please correct this configuration error and try again.'
      : 'Please correct these configuration errors and try again.'
    return Effect.fail(new ConfigError({ message: `${headline} ${describedErrors.join(' ')}` }))
  }
  Object.assign(options, decoded.success)
  return Effect.succeed(decoded.success)
}

function throwErrorIfNeeded(errors: string[]): Effect.Effect<void, ConfigError> {
  if (errors.length > 0) {
    const headline = errors.length === 1
      ? 'Please correct this configuration error and try again.'
      : 'Please correct these configuration errors and try again.'
    return Effect.fail(new ConfigError({ message: `${headline} ${errors.join(' ')}` }))
  }
  return Effect.void
}

function markExcessOptions(
  options: StrykerOptions,
  schema: ValidationSchemaDocument,
  log: Logger,
): void {
  const OPTIONS_ADDED_BY_STRYKER = ['set', 'configFile', '$schema']
  if (isWarningEnabled('unknownOptions', options.warnings)) {
    const propsValue = schema['properties']
    const propsObject = typeof propsValue === 'object' && propsValue !== null ? propsValue : {}
    const schemaProperties = recordOf(propsObject)
    const schemaKeys = Object.keys(schemaProperties)
    const excessPropertyNames = Object.keys(options)
      .filter((key) => !key.endsWith('_comment'))
      .filter((key) => !OPTIONS_ADDED_BY_STRYKER.includes(key))
      .filter((key) => !schemaKeys.includes(key))
    if (excessPropertyNames.length) {
      excessPropertyNames.forEach((excessPropertyName) => {
        log.warn(`Unknown stryker config option "${excessPropertyName}".`)
      })
      log.warn(`Possible causes:
     * Is it a typo on your end?
     * Did you only write this property as a comment? If so, please postfix it with "_comment".
     * You might be missing a plugin that is supposed to use it. Stryker loaded plugins from: ${
        JSON.stringify(options.plugins)
      }
     * The plugin that is using it did not contribute explicit validation. 
     (disable "${optionsPath('warnings', 'unknownOptions')}" to ignore this warning)`)
    }
  }
}

function markUnserializableOptions(options: StrykerOptions, log: Logger): void {
  if (isWarningEnabled('unserializableOptions', options.warnings)) {
    const unserializables = findUnserializables(options)
    if (unserializables) {
      unserializables.forEach((unserializable) =>
        log.warn(
          `Config option "${
            unserializable.path.join('.')
          }" is not (fully) serializable. ${unserializable.reason}. Any test runner or checker worker processes might not receive this value as intended.`,
        )
      )
      log.warn(`(disable ${optionsPath('warnings', 'unserializableOptions')} to ignore this warning)`)
    }
  }
}

function markOptions(
  options: StrykerOptions,
  schema: ValidationSchemaDocument,
  log: Logger,
): void {
  markExcessOptions(options, schema, log)
  markUnserializableOptions(options, log)
}

export function validateOptions(
  options: Record<string, unknown>,
  schema: ValidationSchemaDocument,
  log: Logger,
  mark = false,
): Effect.Effect<StrykerOptions, ConfigError> {
  removeDeprecatedOptions(options, log)
  return validateRemovedSurface(options, log).pipe(
    Effect.flatMap(() => schemaValidate(options, log)),
    Effect.flatMap((typed) =>
      customValidation(typed, log).pipe(
        Effect.tap(() => (mark ? Effect.sync(() => markOptions(typed, schema, log)) : Effect.void)),
        Effect.as(typed),
      )
    ),
  )
}

export function createDefaultOptions(): Effect.Effect<StrykerOptions> {
  return S.decodeEffect(StrykerOptionsSchema)({}).pipe(Effect.orDie)
}

export const defaultOptions: Effect.Effect<Immutable<StrykerOptions>, never, never> = Effect.map(
  createDefaultOptions(),
  (opts) => deepFreeze(opts),
)
