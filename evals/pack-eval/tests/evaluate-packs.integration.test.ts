import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Schema } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import { expect } from 'vitest'
import {
  type EvaluateWorld,
  evaluateWorld,
  evaluationRequest,
  evaluationStack,
  expectedCounts,
  expectedVerdict,
  servedModel,
} from './__fixtures__/evaluate-pack.fixture.js'
import { openRouterLoopback } from './__fixtures__/openrouter-loopback.fixture.js'

const Feature = makeFeature({ it, layer })

interface EvaluateCell {
  readonly run: (
    input: ReturnType<typeof evaluationRequest>,
  ) => Effect.Effect<number, PackEval.DatasetFileRefusal, FileSystem.FileSystem | Path.Path | PackEval.RuleSelector>
}

const evaluateCell: EvaluateCell = PackEval.EvaluatePacks.run

const evaluateOnce = (world: EvaluateWorld) =>
  evaluateCell.run(evaluationRequest(world)).pipe(Effect.provide(evaluationStack(world)))

const splitOf = (key: string): string => key.split('/')[1] ?? ''

const stemOf = (key: string): string => key.split('/')[0] ?? ''

const rowOf = (report: PackEval.EvalReport, stem: string, split: string): PackEval.RuleRoute | undefined =>
  report.rules.find((row) => row.stem === stem && row.split === split)

const isScored = Schema.is(PackEval.RuleScored)
const isInsufficient = Schema.is(PackEval.RuleInsufficientEvidence)
const isUnlabelled = Schema.is(PackEval.RuleUnlabelled)
const isNotEvaluated = Schema.is(PackEval.ContradictionNotEvaluated)

Feature('Scoring rule routing against owner labels')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'A typo the broad rule still loads counts against that rule, and the run stays clean',
      Gherkin.Do.pipe(
        Given('a greenhouse pack, five labelled tasks, and scripted selector answers that leak the broad rule')(
          'world',
          () => evaluateWorld({}),
        ),
        When('the packs are evaluated')('outcome', (s) =>
          Effect.gen(function*() {
            const exitCode = yield* evaluateOnce(s.world)
            const report = yield* PackEval.DatasetFiles.readJson(s.world.reportPath, PackEval.EvalReport)
            const asked = yield* s.world.provider.requestCount
            return { exitCode, report, asked }
          })),
        Then('the run exits clean, the provider answered every task, and the report names the seed and model')((s) => {
          expect(s.outcome.exitCode).toBe(0)
          expect(s.outcome.asked).toBe(5)
          expect(s.outcome.report.seed).toBe(7)
          expect(s.outcome.report.servedSelectorModel).toBe(servedModel)
          expect(s.outcome.report.provider).toBe('openrouter')
        }),
        Then('the leak shows as a false positive on the broad rule, and contradiction waits for labels')((s) => {
          const devPrune = rowOf(s.outcome.report, 'prune-everything', 'dev')
          expect(devPrune?.counts.falsePositives).toBe(1)
          expect(devPrune?.counts.trueNegatives).toBe(1)
          expect(isNotEvaluated(s.outcome.report.contradiction)).toBe(true)
          const testWater = rowOf(s.outcome.report, 'watering-schedule', 'test')
          expect(isScored(testWater?.verdict)).toBe(true)
          if (testWater !== undefined && isScored(testWater.verdict)) {
            expect(testWater.verdict.rates.tpr).toBe(1)
            expect(testWater.verdict.rates.tnr).toBe(1)
          }
        }),
      ),
    )

    scenario(
      'A task carrying the rule it should sees that rule counted where it belongs',
      Gherkin.Do.pipe(
        Given('the same greenhouse pack, tasks, and scripted selector answers')(
          'world',
          () => evaluateWorld({}),
        ),
        When('the packs are evaluated')('outcome', (s) =>
          Effect.gen(function*() {
            const exitCode = yield* evaluateOnce(s.world)
            const report = yield* PackEval.DatasetFiles.readJson(s.world.reportPath, PackEval.EvalReport)
            return { exitCode, report }
          })),
        Then('every rule and split row matches the hand-written counts and verdicts')((s) => {
          expect(s.outcome.exitCode).toBe(0)
          for (const key of Object.keys(expectedCounts)) {
            const expected = expectedCounts[key]
            const row = rowOf(s.outcome.report, stemOf(key), splitOf(key))
            expect(row?.counts.truePositives).toBe(expected?.tp)
            expect(row?.counts.falseNegatives).toBe(expected?.fn)
            expect(row?.counts.falsePositives).toBe(expected?.fp)
            expect(row?.counts.trueNegatives).toBe(expected?.tn)
            const verdict = expectedVerdict[key]
            const matches = verdict === 'RuleScored'
              ? isScored(row?.verdict)
              : verdict === 'RuleInsufficientEvidence'
              ? isInsufficient(row?.verdict)
              : isUnlabelled(row?.verdict)
            expect(matches).toBe(true)
          }
        }),
        Then('the broad rule on the test split scores perfect recall with no true negatives')((s) => {
          const row = rowOf(s.outcome.report, 'prune-everything', 'test')
          expect(isScored(row?.verdict)).toBe(true)
          if (row !== undefined && isScored(row.verdict)) {
            expect(row.verdict.rates.tpr).toBe(1)
            expect(row.verdict.rates.tnr).toBe(0)
          }
        }),
      ),
    )

    scenario(
      'Labels naming a rule the pack no longer holds stop the run before the provider is asked',
      Gherkin.Do.pipe(
        Given('the greenhouse pack with the pruning file renamed, while the labels still name it')(
          'world',
          () => evaluateWorld({ renamedRule: true }),
        ),
        When('the packs are evaluated')('outcome', (s) =>
          Effect.gen(function*() {
            const exitCode = yield* evaluateOnce(s.world)
            const report = yield* PackEval.DatasetFiles.readJson(s.world.reportPath, PackEval.EvalReport)
            const asked = yield* s.world.provider.requestCount
            return { exitCode, report, asked }
          })),
        Then('the run is refused naming each task that labels the rule, and the provider was never asked')((s) => {
          expect(s.outcome.exitCode).toBe(2)
          expect(s.outcome.asked).toBe(0)
          expect(s.outcome.report.refusal).toContain('task-transplant names prune-everything')
          expect(s.outcome.report.refusal).toContain('task-vent names prune-everything')
        }),
      ),
    )

    scenario(
      'A rule file the pack cannot read stops the run and names the file',
      Gherkin.Do.pipe(
        Given('the greenhouse pack with one rule file missing its frontmatter')(
          'world',
          () => evaluateWorld({ malformedRule: true }),
        ),
        When('the packs are evaluated')('outcome', (s) =>
          Effect.gen(function*() {
            const exitCode = yield* evaluateOnce(s.world)
            const report = yield* PackEval.DatasetFiles.readJson(s.world.reportPath, PackEval.EvalReport)
            const asked = yield* s.world.provider.requestCount
            return { exitCode, report, asked }
          })),
        Then('the run is refused naming the file, and the provider was never asked')((s) => {
          expect(s.outcome.exitCode).toBe(2)
          expect(s.outcome.asked).toBe(0)
          expect(s.outcome.report.refusal).toContain('prune-everything.md')
        }),
      ),
    )
  })
