import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { openRouterLoopback } from './__fixtures__/openrouter-loopback.fixture.js'
import {
  filterPairs,
  plantedBody,
  ratesPairs,
  trainCritiqueObserved,
  trainCritiquePlanted,
  tuneJudgeStack,
  type TuneJudgeWorld,
  tuneJudgeWorld,
  verdictReply,
} from './__fixtures__/tune-judge.fixture.js'

const Feature = makeFeature({ it, layer })

interface TunedJudge {
  readonly result: PackEval.TuneJudge.TuneJudgeResult
  readonly asked: number
  readonly texts: ReadonlyArray<string>
  readonly card: string
}

Feature('Tuning the contradiction judge on dev pairs')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'Only the dev pairs reach the judge while the train examples ride along inside their requests',
      Gherkin.Do.pipe(
        Given('a greenhouse pack with train, dev, and test pairs and the judge answering Pass')(
          'world',
          () =>
            tuneJudgeWorld({
              pairs: filterPairs,
              replies: [
                verdictReply({ verdict: 'Pass', critique: 'The trellis work leaves both vent rules satisfied.' }),
                verdictReply({ verdict: 'Pass', critique: 'The harvest work leaves both vent rules satisfied.' }),
              ],
            }),
        ),
        When('the judge is tuned over the dev pairs')(
          'tuned',
          (scope: { readonly world: TuneJudgeWorld }) =>
            Effect.gen(function*() {
              const result: PackEval.TuneJudge.TuneJudgeResult = yield* PackEval.TuneJudge.run.run({
                packDirs: [scope.world.packDir],
                datasetDir: scope.world.datasetDir,
              }).pipe(Effect.provide(tuneJudgeStack(scope.world)))
              const asked = yield* scope.world.provider.requestCount
              const requests = yield* scope.world.provider.requests
              return {
                result,
                asked,
                texts: requests.map((request) => request.text),
                card: scope.world.lines.join('\n'),
              } satisfies TunedJudge
            }),
        ),
        Then('only the two dev pairs reach the provider')((scope) => {
          expect(scope.tuned.asked).toBe(2)
          expect(scope.tuned.texts[0]).toContain('DEV-A task:')
          expect(scope.tuned.texts[1]).toContain('DEV-B task:')
        }),
        Then('no request mentions the test pair, while every request carries the train examples')((scope) => {
          for (const text of scope.tuned.texts) {
            expect(text).not.toContain('TEST task:')
            expect(text).toContain('TRAIN task:')
            expect(text).toContain(trainCritiqueObserved)
            expect(text).toContain(trainCritiquePlanted)
            expect(text).toContain(plantedBody)
          }
        }),
        Then('the card shows full pass recall and a dash for the empty failure recall')((scope) => {
          expect(scope.tuned.result.tpr).toBe(1)
          expect(scope.tuned.result.tnr).toBe('-')
          expect(scope.tuned.result.disagreements).toEqual([])
          expect(scope.tuned.card).toContain('TPR (judge Pass on label Pass): 100.0% (2/2)')
          expect(scope.tuned.card).toContain('TNR (judge Fail on label Fail): -')
        }),
      ),
    )

    scenario(
      'Two disagreements list the false Pass first and the printed recalls match the scripted answers',
      Gherkin.Do.pipe(
        Given('dev pairs the scripted judge misses once on each side')(
          'world',
          () =>
            tuneJudgeWorld({
              pairs: ratesPairs,
              replies: [
                verdictReply({
                  verdict: 'Fail',
                  critique: 'Hourly venting opens the vents the sealed rule keeps shut.',
                }),
                verdictReply({ verdict: 'Pass', critique: 'The harvest fits the trellis rule, so both rules hold.' }),
                verdictReply({ verdict: 'Fail', critique: 'Mulching leaves the vents untouched, so both rules hold.' }),
                verdictReply({ verdict: 'Pass', critique: 'The compost work never touches the vents.' }),
              ],
            }),
        ),
        When('the judge is tuned over the dev pairs')(
          'tuned',
          (scope: { readonly world: TuneJudgeWorld }) =>
            Effect.gen(function*() {
              const result: PackEval.TuneJudge.TuneJudgeResult = yield* PackEval.TuneJudge.run.run({
                packDirs: [scope.world.packDir],
                datasetDir: scope.world.datasetDir,
              }).pipe(Effect.provide(tuneJudgeStack(scope.world)))
              const asked = yield* scope.world.provider.requestCount
              const requests = yield* scope.world.provider.requests
              return {
                result,
                asked,
                texts: requests.map((request) => request.text),
                card: scope.world.lines.join('\n'),
              } satisfies TunedJudge
            }),
        ),
        Then('the disagreement listing leads with the false Pass and names both critiques')((scope) => {
          expect(scope.tuned.result.tpr).toBe(0.5)
          expect(scope.tuned.result.tnr).toBe(0.5)
          expect(scope.tuned.result.disagreements.map((row) => row.id)).toEqual([
            'pair-dev-harvest',
            'pair-dev-trellis',
          ])
          const [first, second] = scope.tuned.result.disagreements
          expect(first).toMatchObject({
            id: 'pair-dev-harvest',
            taskId: 'task-dev-harvest',
            labelVerdict: 'Fail',
            judgeVerdict: 'Pass',
          })
          expect(first?.critique).toContain('trellis rule')
          expect(second?.critique).toContain('Hourly venting')
        }),
        Then('the printed recalls and the disagreement order match the scripted answers')((scope) => {
          expect(scope.tuned.card).toContain('TPR (judge Pass on label Pass): 50.0% (1/2)')
          expect(scope.tuned.card).toContain('TNR (judge Fail on label Fail): 50.0% (1/2)')
          expect(scope.tuned.card).toContain('Hourly venting opens the vents the sealed rule keeps shut.')
          expect(scope.tuned.card).toContain('The harvest fits the trellis rule, so both rules hold.')
          expect(scope.tuned.card.indexOf('pair-dev-harvest')).toBeLessThan(
            scope.tuned.card.indexOf('pair-dev-trellis'),
          )
        }),
      ),
    )
  })
