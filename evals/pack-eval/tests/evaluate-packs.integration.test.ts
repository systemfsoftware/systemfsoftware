import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Layer, Redacted, Schema } from 'effect'
import { expect } from 'vitest'
import { openRouterLoopback, type RequestKeyRecord } from './__fixtures__/openrouter-loopback.fixture.js'
import {
  type BootstrapIntervalAnchor,
  bootstrapIntervalAnchor,
  type InsufficientEvidenceAnchor,
  insufficientEvidenceAnchor,
  type ScoredRuleAnchor,
  scoredRuleAnchor,
  type ValidatedJudgeAnchor,
  validatedJudgeAnchor,
} from './__fixtures__/pack-eval-anchors.fixture.js'
import {
  materialize,
  materializedIterations,
  materializedSeed,
  type MaterializedWorld,
} from './__fixtures__/pack-eval-disk.fixture.js'
import {
  defaultEvidenceFloor,
  oracleCorrectedRate,
  oracleJudgeValidity,
  type OracleQuestions,
  oracleQuestions,
  oracleRoutingCounts,
  oracleRuleVerdicts,
  oracleRunOutcome,
  oracleWitnessedPairs,
} from './__fixtures__/pack-eval-oracle.fixture.js'
import {
  evaluateWorld,
  servedJudgeModel,
  stemPairsOf,
  withLabelNamingMissingRule,
  withMalformedRule,
  withoutJudgePrompt,
  withProviderRefusal,
  withRenamedRule,
  withUnwitnessedPair,
  type World,
  type WorldJudgeReply,
} from './__fixtures__/pack-eval-world.fixture.js'
import { recordingConsoleOf } from './__fixtures__/recording-console.fixture.js'

const Feature = makeFeature({ it, layer })

const stackOf = (materialized: MaterializedWorld, lines: Array<string>) => {
  const recordingConsole = recordingConsoleOf(lines)
  const selectorModel = materialized.request.selectorModel
  const judgeModel = materialized.request.judgeModel ?? selectorModel
  return Layer.provideMerge(
    Layer.merge(
      Layer.provideMerge(
        Layer.provideMerge(
          PackEval.OpenRouterRuleSelector.layer({ model: selectorModel }),
          PackEval.FileAnswerCache.layer({ cacheDir: materialized.cacheDir }),
        ),
        OpenRouterLanguageModel.layer({ model: selectorModel }),
      ),
      Layer.provideMerge(
        Layer.provideMerge(
          PackEval.OpenRouterContradictionJudge.layer({ model: judgeModel }),
          PackEval.FileAnswerCache.layer({ cacheDir: materialized.cacheDir }),
        ),
        OpenRouterLanguageModel.layer({ model: judgeModel }),
      ),
    ),
    Layer.mergeAll(
      OpenRouterClient.layer({ apiUrl: materialized.provider.apiUrl, apiKey: Redacted.make('sk-loopback') }),
      Layer.succeed(Console.Console, recordingConsole),
    ),
  )
}

const evaluatedOnce = (materialized: MaterializedWorld, row: OutlineRow) =>
  Effect.gen(function*() {
    const lines: Array<string> = []
    const exitCode = yield* PackEval.EvaluatePacks.run.run({
      ...materialized.request,
      seed: row.seed,
      iterations: row.iterations,
    }).pipe(Effect.provide(stackOf(materialized, lines)))
    const report = yield* PackEval.DatasetFiles.readJson(materialized.reportPath, PackEval.EvalReport)
    const keys = yield* materialized.provider.requestKeys
    return { exitCode, report, keys, card: lines.join('\n') }
  })

const keyTextOf = (outcome: string, role: string, contains: ReadonlyArray<string>): string =>
  [outcome, role, ...[...contains].toSorted()].join('|')

const recordedKeysOf = (keys: ReadonlyArray<RequestKeyRecord>): ReadonlyArray<string> =>
  keys.flatMap((key) => key.key === undefined ? [] : [keyTextOf(key.outcome, key.key.role, key.key.contains)])
    .toSorted()

const taskTextOf = (world: World, taskId: string): string => world.tasks.find((task) => task.id === taskId)?.text ?? ''

const oracleOptionsOf = () => ({ evidenceFloor: defaultEvidenceFloor })
const verifyRun = (exitCode: number, report: PackEval.EvalReport, card: string, world: World): void => {
  const expected = oracleRunOutcome(world, oracleOptionsOf())
  expect(exitCode).toBe(expected.exitCode)
  expect(report.outcome).toBe(expected.exitCode)
  if (expected.outcome === 'refused') {
    const refusal = report.refusal ?? ''
    expect(report.refusal).toBeDefined()
    expect(card).toContain(refusal)
    const malformed = world.packs.flatMap((pack) => pack.rules).filter((rule) => rule.malformed === true)
    for (const rule of malformed) {
      expect(card).toContain(rule.stem)
    }
    const refusedRoles = world.answers.selector.flatMap((reply) => reply.kind === 'refused' ? [reply.packId] : [])
    if (refusedRoles.length > 0) {
      expect(card).toContain('selector')
    }
  }
}

const verdictTagOf = (verdict: PackEval.RuleVerdict): string =>
  Schema.is(PackEval.RuleScored)(verdict)
    ? 'scored'
    : Schema.is(PackEval.RuleInsufficientEvidence)(verdict)
    ? 'insufficient-evidence'
    : 'unlabelled'

const oracleRoutesOf = (world: World) => {
  const counts = oracleRoutingCounts(world)
  return oracleRuleVerdicts(world, oracleOptionsOf()).map((verdict) => {
    const row = counts.find((entry) =>
      entry.packId === verdict.packId && entry.rule === verdict.rule && entry.split === verdict.split
    )
    return {
      packId: verdict.packId,
      rule: verdict.rule,
      split: verdict.split,
      tp: row?.tp ?? 0,
      fn: row?.fn ?? 0,
      fp: row?.fp ?? 0,
      tn: row?.tn ?? 0,
      tag: verdict.tag,
    }
  })
}

const verifyRoutes = (report: PackEval.EvalReport, world: World): void => {
  if (oracleRunOutcome(world, oracleOptionsOf()).outcome === 'refused') return
  expect(
    report.rules.map((route) => ({
      packId: route.packId,
      rule: route.stem,
      split: route.split,
      tp: route.counts.truePositives,
      fn: route.counts.falseNegatives,
      fp: route.counts.falsePositives,
      tn: route.counts.trueNegatives,
      tag: verdictTagOf(route.verdict),
    })),
  ).toEqual(oracleRoutesOf(world))
}

const verifyHandRoutes = (report: PackEval.EvalReport, hand: OutlineHand | undefined): void => {
  if (hand === undefined || 'correctedRate' in hand || 'lower' in hand) return
  const route = report.rules.find((row) =>
    row.packId === hand.packId && row.stem === hand.rule && row.split === hand.split
  )
  expect(route?.counts).toMatchObject({
    truePositives: hand.tp,
    falseNegatives: hand.fn,
    falsePositives: hand.fp,
    trueNegatives: hand.tn,
  })
  const expectedTag = 'verdictTag' in hand ? hand.verdictTag : 'scored'
  expect(route === undefined ? undefined : verdictTagOf(route.verdict)).toBe(expectedTag)
  if ('tpr' in hand) {
    expect(route?.verdict).toMatchObject({ rates: { tpr: hand.tpr, tnr: hand.tnr } })
  }
}
const oracleKeysOf = (world: World, questions: OracleQuestions): ReadonlyArray<string> =>
  [
    ...questions.selector.map((question) =>
      keyTextOf('matched', 'selector', [taskTextOf(world, question.taskId), question.packId])
    ),
    ...questions.judge.map((question) =>
      keyTextOf('matched', 'judge', [taskTextOf(world, question.taskId), question.ruleA, question.ruleB])
    ),
  ].toSorted()

const verifyQuestions = (keys: ReadonlyArray<RequestKeyRecord>, world: World): void => {
  expect(recordedKeysOf(keys)).toEqual(oracleKeysOf(world, oracleQuestions(world, oracleOptionsOf())))
}

const judgedOf = (report: PackEval.EvalReport) =>
  Schema.is(PackEval.ContradictionJudged)(report.contradiction) ? report.contradiction : undefined

const packOf = (world: World): string => world.packs.flatMap((pack) => [pack.id])[0] ?? ''

const rateOf = (report: PackEval.EvalReport, world: World) =>
  judgedOf(report)?.rates.find((rate) => rate.packId === packOf(world))

const verifyJudge = (report: PackEval.EvalReport, card: string, world: World): void => {
  const validity = oracleJudgeValidity(world, oracleOptionsOf())
  const judge = judgedOf(report)?.judge
  if (validity.tag === 'validated') {
    expect(judge).toMatchObject({ _tag: 'JudgeValidityValidated', tpr: validity.tpr, tnr: validity.tnr })
    const corrected = oracleCorrectedRate(world, oracleOptionsOf())
    if (corrected.tag === 'reported') {
      expect(rateOf(report, world)?.estimate).toBe(corrected.rate)
    }
    return
  }
  if (validity.tag === 'unvalidated') {
    expect(judge).toMatchObject({ _tag: 'JudgeValidityUnvalidated', tpr: validity.tpr, tnr: validity.tnr })
    return
  }
  if (validity.tag === 'refused') {
    expect(report.outcome).toBe(0)
    expect(judgedOf(report)?.judge._tag).toBe('JudgeValidityUnavailable')
    expect(judgedOf(report)?.rates ?? []).toEqual([])
    expect(card).toContain('judge: validity refused')
    return
  }
}

const verifyHandJudgement = (report: PackEval.EvalReport, hand: OutlineHand | undefined): void => {
  if (hand === undefined || 'tp' in hand) return
  if ('correctedRate' in hand) {
    expect(report.outcome).toBe(hand.exitCode)
    expect(rateOf(report, hand.world)?.estimate).toBe(hand.correctedRate)
    expect(judgedOf(report)?.judge).toMatchObject({
      _tag: 'JudgeValidityValidated',
      tpr: hand.tpr,
      tnr: hand.tnr,
    })
  }
  if ('lower' in hand) {
    const rate = rateOf(report, hand.world)
    expect(rate?.lower).toBe(hand.lower)
    expect(rate?.upper).toBe(hand.upper)
    if (rate !== undefined) {
      expect(rate.lower).toBeGreaterThanOrEqual(0)
      expect(rate.upper).toBeLessThanOrEqual(1)
      expect(rate.lower).toBeLessThanOrEqual(rate.estimate)
      expect(rate.upper).toBeGreaterThanOrEqual(rate.estimate)
    }
  }
}

const verifyCard = (report: PackEval.EvalReport, card: string, world: World): void => {
  for (const failure of judgedOf(report)?.failures ?? []) {
    expect(card).toContain(failure.ruleA)
    expect(card).toContain(failure.ruleB)
    expect(card).toContain(failure.taskId)
    expect(card).toContain(failure.critique)
  }
  const witnessed: Record<string, true> = {}
  for (const pair of oracleWitnessedPairs(world)) {
    witnessed[`${pair.packId}${pair.ruleA}${pair.ruleB}`] = true
  }
  for (const pack of world.packs) {
    for (const [ruleA, ruleB] of stemPairsOf(pack)) {
      if (witnessed[`${pack.id}${ruleA}${ruleB}`] !== true) {
        expect(card).toContain(`${ruleA} × ${ruleB}`)
      }
    }
  }
}

const disagreeingJudgeWorld = (): World => {
  const base = evaluateWorld()
  const judge: ReadonlyArray<WorldJudgeReply> = base.pairLabels
    .filter((label) => label.split === 'test')
    .map((label) => ({
      kind: 'judged',
      question: {
        packId: label.packId,
        taskId: label.taskId,
        ruleA: label.ruleA,
        ruleB: label.ruleB,
        plantedBody: label.plantedBody,
      },
      verdict: 'Pass',
      critique: label.notes,
      servedModel: servedJudgeModel,
    }))
  return { ...base, answers: { ...base.answers, judge } }
}

type OutlineHand =
  | ScoredRuleAnchor
  | InsufficientEvidenceAnchor
  | ValidatedJudgeAnchor
  | BootstrapIntervalAnchor

interface OutlineRow extends Record<string, string | number | World | OutlineHand | undefined> {
  readonly name: string
  readonly world: World
  readonly seed: number
  readonly iterations: number
  readonly hand: OutlineHand | undefined
}

const routingRows: ReadonlyArray<OutlineRow> = [
  {
    name: 'a complete set of owner labels',
    world: scoredRuleAnchor.world,
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: scoredRuleAnchor,
  },
  {
    name: 'labels too thin to score the rule',
    world: insufficientEvidenceAnchor.world,
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: insufficientEvidenceAnchor,
  },
  {
    name: 'a rule renamed away from its labels',
    world: withRenamedRule(evaluateWorld(), {}),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
  {
    name: 'a rule file that cannot be read',
    world: withMalformedRule(evaluateWorld(), {}),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
  {
    name: 'a label naming a rule the pack no longer holds',
    world: withLabelNamingMissingRule(evaluateWorld(), {}),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
  {
    name: 'a provider that refuses to answer',
    world: withProviderRefusal(evaluateWorld(), {}),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
  {
    name: 'pair labels with no judge prompt',
    world: withoutJudgePrompt(evaluateWorld()),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
  {
    name: 'a pair no task needs together',
    world: withUnwitnessedPair(evaluateWorld()),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
]

const contradictionRows: ReadonlyArray<OutlineRow> = [
  {
    name: 'a judge that fails a pair two tasks need',
    world: validatedJudgeAnchor.world,
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: validatedJudgeAnchor,
  },
  {
    name: 'a judge that misses a clash',
    world: disagreeingJudgeWorld(),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
  {
    name: 'a witnessed pair beside an unwitnessed one',
    world: evaluateWorld(),
    seed: materializedSeed,
    iterations: materializedIterations,
    hand: undefined,
  },
  {
    name: 'a judge scored at a fixed seed',
    world: bootstrapIntervalAnchor.world,
    seed: bootstrapIntervalAnchor.seed,
    iterations: bootstrapIntervalAnchor.iterations,
    hand: bootstrapIntervalAnchor,
  },
]

Feature('Evaluating a pack against its owner labels')
  .withScenarioLayer(openRouterLoopback)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Evaluating a pack holding <name> follows the evaluation method',
      routingRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('the pack, its tasks, its labels, and the scripted answers are written to fresh folders')(
            'materialized',
            () => materialize(row.world),
          ),
          When('the owner evaluates the pack')('outcome', (s) => evaluatedOnce(s.materialized, row)),
          Then('the run ends as the evaluation method says')((s) =>
            verifyRun(s.outcome.exitCode, s.outcome.report, s.outcome.card, row.world)
          ),
          Then('the reported routing matches the method and the figures worked out by hand')((s) => {
            verifyRoutes(s.outcome.report, row.world)
            verifyHandRoutes(s.outcome.report, row.hand)
          }),
          Then('every question that reached the provider is one the method names')((s) =>
            verifyQuestions(s.outcome.keys, row.world)
          ),
        ),
    )

    scenarioOutline(
      'Judging a pack holding <name> for contradictions its tasks need together',
      contradictionRows,
      (row) =>
        Gherkin.Do.pipe(
          Given('the pack, its tasks, its labels, and the scripted answers are written to fresh folders')(
            'materialized',
            () => materialize(row.world),
          ),
          When('the owner evaluates the pack')('outcome', (s) => evaluatedOnce(s.materialized, row)),
          Then('the run ends as the evaluation method says')((s) =>
            verifyRun(s.outcome.exitCode, s.outcome.report, s.outcome.card, row.world)
          ),
          Then('the judge verdict, its rate, and the named failures match the method and the hand figures')((s) => {
            verifyJudge(s.outcome.report, s.outcome.card, row.world)
            verifyCard(s.outcome.report, s.outcome.card, row.world)
            verifyHandJudgement(s.outcome.report, row.hand)
          }),
          Then('every question that reached the provider is one the method names')((s) =>
            verifyQuestions(s.outcome.keys, row.world)
          ),
        ),
    )
  })
