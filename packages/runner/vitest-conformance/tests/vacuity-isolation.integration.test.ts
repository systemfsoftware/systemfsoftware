import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Layer from 'effect/Layer'
import {
  fileNamesOf,
  fileOf,
  ModuleIdSequencer,
  type ProbeFailure,
  type ProbeRun,
  runProbes,
} from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const PLAIN = 'isolation/01-plain.runner.test.ts'
const VACUOUS = 'isolation/02-vacuous.property.runner.test.ts'
const VACUOUS_NAME = '∀n_AlwaysHolds_=True'
const VACUOUS_TEXT = 'no property in this file refuted'

const twoFiles = (isolate: boolean): Effect.Effect<ProbeRun, ProbeFailure> =>
  runProbes({
    globs: [PLAIN, VACUOUS],
    fileParallelism: false,
    isolate,
    maxWorkers: 1,
    sequencer: ModuleIdSequencer,
  })

const judged = (run: ProbeRun): object => ({
  order: fileNamesOf(run.report).map((name) => name.endsWith(PLAIN) ? 'plain' : 'vacuous'),
  plain: fileOf(run.report, PLAIN).status,
  vacuous: fileOf(run.report, VACUOUS).status,
  message: fileOf(run.report, VACUOUS).message,
  refusals: run.moduleErrors.length,
  refusal: run.moduleErrors[0]?.message ?? '',
})

Feature('Judging vacuity per file')
  .live('each scenario starts one nested Vitest run over two probe files in a single worker')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'With file isolation, the second and vacuous property file is refused at its own end',
      Gherkin.Do.pipe(
        Given('a plain file, then a vacuous property file, each with its own module cache')(
          'run',
          () => twoFiles(true),
        ),
        Then('the plain file passed and the property file was refused exactly once')((s, expect) =>
          expect(judged(s.run)).toMatchObject({
            order: ['plain', 'vacuous'],
            plain: 'passed',
            vacuous: 'failed',
            message: expect.stringContaining(VACUOUS_TEXT),
            refusals: 1,
            refusal: expect.stringContaining(VACUOUS_NAME),
          })
        ),
      ),
    )

    scenario(
      'Without file isolation, the second and vacuous property file is refused at its own end',
      Gherkin.Do.pipe(
        Given('a plain file, then a vacuous property file, sharing one module cache')(
          'run',
          () => twoFiles(false),
        ),
        Then('the plain file passed and the property file was refused exactly once')((s, expect) =>
          expect(judged(s.run)).toMatchObject({
            order: ['plain', 'vacuous'],
            plain: 'passed',
            vacuous: 'failed',
            message: expect.stringContaining(VACUOUS_TEXT),
            refusals: 1,
            refusal: expect.stringContaining(VACUOUS_NAME),
          })
        ),
      ),
    )
  })
