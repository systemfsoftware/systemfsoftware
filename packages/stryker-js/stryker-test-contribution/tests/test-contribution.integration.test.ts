import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type PartialStrykerOptions, StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as Schema from 'effect/Schema'
import * as schema from 'mutation-testing-report-schema/api'
import { expect } from 'vitest'

import { Evaluator, type EvaluatorFailed, type ExitClass } from '@systemfsoftware/stryker-js/Evaluator'
import { RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import { testContributionEvaluatorLayer } from '@systemfsoftware/stryker-test-contribution'

const Feature = makeFeature({ it, layer })

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const mutantOf = (
  id: string,
  status: schema.MutantStatus,
  killedBy?: string[],
  coveredBy?: string[],
): schema.MutantResult => ({
  id,
  status,
  mutatorName: 'BooleanLiteral',
  location: LOCATION,
  ...(killedBy === undefined ? {} : { killedBy }),
  ...(coveredBy === undefined ? {} : { coveredBy }),
})

const fullReportOf = (
  mutants: schema.MutantResult[],
  testFiles: Record<string, string[]>,
): schema.MutationTestResult => ({
  schemaVersion: '2',
  thresholds: { high: 80, low: 60 },
  files: {
    'src/subject.ts': { language: 'typescript', source: 'export const a = 1\n', mutants },
  },
  testFiles: Object.fromEntries(
    Object.entries(testFiles).map(([fileName, testIds]) => [
      fileName,
      { tests: testIds.map((id) => ({ id, name: `test ${id}` })) },
    ]),
  ),
})

const evaluatorViaLayerWith = (options: PartialStrykerOptions) => {
  const decoded = Schema.decodeUnknownSync(StrykerOptionsSchema)(options)
  return Effect.gen(function*() {
    const context = yield* Layer.build(
      testContributionEvaluatorLayer.pipe(Layer.provide(Layer.succeed(RunConfiguration, decoded))),
    )
    return Context.get(context, Evaluator)
  })
}
interface EvaluatorServiceShape {
  readonly evaluate: (report: schema.MutationTestResult) => Effect.Effect<ExitClass | null, EvaluatorFailed>
}

const exitOf = (evaluator: EvaluatorServiceShape, report: schema.MutationTestResult) =>
  Effect.exit(evaluator.evaluate(report))

const evaluateWithLogs = (
  evaluator: EvaluatorServiceShape,
  report: schema.MutationTestResult,
) =>
  Effect.gen(function*() {
    const messages: Array<unknown> = []
    const collector = Logger.make(({ message }) => {
      messages.push(message)
    })
    const exit = yield* exitOf(evaluator, report).pipe(
      Effect.provide(Logger.layer([collector])),
    )
    return { exit, messages }
  })

const logTextOf = (messages: ReadonlyArray<unknown>): string => {
  const texts: Array<string> = []
  for (const message of messages) {
    if (typeof message === 'string') {
      texts.push(message)
    } else if (Array.isArray(message)) {
      for (const part of message) {
        texts.push(typeof part === 'string' ? part : String(part))
      }
    } else {
      texts.push(JSON.stringify(message))
    }
  }
  return texts.join('\n')
}

const expectVerdictFail = (exit: Exit.Exit<ExitClass | null, EvaluatorFailed>): void => {
  expect(Exit.isSuccess(exit)).toBe(true)
  if (Exit.isSuccess(exit)) {
    expect(exit.value).toBe('VerdictFail')
  }
}

const expectPass = (exit: Exit.Exit<ExitClass | null, EvaluatorFailed>): void => {
  expect(Exit.isSuccess(exit)).toBe(true)
  if (Exit.isSuccess(exit)) {
    expect(exit.value).toBeNull()
  }
}

Feature('Judging test contribution through the public evaluator layer')
  .body(({ scenario }) => {
    scenario(
      'A kernel file that kills nothing another file does not also kill fails the run',
      Gherkin.Do.pipe(
        Given('a report where one kernel file earns a sole kill and another earns nothing')(
          'report',
          () =>
            Effect.succeed(
              fullReportOf(
                [
                  mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
                  mutantOf('m2', 'Killed', ['t1'], ['t1']),
                ],
                { 'earns.kernel.property.test.ts': ['t1'], 'idle.kernel.property.test.ts': ['t2'] },
              ),
            ),
        ),
        When('the run is evaluated with every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with the VerdictFail exit class')((s) => {
          expectVerdictFail(s.exit)
        }),
      ),
    )

    scenario(
      'Every kernel file killing a distinct mutant lets the run pass',
      Gherkin.Do.pipe(
        Given('a report where every kernel file kills a distinct mutant')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1'], ['t1']),
                mutantOf('m2', 'Killed', ['t2'], ['t2']),
              ],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'also.kernel.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with null')((s) => {
          expectPass(s.exit)
        }),
      ),
    )

    scenario(
      'Bail hiding possible killers still fails the run instead of judging files',
      Gherkin.Do.pipe(
        Given('a report with a toothless kernel file evaluated under bail')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
                mutantOf('m2', 'Killed', ['t1'], ['t1']),
              ],
              { 'earns.kernel.property.test.ts': ['t1'], 'idle.kernel.property.test.ts': ['t2'] },
            ),
          )),
        When('the run is evaluated without every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({})
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with the VerdictFail exit class')((s) => {
          expectVerdictFail(s.exit)
        }),
      ),
    )

    scenario(
      'A run with no kernel workflow or policy files stays silent',
      Gherkin.Do.pipe(
        Given('a report whose files carry no default suffix')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
              { 'plain.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with null')((s) => {
          expectPass(s.exit)
        }),
      ),
    )

    scenario(
      'No kill credited to any test file fails the run itself',
      Gherkin.Do.pipe(
        Given('a report with killed mutants but no credited killer')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed'), mutantOf('m2', 'Timeout')],
              { 'unjudged.kernel.property.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with the VerdictFail exit class')((s) => {
          expectVerdictFail(s.exit)
        }),
      ),
    )

    scenario(
      'A file covering an unattributed kill is spared because removing it might resurrect the kill',
      Gherkin.Do.pipe(
        Given('a file covering a timeout whose killing test was never named')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1']), mutantOf('m2', 'Timeout', [], ['t2'])],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'hangs.kernel.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with null')((s) => {
          expectPass(s.exit)
        }),
      ),
    )

    scenario(
      'An Ignored mutant is not counted as killable when judging who was offered one',
      Gherkin.Do.pipe(
        Given('a report whose only idle kernel file covers only an Ignored mutant')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1']), mutantOf('m2', 'Ignored', [], ['t2'])],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'ignored-cover.kernel.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with null')((s) => {
          expectPass(s.exit)
        }),
      ),
    )

    scenario(
      'Two kernel files killing exactly the same mutants fail the run',
      Gherkin.Do.pipe(
        Given('a report where two kernel files kill exactly the same mutants')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
                mutantOf('m2', 'Killed', ['t1', 't2'], ['t1', 't2']),
              ],
              {
                'a.kernel.property.test.ts': ['t1'],
                'b.kernel.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'exit',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              return yield* exitOf(evaluator, s.report)
            }),
        ),
        Then('the evaluation succeeds with the VerdictFail exit class')((s) => {
          expectVerdictFail(s.exit)
        }),
      ),
    )

    scenario(
      'A lone killer defends its file while a file offered nothing killable goes unjudged',
      Gherkin.Do.pipe(
        Given('a report where one kernel file alone kills and another covers nothing killable')(
          'report',
          () =>
            Effect.succeed(
              fullReportOf(
                [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
                { 'earns.kernel.property.test.ts': ['t1'], 'bare.kernel.property.test.ts': ['t2'] },
              ),
            ),
        ),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes reporting one judged and one unjudged file')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('1 judged')
          expect(s.outcome.logs).toContain('1 unjudged')
          expect(s.outcome.logs).not.toContain('just as dead')
        }),
      ),
    )

    scenario(
      'Files that only ever kill together are both blamed without a joint escape',
      Gherkin.Do.pipe(
        Given('a report where two kernel files kill one mutant together')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2'])],
              { 'a.kernel.property.test.ts': ['t1'], 'b.kernel.property.test.ts': ['t2'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails blaming both files with no joint escape')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('a.kernel.property.test.ts')
          expect(s.outcome.logs).toContain('b.kernel.property.test.ts')
          expect(s.outcome.logs).toContain('would not leave every mutant just as dead')
        }),
      ),
    )

    scenario(
      'A kill shared with an unknown test denies the covering file sole credit',
      Gherkin.Do.pipe(
        Given('a report where one killer id names no test file')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1', 'ghost'], ['t1'])],
              { 'a.kernel.property.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails blaming the covering file with no joint escape')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('a.kernel.property.test.ts')
          expect(s.outcome.logs).toContain('would not leave every mutant just as dead')
        }),
      ),
    )

    scenario(
      'A recorded timeout kill defends its file',
      Gherkin.Do.pipe(
        Given('a report where a timeout names its killing test')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Timeout', ['t1'], ['t1'])],
              { 'a.kernel.property.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes with the unique-kill claim')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('kills a mutant nothing else kills')
        }),
      ),
    )

    scenario(
      'A surviving mutant credits no file, blaming the run instead',
      Gherkin.Do.pipe(
        Given('a report where the only mutant survived')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Survived', ['t1'], ['t1'])],
              { 'a.kernel.property.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails blaming the run itself, crediting no file')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('credited no kill to any test file')
          expect(s.outcome.logs).not.toContain('a.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'A kill credited to no test blames the run instead of the covering file',
      Gherkin.Do.pipe(
        Given('a report where a killed mutant names no killing test')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', undefined, ['t1'])],
              { 'a.kernel.property.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails blaming the run itself, not the file')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('credited no kill to any test file')
          expect(s.outcome.logs).not.toContain('a.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'An idle file fails the run, is named, and carries no bail text',
      Gherkin.Do.pipe(
        Given('a report where one kernel file earns a sole kill and another earns nothing')(
          'report',
          () =>
            Effect.succeed(
              fullReportOf(
                [
                  mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
                  mutantOf('m2', 'Killed', ['t1'], ['t1']),
                ],
                { 'earns.kernel.property.test.ts': ['t1'], 'idle.kernel.property.test.ts': ['t2'] },
              ),
            ),
        ),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails naming the idle file with an exact joint verdict')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('idle.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('earns.kernel.property.test.ts')
          expect(s.outcome.logs).toContain('would leave every mutant just as dead')
          expect(s.outcome.logs).not.toContain('would not leave')
          expect(s.outcome.logs).toContain('every killing test was recorded')
          expect(s.outcome.logs).not.toContain('disableBail')
        }),
      ),
    )

    scenario(
      'Bail mode reports a configuration error instead of naming files',
      Gherkin.Do.pipe(
        Given('a report with an idle kernel file evaluated under bail')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
                mutantOf('m2', 'Killed', ['t1'], ['t1']),
              ],
              { 'earns.kernel.property.test.ts': ['t1'], 'idle.kernel.property.test.ts': ['t2'] },
            ),
          )),
        When('the run is evaluated without every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({})
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails citing the bail configuration, not the files')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('bail')
          expect(s.outcome.logs).toContain('disableBail: true')
          expect(s.outcome.logs).not.toContain('idle.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('earns.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'Bail mode with workflow files reports the configuration, not the files',
      Gherkin.Do.pipe(
        Given('a report with idle workflow files evaluated under bail')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1'], ['t1']),
                mutantOf('m2', 'Killed', ['t1'], ['t1']),
              ],
              {
                'sole.workflow.property.test.ts': ['t1'],
                'idle.workflow.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated without every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({})
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails naming the flag, not the workflow files')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('disableBail: true')
          expect(s.outcome.logs).not.toContain('sole.workflow.property.test.ts')
          expect(s.outcome.logs).not.toContain('idle.workflow.property.test.ts')
        }),
      ),
    )

    scenario(
      'A run with no matching files stays silent even when killers went unrecorded',
      Gherkin.Do.pipe(
        Given('a report whose files carry no default suffix')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
              { 'plain.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated without every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({})
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes staying silent with no bail text')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('so none was judged')
          expect(s.outcome.logs).not.toContain('disableBail')
        }),
      ),
    )

    scenario(
      'A run with no matching files names every default suffix in its silence',
      Gherkin.Do.pipe(
        Given('a report with no in-scope test files')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
              { 'plain.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes naming every configured suffix')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('so none was judged')
          expect(s.outcome.logs).toContain(
            '.workflow.property.test.ts, .policy.property.test.ts, .kernel.property.test.ts',
          )
        }),
      ),
    )

    scenario(
      'Schema-only tests are out of scope for the default suffixes',
      Gherkin.Do.pipe(
        Given('a report whose only tests are schema property tests')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.schema.property.test.ts': ['t1'],
                'idle.schema.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes with no judgement')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('so none was judged')
        }),
      ),
    )

    scenario(
      'A workflow test among schema tests triggers judgement',
      Gherkin.Do.pipe(
        Given('a report with a workflow property test among schema ones')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.workflow.property.test.ts': ['t1'],
                'idle.workflow.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails naming the idle workflow file')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('idle.workflow.property.test.ts')
        }),
      ),
    )

    scenario(
      'A file outside the default suffixes is never blamed',
      Gherkin.Do.pipe(
        Given('a report where the idle file matches no default suffix')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'idle.integration.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes never naming the out-of-scope file')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('kills a mutant nothing else kills')
          expect(s.outcome.logs).not.toContain('idle.integration.test.ts')
        }),
      ),
    )

    scenario(
      'Blamed files appear on their own bulleted lines in alphabetical order',
      Gherkin.Do.pipe(
        Given('a report with several blamed files recorded out of order')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2', 't3'])],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'zebra.kernel.property.test.ts': ['t2'],
                'alpha.kernel.property.test.ts': ['t3'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails listing the blamed files alphabetically')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('  - alpha.kernel.property.test.ts\n  - zebra.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('earns.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'A file matching another default suffix is judged in scope',
      Gherkin.Do.pipe(
        Given('a report where the idle file matches a different default suffix')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'idle.policy.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails naming the matching idle file')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('idle.policy.property.test.ts')
        }),
      ),
    )

    scenario(
      'A kill from an unknown test id blames the run and names no file',
      Gherkin.Do.pipe(
        Given('a kill whose only killer id names no test file and a real file covers it')(
          'report',
          () =>
            Effect.succeed(
              fullReportOf(
                [mutantOf('m1', 'Killed', ['ghost'], ['t1'])],
                {
                  'a.kernel.property.test.ts': ['t1'],
                  'b.kernel.property.test.ts': ['t2'],
                },
              ),
            ),
        ),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails blaming the run itself')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('credited no kill to any test file')
          expect(s.outcome.logs).not.toContain('a.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('b.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'A defending file and an exempt file pass with judged and exempt counts',
      Gherkin.Do.pipe(
        Given('a report where one file defends and another only covers an unattributed kill')(
          'report',
          () =>
            Effect.succeed(
              fullReportOf(
                [
                  mutantOf('m1', 'Killed', ['t1'], ['t1']),
                  mutantOf('m2', 'Killed', ['ghost'], ['t2']),
                ],
                {
                  'earns.kernel.property.test.ts': ['t1'],
                  'exempt.kernel.property.test.ts': ['t2'],
                },
              ),
            ),
        ),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes with judged and exempt counts and no unique-kill claim')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('1 judged')
          expect(s.outcome.logs).toContain('1 exempted')
          expect(s.outcome.logs).not.toContain('kills a mutant nothing else kills')
        }),
      ),
    )

    scenario(
      'Files killing exactly the same mutants fail without a joint escape claim',
      Gherkin.Do.pipe(
        Given('a report where two kernel files kill exactly the same mutants')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
                mutantOf('m2', 'Killed', ['t1', 't2'], ['t1', 't2']),
              ],
              {
                'a.kernel.property.test.ts': ['t1'],
                'b.kernel.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails denying the joint escape and naming both files')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('would not leave every mutant just as dead')
          expect(s.outcome.logs).toContain('a.kernel.property.test.ts')
          expect(s.outcome.logs).toContain('b.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'Files whose kills all survive outside the blamed set earn the joint verdict',
      Gherkin.Do.pipe(
        Given('a report where every mutant the blamed files kill keeps an outside killer')(
          'report',
          () =>
            Effect.succeed(
              fullReportOf(
                [
                  mutantOf('m1', 'Killed', ['t1', 't3'], ['t1', 't3']),
                  mutantOf('m2', 'Killed', ['t2', 't3'], ['t2', 't3']),
                  mutantOf('m3', 'Killed', ['t3'], ['t3']),
                ],
                {
                  'a.kernel.property.test.ts': ['t1'],
                  'b.kernel.property.test.ts': ['t2'],
                  'c.kernel.property.test.ts': ['t3'],
                },
              ),
            ),
        ),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails claiming the blamed set is jointly deletable')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('would leave every mutant just as dead')
          expect(s.outcome.logs).toContain('a.kernel.property.test.ts')
          expect(s.outcome.logs).toContain('b.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('c.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'Unattributed kills across two mutants blame the run itself',
      Gherkin.Do.pipe(
        Given('a report with killed mutants but no credited killer')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', undefined, ['t1']), mutantOf('m2', 'Timeout', undefined, ['t1'])],
              { 'unjudged.kernel.property.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails blaming the run and naming no file')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('credited no kill to any test file')
          expect(s.outcome.logs).not.toContain('unjudged.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'An auditable idle file is blamed while an unoffered file is spared',
      Gherkin.Do.pipe(
        Given('a report with one auditable idle file and one unauditable idle file')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'auditable.kernel.property.test.ts': ['t2'],
                'unauditable.kernel.property.test.ts': ['t3'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails naming only the auditable file')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('auditable.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('unauditable.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'A file that kills two mutants alone still defends its file',
      Gherkin.Do.pipe(
        Given('a report with two mutants both killed by the same file')('report', () =>
          Effect.succeed(
            fullReportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1']), mutantOf('m2', 'Killed', ['t1'], ['t1'])],
              { 'busy.kernel.property.test.ts': ['t1'] },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes with the unique-kill claim')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('kills a mutant nothing else kills')
        }),
      ),
    )

    scenario(
      'A timeout with no killer list spares its covering file like an empty list',
      Gherkin.Do.pipe(
        Given('a timeout whose killer list is absent rather than empty')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1'], ['t1']),
                mutantOf('m2', 'Timeout', undefined, ['t2']),
              ],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'hangs.kernel.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes with judged and exempt counts')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('1 judged')
          expect(s.outcome.logs).toContain('1 exempted')
        }),
      ),
    )

    scenario(
      'A file covering nothing is blamed while the unattributed coverer is spared',
      Gherkin.Do.pipe(
        Given('a report with one coverer of an unattributed kill and one idle file')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1'], ['t1', 't3']),
                mutantOf('m2', 'Timeout', [], ['t2']),
              ],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'hangs.kernel.property.test.ts': ['t2'],
                'idle.kernel.property.test.ts': ['t3'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run fails naming only the idle file')((s) => {
          expectVerdictFail(s.outcome.exit)
          expect(s.outcome.logs).toContain('idle.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('hangs.kernel.property.test.ts')
          expect(s.outcome.logs).not.toContain('earns.kernel.property.test.ts')
        }),
      ),
    )

    scenario(
      'Every kernel file earning its place lets the run pass with the unique-kill claim',
      Gherkin.Do.pipe(
        Given('a report where every kernel file kills a distinct mutant')('report', () =>
          Effect.succeed(
            fullReportOf(
              [
                mutantOf('m1', 'Killed', ['t1'], ['t1']),
                mutantOf('m2', 'Killed', ['t2'], ['t2']),
              ],
              {
                'earns.kernel.property.test.ts': ['t1'],
                'also.kernel.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes stating every file kills uniquely')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('kills a mutant nothing else kills')
        }),
      ),
    )

    scenario(
      'A file the report offered nothing killable is reported unjudged',
      Gherkin.Do.pipe(
        Given('a report with one defending file and one file offered no killable mutant')(
          'report',
          () =>
            Effect.succeed(
              fullReportOf(
                [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
                {
                  'earns.kernel.property.test.ts': ['t1'],
                  'bare.kernel.property.test.ts': ['t3'],
                },
              ),
            ),
        ),
        When('the run is evaluated with every killer recorded')(
          'outcome',
          (s) =>
            Effect.gen(function*() {
              const evaluator = yield* evaluatorViaLayerWith({ disableBail: true })
              const { exit, messages } = yield* evaluateWithLogs(evaluator, s.report)
              return { exit, logs: logTextOf(messages) }
            }),
        ),
        Then('the run passes reporting the bare file unjudged')((s) => {
          expectPass(s.outcome.exit)
          expect(s.outcome.logs).toContain('1 judged')
          expect(s.outcome.logs).toContain('1 unjudged')
          expect(s.outcome.logs).not.toContain('kills a mutant nothing else kills')
        }),
      ),
    )
  })
