import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { openRouterLoopback } from './__fixtures__/openrouter-loopback.fixture.js'
import {
  type DevPairScript,
  expectedTuningOf,
  tuneJudgeRunOf,
  tuneJudgeStackOf,
} from './__fixtures__/tune-judge.fixture.js'

const Feature = makeFeature({ it, layer })

const answeredPass = (id: string, taskId: string, critique: string): DevPairScript => ({
  id,
  taskId,
  labelVerdict: 'Pass',
  judgeVerdict: 'Pass',
  critique,
})

const steadyScript: ReadonlyArray<DevPairScript> = [
  answeredPass('pair-dev-trellis', 'task-dev-trellis', 'the trellis work leaves both vent rules satisfied.'),
  answeredPass('pair-dev-harvest', 'task-dev-harvest', 'the harvest work leaves both vent rules satisfied.'),
]

const driftingScript: ReadonlyArray<DevPairScript> = [
  {
    id: 'pair-dev-trellis',
    taskId: 'task-dev-trellis',
    labelVerdict: 'Pass',
    judgeVerdict: 'Fail',
    critique: 'hourly venting opens the vents the sealed rule keeps shut.',
  },
  {
    id: 'pair-dev-harvest',
    taskId: 'task-dev-harvest',
    labelVerdict: 'Fail',
    judgeVerdict: 'Pass',
    critique: 'the harvest fits the trellis rule, so both rules hold.',
  },
  {
    id: 'pair-dev-mulch',
    taskId: 'task-dev-mulch',
    labelVerdict: 'Fail',
    judgeVerdict: 'Fail',
    critique: 'mulching leaves the vents untouched, so both rules hold.',
  },
  {
    id: 'pair-dev-compost',
    taskId: 'task-dev-compost',
    labelVerdict: 'Pass',
    judgeVerdict: 'Pass',
    critique: 'the compost work never touches the vents.',
  },
]

const devJudgements = [
  { script: 'steady', devPairs: steadyScript },
  { script: 'drifting', devPairs: driftingScript },
] as const

const rateTextOf = (rate: PackEval.TuneJudge.TuneJudgeRate, hits: number, total: number): string =>
  rate === '-' ? '-' : `${(rate * 100).toFixed(1)}% (${hits}/${total})`

interface TunedJudge {
  readonly result: PackEval.TuneJudge.TuneJudgeResult
  readonly asked: number
  readonly texts: ReadonlyArray<string>
  readonly card: string
}

Feature('Tuning the contradiction judge on dev pairs')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A <script> judge is tuned from its dev pairs alone',
      devJudgements,
      (row) =>
        Gherkin.Do.pipe(
          Given('a world whose dev pairs carry the scripted verdicts')(
            'world',
            () => tuneJudgeRunOf([...row.devPairs]),
          ),
          When('the judge is tuned over the dev pairs')(
            'tuned',
            (s) =>
              Effect.gen(function*() {
                const result = yield* PackEval.TuneJudge.run.run({
                  packDirs: [s.world.packDir],
                  datasetDir: s.world.datasetDir,
                }).pipe(Effect.provide(tuneJudgeStackOf(s.world)))
                const asked = yield* s.world.provider.requestCount
                const requests = yield* s.world.provider.requests
                return {
                  result,
                  asked,
                  texts: requests.map((request) => request.text),
                  card: s.world.lines.join('\n'),
                } satisfies TunedJudge
              }),
          ),
          Then('only the dev pairs reach the provider')((s) => {
            expect(s.tuned.asked).toBe(expectedTuningOf([...row.devPairs]).devCount)
            for (const text of s.tuned.texts) {
              expect(text).toContain('TRAIN task:')
              expect(text).not.toContain('TEST task:')
            }
          }),
          Then('the recalls and the disagreement listing match the scripted verdicts')((s) => {
            const expected = expectedTuningOf([...row.devPairs])
            expect(s.tuned.result.tpr).toBe(expected.tpr)
            expect(s.tuned.result.tnr).toBe(expected.tnr)
            expect(s.tuned.result.disagreements.map((row) => row.id)).toEqual(
              expected.disagreements.map((entry) => entry.id),
            )
            expect(s.tuned.card).toContain(
              `TPR (judge Pass on label Pass): ${rateTextOf(expected.tpr, expected.passHits, expected.passTotal)}`,
            )
            expect(s.tuned.card).toContain(
              `TNR (judge Fail on label Fail): ${rateTextOf(expected.tnr, expected.failHits, expected.failTotal)}`,
            )
            for (const [index, entry] of expected.disagreements.entries()) {
              expect(s.tuned.card).toContain(entry.critique)
              for (const later of expected.disagreements.slice(index + 1)) {
                expect(s.tuned.card.indexOf(entry.id)).toBeLessThan(s.tuned.card.indexOf(later.id))
              }
            }
          }),
        ),
    )
  })
