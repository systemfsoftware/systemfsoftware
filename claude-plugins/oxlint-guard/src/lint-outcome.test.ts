import * as fc from 'fast-check'
import { classifyLintResult, type LintResult, type ProcessResult } from './lint-outcome.ts'

const arbitraryProcessResult: fc.Arbitrary<ProcessResult> = fc.record({
  exitCode: fc.integer({ min: 0, max: 255 }),
  stdout: fc.string(),
  stderr: fc.string(),
})

const nonzero = (result: ProcessResult): ProcessResult => ({ ...result, exitCode: 1 })

const classify = (result: ProcessResult, canRetry = true): LintResult => classifyLintResult({ result, canRetry })

// The generated tail is capped so short that it can never spell another marker,
// keeping the verdict owned by the pinned marker alone.
const markerWithShortTail = (marker: string): fc.Arbitrary<string> =>
  fc.string({ maxLength: 7 }).map((tail) => `${marker}${tail}`)

// The benign markers are 8-37 characters long, so no output of length <= 7 can
// accidentally match one and steal the violation verdict.
const arbitraryViolationOutput: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 7 })

const outcomeTag = (result: LintResult): string => (result.ok ? result.value._tag : 'LintViolation')

Deno.test('∀result_ZeroExit_=Clean — exit code 0 is clean regardless of output', () => {
  fc.assert(
    fc.property(arbitraryProcessResult, (result) => outcomeTag(classify({ ...result, exitCode: 0 })) === 'Clean'),
  )
})

Deno.test('∀result_ZeroExitWithBenignOutput_=Clean — exit code 0 precedes every benign-arm match', () => {
  fc.assert(
    fc.property(arbitraryProcessResult, (result) =>
      outcomeTag(
        classify({ ...result, exitCode: 0, stdout: 'No files found to lint. path is expected to be under the root' }),
      ) === 'Clean'),
  )
})

Deno.test('∀result_NoFilesFoundOnStdout_=BenignNoFiles — the no-files marker on stdout is benign', () => {
  fc.assert(
    fc.property(
      arbitraryProcessResult,
      fc.string().map((prefix) => `${prefix}No files found to lint${prefix}`),
      (result, stdout) => outcomeTag(classify(nonzero({ ...result, stdout }))) === 'BenignNoFiles',
    ),
  )
})

Deno.test('∀result_NoFilesFoundOnStderr_=BenignNoFiles — the no-files marker on stderr is benign and case-insensitive', () => {
  fc.assert(
    fc.property(
      arbitraryProcessResult,
      fc.string().map((prefix) => `${prefix}no files found to lint${prefix}`),
      (result, stderr) => outcomeTag(classify(nonzero({ ...result, stderr }))) === 'BenignNoFiles',
    ),
  )
})

Deno.test('∀result_OutsideRootPanic_=IgnoredPath — the outside-root marker is ignored, not a violation', () => {
  fc.assert(
    fc.property(
      arbitraryProcessResult,
      markerWithShortTail('path is expected to be under the root'),
      (result, stdout) => outcomeTag(classify(nonzero({ ...result, stdout, stderr: '' }))) === 'IgnoredPath',
    ),
  )
})

Deno.test('∀result_NoFilesFoundPrecedence_=BenignNoFiles — no-files outranks the tsgolint marker', () => {
  fc.assert(
    fc.property(arbitraryProcessResult, (result) =>
      outcomeTag(
        classify(
          nonzero({ ...result, stdout: 'No files found to lint', stderr: 'Failed to find tsgolint executable' }),
        ),
      ) === 'BenignNoFiles'),
  )
})

Deno.test('∀result_OutsideRootPrecedence_=IgnoredPath — outside-root outranks the tsgolint marker', () => {
  fc.assert(
    fc.property(arbitraryProcessResult, (result) =>
      outcomeTag(
        classify(
          nonzero({ ...result, stdout: 'path is expected to be under the root', stderr: 'oxlint-tsgolint missing' }),
        ),
      ) === 'IgnoredPath'),
  )
})

Deno.test('∀result_TsgolintOnStderr_=RetryWithoutTypeAware — a tsgolint marker on stderr requests a type-aware retry', () => {
  fc.assert(
    fc.property(
      arbitraryProcessResult,
      markerWithShortTail('Failed to find tsgolint executable'),
      (result, stderr) => outcomeTag(classify(nonzero({ ...result, stdout: '', stderr }))) === 'RetryWithoutTypeAware',
    ),
  )
})

Deno.test('∀result_TsgolintOnStdout_=RetryWithoutTypeAware — the oxlint-tsgolint marker on stdout requests a retry', () => {
  fc.assert(
    fc.property(
      arbitraryProcessResult,
      markerWithShortTail('oxlint-tsgolint'),
      (result, stdout) => outcomeTag(classify(nonzero({ ...result, stdout, stderr: '' }))) === 'RetryWithoutTypeAware',
    ),
  )
})

Deno.test('∀result_TsgolintOnStdoutWithStderr_=RetryWithoutTypeAware — detection reads stdout even when stderr is non-empty', () => {
  fc.assert(
    fc.property(
      arbitraryProcessResult,
      markerWithShortTail('tsgolint'),
      (result, stdout) =>
        outcomeTag(classify(nonzero({ ...result, stdout, stderr: 'some other error' }))) === 'RetryWithoutTypeAware',
    ),
  )
})

Deno.test('∀result_TsgolintRetryExhausted_=LintViolation — without canRetry the tsgolint marker is a violation', () => {
  fc.assert(
    fc.property(
      arbitraryProcessResult,
      markerWithShortTail('tsgolint'),
      (result, stderr) => outcomeTag(classify(nonzero({ ...result, stdout: '', stderr }), false)) === 'LintViolation',
    ),
  )
})

Deno.test('∀result_PlainViolation_=LintViolation — noise-free nonzero output is a violation echoing the stderr', () => {
  fc.assert(
    fc.property(arbitraryProcessResult, arbitraryViolationOutput, (result, output) => {
      const classified = classify(nonzero({ ...result, stderr: output, stdout: 'stdout-noise' }))
      return !classified.ok && classified.error.output === output
    }),
  )
})

Deno.test('∀result_ViolationWithoutStderr_=LintViolation — with empty stderr the violation echoes the stdout', () => {
  fc.assert(
    fc.property(arbitraryProcessResult, arbitraryViolationOutput, (result, output) => {
      const classified = classify(nonzero({ ...result, stderr: '', stdout: output }))
      return !classified.ok && classified.error.output === output
    }),
  )
})
