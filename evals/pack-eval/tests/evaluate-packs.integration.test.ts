import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Schema } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import { expect } from 'vitest'
import {
  cardPairLine,
  contradictionRequest,
  contradictionTasks,
  type ContradictionWorld,
  contradictionWorld,
  type EvaluateWorld,
  evaluateWorld,
  evaluationRequest,
  evaluationStack,
  expectedCounts,
  expectedVerdict,
  failCritiqueText,
  judgeServedModel,
  judgeStackOf,
  observedBluntedPlan,
  observedSharpPlan,
  plantedPartialPlan,
  servedModel,
} from './__fixtures__/evaluate-pack.fixture.js'
import { openRouterLoopback } from './__fixtures__/openrouter-loopback.fixture.js'

const Feature = makeFeature({ it, layer })

interface ContradictionRequestShape {
  readonly packDirs: ReadonlyArray<string>
  readonly datasetDir: string
  readonly reportPath: string
  readonly selectorModel: string
  readonly provider: string
  readonly seed: number
  readonly iterations: number
  readonly confidence: number
  readonly evidenceFloor: PackEval.EvidenceFloor
  readonly judgeModel: string | undefined
  readonly judgeMinimum: number
}

interface ContradictionCell {
  readonly run: (
    input: ContradictionRequestShape,
  ) => Effect.Effect<
    number,
    PackEval.DatasetFileRefusal,
    FileSystem.FileSystem | Path.Path | PackEval.RuleSelector
  >
}

const contradictionCell: ContradictionCell = PackEval.EvaluatePacks.run

const judgedOnce = (
  world: ContradictionWorld,
  overrides?: { readonly judgeModel?: string | undefined; readonly judgeMinimum?: number | undefined },
) =>
  Effect.gen(function*() {
    const lines: Array<string> = []
    const exitCode = yield* contradictionCell.run(contradictionRequest({ world, ...overrides })).pipe(
      Effect.provide(judgeStackOf({ world, lines })),
    )
    const report = yield* PackEval.DatasetFiles.readJson(world.reportPath, PackEval.EvalReport)
    const providerCalls = yield* world.provider.requestCount
    const judgeCalls = providerCalls - contradictionTasks.length
    return { exitCode, report, judgeCalls, card: lines.join('\n') }
  })

interface EvaluateCell {
  readonly run: (
    input: ContradictionRequestShape,
  ) => Effect.Effect<
    number,
    PackEval.DatasetFileRefusal,
    FileSystem.FileSystem | Path.Path | PackEval.RuleSelector
  >
}

const evaluateCell: EvaluateCell = PackEval.EvaluatePacks.run

const evaluateOnce = (world: EvaluateWorld) =>
  evaluateCell.run({
    ...evaluationRequest(world),
    judgeModel: undefined,
    judgeMinimum: 0.8,
  }).pipe(Effect.provide(evaluationStack(world)))

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

Feature('Failing the run on a witnessed contradiction')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenario }) => {
    scenario(
      'Two clashing rules the harvest needs together fail the run with the pair, the task, and the critique',
      Gherkin.Do.pipe(
        Given('the greenhouse pack, nine labelled tasks, and a judge answering Fail on the clashing pair')(
          'world',
          () => contradictionWorld(observedSharpPlan),
        ),
        When('the packs are evaluated')('outcome', (s) => judgedOnce(s.world)),
        Then('the run fails with the pair, the task, and the critique on the card')((s) => {
          expect(s.outcome.exitCode).toBe(1)
          expect(s.outcome.judgeCalls).toBe(s.world.judgeCalls)
          expect(s.outcome.card).toContain(cardPairLine)
          expect(s.outcome.card).toContain('task-fail-1')
          expect(s.outcome.card).toContain(failCritiqueText('task-fail-1'))
        }),
      ),
    )
    scenario(
      'A judge below the bar stays advisory, and the run stays clean',
      Gherkin.Do.pipe(
        Given('the greenhouse pack, nine labelled tasks, and a judge missing two clashes')(
          'world',
          () => contradictionWorld(observedBluntedPlan),
        ),
        When('the packs are evaluated')('outcome', (s) => judgedOnce(s.world)),
        Then('the run stays clean, the judge is marked unvalidated, and its verdicts are advisory')((s) => {
          expect(s.outcome.exitCode).toBe(0)
          expect(s.outcome.judgeCalls).toBe(s.world.judgeCalls)
          expect(s.outcome.card).toContain('judge: unvalidated (advisory)')
          expect(s.outcome.card).toContain('TNR short of the 0.8 minimum')
        }),
      ),
    )

    scenario(
      'A pair no task needs together is listed but never asked',
      Gherkin.Do.pipe(
        Given('the greenhouse pack, nine labelled tasks, and two rules no task needs together')(
          'world',
          () => contradictionWorld(observedSharpPlan),
        ),
        When('the packs are evaluated')('outcome', (s) => judgedOnce(s.world)),
        Then('the pair is listed as unwitnessed, and the listener hears no question for it')((s) => {
          expect(s.outcome.judgeCalls).toBe(s.world.judgeCalls)
          expect(s.outcome.card).toContain('unwitnessed pairs: greenhouse prune-everything × seed-labelling')
        }),
      ),
    )

    scenario(
      'A validated judge with a clean run reports the corrected rate and its interval',
      Gherkin.Do.pipe(
        Given('the greenhouse pack, nine labelled tasks, and a judge clearing every real pair')(
          'world',
          () => contradictionWorld(plantedPartialPlan),
        ),
        When('the packs are evaluated')('outcome', (s) => judgedOnce(s.world)),
        Then('the run stays clean with the corrected rate and its interval on the card')((s) => {
          expect(s.outcome.exitCode).toBe(0)
          expect(s.outcome.judgeCalls).toBe(s.world.judgeCalls)
          expect(s.outcome.card).toContain(`judge model (served): ${judgeServedModel}`)
          expect(s.outcome.card).toContain('corrected contradiction rate (greenhouse): 0.0% [0.0%, 0.0%]')
        }),
      ),
    )
  })
