import { describe, it } from '@effect/vitest'
import * as Either from 'effect/Either'
import * as fc from 'effect/FastCheck'
import * as Match from 'effect/Match'
import { classifyLintResult } from './lint-outcome.workflow.js'
import type { LintResult, ProcessResult } from './lint-outcome.workflow.js'

const arbitraryProcessResult: fc.Arbitrary<ProcessResult> = fc.record({
  exitCode: fc.integer({ min: 0, max: 255 }),
  stdout: fc.string(),
  stderr: fc.string(),
})

const nonzero = (result: ProcessResult): ProcessResult => ({ ...result, exitCode: 1 })

const classify = (result: ProcessResult, canRetry = true): LintResult => classifyLintResult({ result, canRetry })

const containing = (phrase: string): fc.Arbitrary<string> => fc.string().map((prefix) => `${prefix}${phrase}${prefix}`)

const arbitraryOutputWithoutNoise: fc.Arbitrary<string> = fc
  .string({ minLength: 1 })
  .filter((output) => !/No files found to lint/i.test(output))
  .filter((output) => !/path is expected to be under the root/i.test(output))
  .filter((output) => !/tsgolint|oxlint-tsgolint/i.test(output))

const outcomeTag = (result: LintResult): string =>
  Match.value(result).pipe(
    Match.tag('Right', ({ right }) => right._tag),
    Match.tag('Left', () => 'LintViolation'),
    Match.exhaustive,
  )

describe('classifyLintResult — clean', () => {
  it.prop(
    '∀result_ZeroExit_=Clean',
    [arbitraryProcessResult],
    ([result]) => outcomeTag(classify({ ...result, exitCode: 0 })) === 'Clean',
  )

  it.prop('∀result_ZeroExitWithBenignOutput_=Clean', [arbitraryProcessResult], ([result]) =>
    outcomeTag(
      classify({ ...result, exitCode: 0, stdout: 'No files found to lint. path is expected to be under the root' }),
    ) === 'Clean')
})

describe('classifyLintResult — benign outputs', () => {
  it.prop(
    '∀result_NoFilesFoundOnStdout_=BenignNoFiles',
    [arbitraryProcessResult, containing('No files found to lint')],
    ([result, stdout]) => outcomeTag(classify(nonzero({ ...result, stdout }))) === 'BenignNoFiles',
  )

  it.prop(
    '∀result_NoFilesFoundOnStderr_=BenignNoFiles',
    [arbitraryProcessResult, containing('no files found to lint')],
    ([result, stderr]) => outcomeTag(classify(nonzero({ ...result, stderr }))) === 'BenignNoFiles',
  )

  it.prop(
    '∀result_OutsideRootPanic_=IgnoredPath',
    [arbitraryProcessResult, containing('path is expected to be under the root')],
    ([result, stdout]) => outcomeTag(classify(nonzero({ ...result, stdout }))) === 'IgnoredPath',
  )

  it.prop(
    '∀result_NoFilesFoundPrecedence_=BenignNoFiles',
    [arbitraryProcessResult],
    ([result]) =>
      outcomeTag(
        classify(
          nonzero({ ...result, stdout: 'No files found to lint', stderr: 'Failed to find tsgolint executable' }),
        ),
      ) === 'BenignNoFiles',
  )

  it.prop(
    '∀result_OutsideRootPrecedence_=IgnoredPath',
    [arbitraryProcessResult],
    ([result]) =>
      outcomeTag(
        classify(
          nonzero({ ...result, stdout: 'path is expected to be under the root', stderr: 'oxlint-tsgolint missing' }),
        ),
      ) === 'IgnoredPath',
  )
})

describe('classifyLintResult — type-aware fallback', () => {
  it.prop(
    '∀result_TsgolintOnStderr_=RetryWithoutTypeAware',
    [arbitraryProcessResult, containing('Failed to find tsgolint executable')],
    ([result, stderr]) => outcomeTag(classify(nonzero({ ...result, stderr }))) === 'RetryWithoutTypeAware',
  )

  it.prop(
    '∀result_TsgolintOnStdout_=RetryWithoutTypeAware',
    [arbitraryProcessResult, containing('oxlint-tsgolint')],
    ([result, stdout]) =>
      outcomeTag(
        classify(nonzero({ ...result, stdout, stderr: '' })),
      ) === 'RetryWithoutTypeAware',
  )

  it.prop(
    '∀result_TsgolintOnStdoutWithStderr_=RetryWithoutTypeAware',
    [arbitraryProcessResult, containing('tsgolint')],
    ([result, stdout]) =>
      outcomeTag(
        classify(nonzero({ ...result, stdout, stderr: 'some other error' })),
      ) === 'RetryWithoutTypeAware',
  )

  it.prop(
    '∀result_TsgolintRetryExhausted_=LintViolation',
    [arbitraryProcessResult, containing('tsgolint')],
    ([result, stderr]) => outcomeTag(classify(nonzero({ ...result, stderr }), false)) === 'LintViolation',
  )
})

describe('classifyLintResult — violations', () => {
  it.prop(
    '∀result_PlainViolation_=LintViolation',
    [arbitraryProcessResult, arbitraryOutputWithoutNoise],
    ([result, output]) => {
      const classified = classify(nonzero({ ...result, stderr: output, stdout: 'stdout-noise' }))
      return Either.match(classified, {
        onLeft: (violation) => violation.output === output,
        onRight: () => false,
      })
    },
  )

  it.prop(
    '∀result_ViolationWithoutStderr_=LintViolation',
    [arbitraryProcessResult, arbitraryOutputWithoutNoise],
    ([result, output]) => {
      const classified = classify(nonzero({ ...result, stderr: '', stdout: output }))
      return Either.match(classified, {
        onLeft: (violation) => violation.output === output,
        onRight: () => false,
      })
    },
  )
})
