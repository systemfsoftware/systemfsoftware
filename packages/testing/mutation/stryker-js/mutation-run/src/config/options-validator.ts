import os from 'os'
import path from 'path'

import { type StrykerOptions, StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { deepFreeze, findUnserializables, type Immutable, noopLogger } from '@systemfsoftware/stryker-js-util'
import type { JSONSchema7 } from 'json-schema'
import { Minimatch } from 'minimatch'

import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { ConfigError } from '../errors.js'
import { injectionTokens } from '../plugins/index.js'
import { IGNORE_PATTERN_CHARACTER, MUTATION_RANGE_REGEX } from '../project/index.js'
import { CommandTestRunner } from '../test-runner/command-test-runner.js'

import { forkCoreSchema } from './fork-schema.js'
import { isWarningEnabled } from './is-warning-enabled.js'
import { optionsPath } from './options-path.js'
import { REMOVED_OPTIONS } from './removed-surface.js'
import { describeErrors } from './validation-errors.js'

/**
 * The validation document. Its `properties` map names every option the core and
 * the loaded plugins declare, which is what an unknown-option warning is keyed
 * on. It is read as DATA only: validation itself runs on `StrykerOptionsSchema`,
 * the same declaration the defaults come from.
 */
type ValidationSchemaDocument = {
  readonly properties?: unknown
  readonly [key: string]: unknown
}

/**
 * Options are decoded by the schema that declares them. This replaced an ajv
 * instance run with `useDefaults`, which filled defaults from the *derived* JSON
 * Schema document and silently injected nothing wherever a `default` annotation
 * did not survive that derivation: `timeoutFactor`, `timeoutMS` and
 * `dryRunTimeoutMinutes` all arrived `undefined`, so
 * `dryRunTimeoutMinutes * 1000 * 60` was `NaN`, every dry run was given a 1 ms
 * budget, and each one reported "Initial test run timed out". Decoding through
 * the declaration cannot drift from it, and the open struct keeps the
 * plugin-contributed options a document-driven validator would have rejected.
 *
 * `errors: 'all'` keeps the previous behaviour of reporting every offending
 * option in one pass rather than stopping at the first.
 */
const decodeOptions = S.decodeUnknownResult(StrykerOptionsSchema, { errors: 'all' })

export class OptionsValidator {
  public static readonly inject = tokens(
    injectionTokens.validationSchema,
    commonTokens.logger,
  )

  constructor(
    private readonly schema: ValidationSchemaDocument,
    private readonly log: Logger,
  ) {}

  /**
   * Validates the provided options, throwing an error if something is wrong.
   * Optionally also warns about excess or unserializable options.
   * @param options The stryker options to validate
   * @param mark Wether or not to log warnings on unknown properties or unserializable properties
   */
  public validate(
    options: Record<string, unknown>,
    mark = false,
  ): asserts options is StrykerOptions {
    this.removeDeprecatedOptions(options)
    this.validateRemovedSurface(options)
    this.schemaValidate(options)
    this.customValidation(options)
    if (mark) {
      this.markOptions(options)
    }
  }

  /**
   * Hard-fails on config names the rebuild removed (U2-U9): a removed
   * top-level key (`dashboard`, `eventReporter`) or a removed reporter name
   * inside `reporters` (`dots`, `event-recorder`, `progress-append-only`,
   * `dashboard`). Runs ahead of `schemaValidate` because a removed key is
   * absent from the AJV schema, so schema validation can never see it, and
   * the warning path (`markExcessOptions`) only fires when `mark` is set and
   * the `unknownOptions` warning is enabled — a removed key could otherwise
   * be silently accepted. Only the known-removed names are checked; an
   * unknown-but-not-removed key keeps its warning-only behaviour.
   */
  private validateRemovedSurface(rawOptions: Record<string, unknown>) {
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
    errors.forEach((error) => this.log.error(error))
    this.throwErrorIfNeeded(errors)
  }

  private removeDeprecatedOptions(rawOptions: Record<string, unknown>) {
    this.removeStringMutator(rawOptions)
    this.removeMutatorName(rawOptions)
    this.removeTestFramework(rawOptions)
    this.removeTranspilers(rawOptions)
    this.rewriteFiles(rawOptions)
    this.removeJestEnableBail(rawOptions)
    this.removeHtmlReporterBaseDir(rawOptions)
    this.migrateMaxConcurrentTestRunners(rawOptions)
  }

  private static recordOf(value: object): Record<string, unknown> {
    return S.decodeUnknownSync(S.Record(S.String, S.Unknown))(value)
  }

  private removeStringMutator(rawOptions: Record<string, unknown>) {
    const mutator = rawOptions['mutator']
    if (typeof mutator !== 'string') return
    this.log.warn(
      'DEPRECATED. Use of "mutator" as string is no longer needed. You can remove it from your configuration. Stryker now supports mutating of JavaScript and friend files out of the box.',
    )
    delete rawOptions['mutator']
  }

  private removeMutatorName(rawOptions: Record<string, unknown>) {
    const mutator = rawOptions['mutator']
    if (typeof mutator !== 'object' || mutator === null) return
    const mutatorRecord = OptionsValidator.recordOf(mutator)
    if (!mutatorRecord['name']) return
    this.log.warn(
      'DEPRECATED. Use of "mutator.name" is no longer needed. You can remove "mutator.name" from your configuration. Stryker now supports mutating of JavaScript and friend files out of the box.',
    )
    delete mutatorRecord['name']
    rawOptions['mutator'] = mutatorRecord
  }

  private removeTestFramework(rawOptions: Record<string, unknown>) {
    if (!Object.keys(rawOptions).includes('testFramework')) return
    this.log.warn(
      'DEPRECATED. Use of "testFramework" is no longer needed. You can remove it from your configuration. Your test runner plugin now handles its own test framework integration.',
    )
    delete rawOptions['testFramework']
  }

  private removeTranspilers(rawOptions: Record<string, unknown>) {
    const transpilers = rawOptions['transpilers']
    if (!Array.isArray(transpilers)) return
    const example = transpilers.includes('babel')
      ? 'babel src --out-dir lib'
      : transpilers.includes('typescript')
      ? 'tsc -b'
      : transpilers.includes('webpack')
      ? 'webpack --config webpack.config.js'
      : 'npm run build'
    this.log.warn(
      `DEPRECATED. Support for "transpilers" is removed. You can now configure your own "${
        optionsPath('buildCommand')
      }". For example, ${example}.`,
    )
    delete rawOptions['transpilers']
  }

  private rewriteFiles(rawOptions: Record<string, unknown>) {
    const files = rawOptions['files']
    if (!Array.isArray(files)) return
    const ignorePatternsName = optionsPath('ignorePatterns')
    const isString = (uncertain: unknown): uncertain is string => typeof uncertain === 'string'
    const filePatterns = files.filter(isString)
    const newIgnorePatterns: string[] = [
      '**',
      ...filePatterns.map((filePattern) =>
        filePattern.startsWith(IGNORE_PATTERN_CHARACTER)
          ? filePattern.substr(1)
          : `${IGNORE_PATTERN_CHARACTER}${filePattern}`
      ),
    ]
    delete rawOptions['files']
    this.log.warn(
      `DEPRECATED. Use of "files" is deprecated, please use "${ignorePatternsName}" instead (or remove "files" altogether will probably work as well). For now, rewriting them as ${
        JSON.stringify(
          newIgnorePatterns,
        )
      }. See https://stryker-mutator.io/docs/stryker-js/configuration/#ignorepatterns-string`,
    )
    const existingIgnorePatterns: unknown[] = Array.isArray(
        rawOptions[ignorePatternsName],
      )
      ? rawOptions[ignorePatternsName]
      : []
    rawOptions[ignorePatternsName] = [
      ...newIgnorePatterns,
      ...existingIgnorePatterns,
    ]
  }

  private removeJestEnableBail(rawOptions: Record<string, unknown>) {
    const jestOptions = rawOptions['jest']
    if (typeof jestOptions !== 'object' || jestOptions === null) return
    const jestRecord = OptionsValidator.recordOf(jestOptions)
    const enableBail = jestRecord['enableBail']
    if (enableBail === undefined) return
    this.log.warn(
      'DEPRECATED. Use of "jest.enableBail" is deprecated, please use "disableBail" instead. See https://stryker-mutator.io/docs/stryker-js/configuration#disablebail-boolean',
    )
    rawOptions['disableBail'] = !enableBail
    delete jestRecord['enableBail']
    rawOptions['jest'] = jestRecord
  }

  private removeHtmlReporterBaseDir(rawOptions: Record<string, unknown>) {
    const htmlReporter = rawOptions['htmlReporter']
    if (typeof htmlReporter !== 'object' || htmlReporter === null) return
    const reporter = OptionsValidator.recordOf(htmlReporter)
    const baseDir = reporter['baseDir']
    if (!baseDir) return
    this.log.warn(
      `DEPRECATED. Use of "htmlReporter.baseDir" is deprecated, please use "${
        optionsPath(
          'htmlReporter',
          'fileName',
        )
      }" instead. See https://stryker-mutator.io/docs/stryker-js/configuration/#reporters-string`,
    )
    const baseDirText = typeof baseDir === 'string' ? baseDir : JSON.stringify(baseDir) ?? ''
    if (!reporter['fileName']) {
      reporter['fileName'] = path.join(baseDirText, 'index.html')
    }
    delete reporter['baseDir']
    rawOptions['htmlReporter'] = reporter
  }

  private migrateMaxConcurrentTestRunners(rawOptions: Record<string, unknown>) {
    const maxConcurrent = rawOptions['maxConcurrentTestRunners']
    if (typeof maxConcurrent !== 'number' || maxConcurrent === Number.MAX_SAFE_INTEGER) return
    this.log.warn(
      'DEPRECATED. Use of "maxConcurrentTestRunners" is deprecated. Please use "concurrency" instead.',
    )
    const concurrency = rawOptions['concurrency']
    if (!concurrency && maxConcurrent < os.availableParallelism() - 1) {
      rawOptions['concurrency'] = maxConcurrent
    }
  }

  private customValidation(options: StrykerOptions) {
    const additionalErrors: string[] = []
    if (options.thresholds.high < options.thresholds.low) {
      additionalErrors.push(
        'Config option "thresholds.high" should be higher than "thresholds.low".',
      )
    }
    if (CommandTestRunner.is(options.testRunner)) {
      if (options.testRunnerNodeArgs.length) {
        this.log.warn(
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
          const [
            _,
            _fileName,
            mutationRange,
            startLine,
            _startColumn,
            endLine,
            _endColumn,
          ] = match
          const start = parseInt(startLine ?? '', 10)
          const end = parseInt(endLine ?? '', 10)
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

    additionalErrors.forEach((error) => this.log.error(error))
    this.throwErrorIfNeeded(additionalErrors)
  }

  /**
   * Decodes the options against their declaration, then writes the result back
   * onto the caller's object: the previous engine filled defaults in place and
   * every caller reads them off the object it passed, so the fill has to land
   * there rather than in a copy.
   */
  private schemaValidate(options: Record<string, unknown>): asserts options is StrykerOptions {
    const decoded = decodeOptions(options)
    if (Result.isFailure(decoded)) {
      const describedErrors = describeErrors(decoded.failure)
      describedErrors.forEach((error) => this.log.error(error))
      this.throwErrorIfNeeded(describedErrors)
      return
    }
    Object.assign(options, decoded.success)
  }

  private throwErrorIfNeeded(errors: string[]) {
    if (errors.length > 0) {
      const headline = errors.length === 1
        ? 'Please correct this configuration error and try again.'
        : 'Please correct these configuration errors and try again.'
      throw new ConfigError(`${headline} ${errors.join(' ')}`)
    }
  }

  private markOptions(options: StrykerOptions): void {
    this.markExcessOptions(options)
    this.markUnserializableOptions(options)
  }

  private markExcessOptions(options: StrykerOptions) {
    const OPTIONS_ADDED_BY_STRYKER = ['set', 'configFile', '$schema']

    if (isWarningEnabled('unknownOptions', options.warnings)) {
      const schemaProperties = OptionsValidator.recordOf(this.schema['properties'] ?? {})
      const schemaKeys = Object.keys(schemaProperties)
      const excessPropertyNames = Object.keys(options)
        .filter((key) => !key.endsWith('_comment'))
        .filter((key) => !OPTIONS_ADDED_BY_STRYKER.includes(key))
        .filter((key) => !schemaKeys.includes(key))

      if (excessPropertyNames.length) {
        excessPropertyNames.forEach((excessPropertyName) => {
          this.log.warn(
            `Unknown stryker config option "${excessPropertyName}".`,
          )
        })

        this.log.warn(`Possible causes:
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

  private markUnserializableOptions(options: StrykerOptions) {
    if (
      isWarningEnabled('unserializableOptions', options.warnings)
    ) {
      const unserializables = findUnserializables(options)
      if (unserializables) {
        unserializables.forEach((unserializable) =>
          this.log.warn(
            `Config option "${
              unserializable.path.join('.')
            }" is not (fully) serializable. ${unserializable.reason}. Any test runner or checker worker processes might not receive this value as intended.`,
          )
        )
        this.log.warn(
          `(disable ${optionsPath('warnings', 'unserializableOptions')} to ignore this warning)`,
        )
      }
    }
  }
}

/**
 * The defaults are the declaration decoded against an empty object: every field
 * that declares a default supplies it, and the result is the complete option
 * set. It no longer routes through the validator, which used to be the only way
 * to obtain them and produced an object missing three numeric defaults.
 */
export function createDefaultOptions(): StrykerOptions {
  return Result.getOrThrow(decodeOptions({}))
}

export const defaultOptions: Immutable<StrykerOptions> = deepFreeze(
  createDefaultOptions(),
)
