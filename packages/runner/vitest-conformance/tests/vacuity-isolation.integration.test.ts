import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Option } from 'effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import {
  fileNamesOf,
  fileOf,
  type ModuleError,
  ModuleIdSequencer,
  type ProbeRun,
  type ProbeRunOptions,
  runProbes,
  VacuousErrorShape,
} from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const PLAIN = 'isolation/01-plain.runner.test.ts'
const VACUOUS = 'isolation/02-vacuous.property.runner.test.ts'
const VACUOUS_NAME = '∀n_AlwaysHolds_=True'
const VACUOUS_PROBE_RUNS = 5

const twoFilesInOneWorker = (isolate: boolean): ProbeRunOptions => ({
  globs: [PLAIN, VACUOUS],
  fileParallelism: false,
  isolate,
  maxWorkers: 1,
  sequencer: ModuleIdSequencer,
})

const probeNameOf = (file: string): string => [PLAIN, VACUOUS].find((name) => file.endsWith(name)) ?? file

const refusalOf = ({ file, raw }: ModuleError) =>
  Option.match(Schema.decodeUnknownOption(VacuousErrorShape)(raw), {
    onNone: () => ({ file: probeNameOf(file), tag: raw.name ?? 'Error', properties: [] }),
    onSome: (refused) => ({
      file: probeNameOf(file),
      tag: refused._tag,
      properties: refused.subjects.flatMap((subject) =>
        subject.properties.map((run) => ({ name: run.property.name, runs: run.property.runs }))
      ),
    }),
  })

const judged = (run: ProbeRun) => ({
  order: fileNamesOf(run.report).map(probeNameOf),
  plain: fileOf(run.report, PLAIN).status,
  vacuous: fileOf(run.report, VACUOUS).status,
  refusals: run.moduleErrors.map(refusalOf),
})

const refusedAtItsOwnEnd = {
  order: [PLAIN, VACUOUS],
  plain: 'passed',
  vacuous: 'failed',
  refusals: [
    {
      file: VACUOUS,
      tag: 'VacuousProperty',
      properties: [{ name: VACUOUS_NAME, runs: VACUOUS_PROBE_RUNS }],
    },
  ],
}

Feature('Judging vacuity per file')
  .live('each scenario starts one nested Vitest run over two probe files in a single worker')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'With file isolation, the second and vacuous property file is refused at its own end',
      Gherkin.Do.pipe(
        Given('a plain file, then a vacuous property file, each with its own module cache')(
          'options',
          () => Effect.succeed(twoFilesInOneWorker(true)),
        ),
        When('both files run in one worker')('run', (s) => runProbes(s.options)),
        Then('only the property file is refused, once, for its vacuous property')((s, expect) =>
          expect(judged(s.run)).toEqual(refusedAtItsOwnEnd)
        ),
      ),
    )

    scenario(
      'Without file isolation, the second and vacuous property file is refused at its own end',
      Gherkin.Do.pipe(
        Given('a plain file, then a vacuous property file, sharing one module cache')(
          'options',
          () => Effect.succeed(twoFilesInOneWorker(false)),
        ),
        When('both files run in one worker')('run', (s) => runProbes(s.options)),
        Then('only the property file is refused, once, for its vacuous property')((s, expect) =>
          expect(judged(s.run)).toEqual(refusedAtItsOwnEnd)
        ),
      ),
    )
  })
