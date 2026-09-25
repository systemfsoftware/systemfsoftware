import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { assertionOf, errorOf, probeSource, runProbes } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const ASSERTION_PROBE = 'runner/failure-record-assertion.test.ts'
const STEP_PROBE = 'runner/failure-record-step.test.ts'
const REFUSED_PROBE = 'runner/failure-record-refused.test.ts'

const ASSERTION_TEST = 'Should_ReportAnAssertionError_When_ItsOnlyCheckMismatches'
const STEP_TEST = 'Failing step record > A Given step fails with a message-less error'
const REFUSED_TEST = 'Should_RefuseTheRecord_When_TheFailureNamesNoLocation'

const lineWith = (source: string, needle: string): number => {
  const line = source.split('\n').findIndex((text) => text.includes(needle))
  if (line < 0) throw new Error(`the probe source holds no line with ${JSON.stringify(needle)}`)
  return line + 1
}

interface RaisedAt {
  readonly path: string
  readonly line: number
}

const RAISED_AT = /^ {2}raised at (.+):(\d+)(?: \(.*\))?$/u

const raisedAtOf = (stack: string): RaisedAt | undefined => {
  const [, path, line] = RAISED_AT.exec(stack.split('\n')[1] ?? '') ?? []
  return path === undefined || line === undefined ? undefined : { path, line: Number(line) }
}

const firstLine = (text: string): string => text.split('\n')[0] ?? ''

const countOf = (text: string, part: string): number => text.split(part).length - 1

const loggedErrors = (run: { readonly console: ReadonlyArray<{ readonly content: string }> }): number =>
  run.console.flatMap((line) => line.content.split('\n')).filter((text) => text.includes('ERROR (#')).length

Feature('What a real Vitest run reports for a failure record')
  .live('each scenario starts a nested Vitest run over a probe fixture, and a kernel run cannot happen beside one')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A plain check mismatch is reported once as an AssertionError whose stack leads with the record',
      Gherkin.Do.pipe(
        Given('the nested run over a probe whose only check mismatches')(
          'run',
          () => runProbes({ globs: [ASSERTION_PROBE] }),
        ),
        When('the reporter hands its one error back')('error', (s) => Effect.succeed(errorOf(s.run, ASSERTION_TEST))),
        Then('the error leads with the record and names the expect line')((s, expect) => {
          const expectLine = lineWith(probeSource(ASSERTION_PROBE), 'yield* expect(')
          const stack = s.error.stack ?? ''
          const raised = raisedAtOf(stack)
          const headline = firstLine(stack)
          const failure = assertionOf(s.run.report, ASSERTION_TEST)
          return expect({
            name: s.error.name,
            leadsWithAssertionError: headline.startsWith('AssertionError: '),
            raisedMatchesTheProbe: raised !== undefined,
            raisedPathIsTheProbe: raised?.path.endsWith(ASSERTION_PROBE) ?? false,
            raisedLineIsTheExpect: raised?.line === expectLine,
            hasExpected: s.error.expected !== undefined,
            hasActual: s.error.actual !== undefined,
            hasDiff: s.error.diff !== undefined,
            reportedFailures: failure.failureMessages.length,
            headlineOccurrences: countOf(failure.failureMessages.join('\n'), headline),
            loggedErrors: loggedErrors(s.run),
          }).toEqual({
            name: 'AssertionError',
            leadsWithAssertionError: true,
            raisedMatchesTheProbe: true,
            raisedPathIsTheProbe: true,
            raisedLineIsTheExpect: true,
            hasExpected: true,
            hasActual: true,
            hasDiff: true,
            reportedFailures: 1,
            headlineOccurrences: 1,
            loggedErrors: 0,
          })
        }),
      ),
    )

    scenario(
      'A gherkin step failure is reported as a StepError record naming the failing step',
      Gherkin.Do.pipe(
        Given('the nested run over a probe whose Given step fails')('run', () => runProbes({ globs: [STEP_PROBE] })),
        When('the reporter hands its one error back')('error', (s) => Effect.succeed(errorOf(s.run, STEP_TEST))),
        Then('the record headlines the failing step and lists the step trail')((s, expect) =>
          expect({
            name: s.error.name,
            headline: firstLine(s.error.stack ?? ''),
            messageHead: firstLine(s.error.message),
            hasFailingStepLine: s.error.stack?.includes('Failing step: Given a user logs in') ?? false,
            hasStepTrailHeader: s.error.stack?.includes('Steps and the decisions each caused:') ?? false,
            trailNamesTheStep: s.error.stack?.includes('✗ Given a user logs in') ?? false,
          }).toEqual({
            name: 'StepError',
            headline: 'StepError: Given "a user logs in" failed: Unauthorized {"user":"bob"}',
            messageHead: 'Given "a user logs in" failed: Unauthorized {"user":"bob"}',
            hasFailingStepLine: true,
            hasStepTrailHeader: true,
            trailNamesTheStep: true,
          })
        ),
      ),
    )

    scenario(
      'A failure with no source location is reported as a refused record carrying the record it replaced',
      Gherkin.Do.pipe(
        Given('the nested run over a probe whose failure names no location')(
          'run',
          () => runProbes({ globs: [REFUSED_PROBE] }),
        ),
        When('the reporter hands its one error back')('error', (s) => Effect.succeed(errorOf(s.run, REFUSED_TEST))),
        Then('the refusal names the missing location and keeps the record in its stack')((s, expect) => {
          const stack = s.error.stack ?? ''
          return expect({
            name: s.error.name,
            namesTheMissingLocation: s.error.message.includes('the record names no source location'),
            stackCarriesTheRecord: stack.includes('{"missing":"location"}'),
            stackCarriesTheTrail: stack.includes('Failing step:'),
          }).toEqual({
            name: 'FailureRecordRefused',
            namesTheMissingLocation: true,
            stackCarriesTheRecord: true,
            stackCarriesTheTrail: true,
          })
        }),
      ),
    )
  })
