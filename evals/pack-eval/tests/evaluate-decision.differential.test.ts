import { Differential, Metamorphic } from '@systemfsoftware/differential-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect, Match, Schema } from 'effect'
import * as fc from 'fast-check'
import {
  insufficientEvidenceAnchor,
  scoredRuleAnchor,
  validatedJudgeAnchor,
} from './__fixtures__/pack-eval-anchors.fixture.js'
import {
  type InMemoryRun,
  type JudgeQuestion,
  runInMemory,
  type SelectorQuestion,
} from './__fixtures__/pack-eval-memory.fixture.js'
import {
  oracleCorrectedRates,
  oracleJudgeValidity,
  oraclePointEstimates,
  oracleQuestions,
  oracleRoutingCounts,
  oracleRuleVerdicts,
  oracleRunOutcome,
} from './__fixtures__/pack-eval-oracle.fixture.js'
import { worldArbitrary } from './__fixtures__/pack-eval-world-arbitrary.fixture.js'
import {
  ascendingOf,
  distinctSorted,
  hasDistinctMatchableStrings,
  keyOf,
  stemPairsOf,
  witnessedPairsOf,
  type World,
} from './__fixtures__/pack-eval-world.fixture.js'

/**
 * Decision-level proof of the evaluate command against the reference oracle.
 *
 * Every check runs the real `PackEval.EvaluatePacks` cell in-process on a
 * generated world through `runInMemory` (in-memory filesystem plus scripted
 * `RuleSelector` and `ContradictionJudge` port doubles), and compares what the
 * cell did with what the oracle derives from the same world. No assertion
 * holds a hand-written expected value except on an anchor row, and the
 * oracle's anchor values are never bent to match the product.
 *
 * All checks go through `Differential.compare` / `Metamorphic.on` only, each
 * with an explicit `runBudget` and `interruptAfterTimeLimit` sized so the
 * whole file stays near ten seconds.
 */

const sameKeysOf = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const selectorKeyOf = (question: SelectorQuestion): string => keyOf(question.taskId, question.packId)

const judgeKeyOf = (question: JudgeQuestion): string =>
  keyOf(question.packId, question.taskId, question.ruleA, question.ruleB)

const pairKeyOfJudgeKey = (key: string): string => {
  const [packId, , ruleA, ruleB] = key.split('\u0000')
  return keyOf(packId ?? '', ruleA ?? '', ruleB ?? '')
}

const askedKeysOf = (
  run: InMemoryRun,
): { readonly selector: ReadonlyArray<string>; readonly judge: ReadonlyArray<string> } => ({
  selector: run.selectorQuestions.map(selectorKeyOf).toSorted(ascendingOf),
  judge: distinctSorted(run.judgeQuestions.map(judgeKeyOf)),
})

const unwitnessedPairKeysOf = (world: World): ReadonlyArray<string> => {
  const witnessed = new Set(
    witnessedPairsOf(world).map((pair) => keyOf(pair.packId, pair.ruleA, pair.ruleB)),
  )
  return distinctSorted(
    world.packs.flatMap((pack) =>
      stemPairsOf(pack)
        .filter(([ruleA, ruleB]) => witnessed.has(keyOf(pack.id, ruleA, ruleB)) === false)
        .map(([ruleA, ruleB]) => keyOf(pack.id, ruleA, ruleB))
    ),
  )
}

const judgedOf = (world: World): boolean =>
  oracleRunOutcome(world, {}).outcome !== 'refused' && world.pairLabels.length > 0

// ---------------------------------------------------------------------------
// Questions (AE4/R20): the selector is asked once per task and pack, the judge
// only for the oracle's validity and witness targets, and no judge question
// ever names a pair no labelled task needs together.
// ---------------------------------------------------------------------------

interface OracleQuestionView {
  readonly selectorKeys: ReadonlyArray<string>
  readonly judgeKeys: ReadonlyArray<string>
  readonly unwitnessedPairKeys: ReadonlyArray<string>
}

const oracleQuestionViewOf = (world: World): OracleQuestionView => {
  const questions = oracleQuestions(world, {})
  return {
    selectorKeys: distinctSorted(
      questions.selector.map((question) => keyOf(question.taskId, question.packId)),
    ),
    judgeKeys: distinctSorted(
      questions.judge.map((question) => keyOf(question.packId, question.taskId, question.ruleA, question.ruleB)),
    ),
    unwitnessedPairKeys: unwitnessedPairKeysOf(world),
  }
}

Differential.compare({
  reference: (world: World) => Effect.succeed(oracleQuestionViewOf(world)),
  candidate: (world: World) => Effect.map(runInMemory(world, {}), askedKeysOf),
})
  .on(worldArbitrary, { runBudget: 40, interruptAfterTimeLimit: 4000 })
  .assert((oracle, asked) =>
    sameKeysOf(oracle.selectorKeys, asked.selector) &&
    sameKeysOf(oracle.judgeKeys, asked.judge) &&
    asked.judge.every((key) => oracle.unwitnessedPairKeys.includes(pairKeyOfJudgeKey(key)) === false)
  )

// ---------------------------------------------------------------------------
// Routing counts and verdicts: every rule and split row matches the oracle's
// counts and verdict tag, including empty rows on refused runs.
// ---------------------------------------------------------------------------

interface RoutingRow {
  readonly key: string
  readonly tp: number
  readonly fn: number
  readonly fp: number
  readonly tn: number
  readonly verdict: string
}

const verdictTagOf = (verdict: PackEval.RuleVerdict): string =>
  Match.value(verdict).pipe(
    Match.tag('RuleScored', () => 'scored'),
    Match.tag('RuleInsufficientEvidence', () => 'insufficient-evidence'),
    Match.tag('RuleUnlabelled', () => 'unlabelled'),
    Match.exhaustive,
  )

const oracleRoutingRowsOf = (world: World): ReadonlyArray<RoutingRow> => {
  if (oracleRunOutcome(world, {}).outcome === 'refused') return []
  const tags = new Map(
    oracleRuleVerdicts(world, {}).map((verdict) =>
      [keyOf(verdict.packId, verdict.rule, verdict.split), verdict.tag] as const
    ),
  )
  return oracleRoutingCounts(world)
    .map((counts): RoutingRow => ({
      key: keyOf(counts.packId, counts.rule, counts.split),
      tp: counts.tp,
      fn: counts.fn,
      fp: counts.fp,
      tn: counts.tn,
      verdict: tags.get(keyOf(counts.packId, counts.rule, counts.split)) ?? 'missing',
    }))
    .toSorted((left, right) => ascendingOf(left.key, right.key))
}

const productRoutingRowsOf = (run: InMemoryRun): ReadonlyArray<RoutingRow> =>
  (run.report?.rules ?? [])
    .map((row): RoutingRow => ({
      key: keyOf(row.packId, row.stem, row.split),
      tp: row.counts.truePositives,
      fn: row.counts.falseNegatives,
      fp: row.counts.falsePositives,
      tn: row.counts.trueNegatives,
      verdict: verdictTagOf(row.verdict),
    }))
    .toSorted((left, right) => ascendingOf(left.key, right.key))

Differential.compare({
  reference: (world: World) => Effect.succeed(oracleRoutingRowsOf(world)),
  candidate: (world: World) => Effect.map(runInMemory(world, {}), productRoutingRowsOf),
})
  .on(worldArbitrary, { runBudget: 40, interruptAfterTimeLimit: 4000 })
  .assert((oracle, product) =>
    oracle.length === product.length &&
    oracle.every((row, index) => {
      const other = product[index]
      return other !== undefined &&
        row.key === other.key &&
        row.tp === other.tp &&
        row.fn === other.fn &&
        row.fp === other.fp &&
        row.tn === other.tn &&
        row.verdict === other.verdict
    })
  )

// ---------------------------------------------------------------------------
// Witnessed and unwitnessed pairs: the report's unwitnessed list is exactly
// the pack stem pairs no routing labels witness together.
// ---------------------------------------------------------------------------

const oracleUnwitnessedOf = (world: World): ReadonlyArray<string> => judgedOf(world) ? unwitnessedPairKeysOf(world) : []

const productUnwitnessedOf = (run: InMemoryRun): ReadonlyArray<string> =>
  Match.value(run.report?.contradiction).pipe(
    Match.when(undefined, () => []),
    Match.tag('ContradictionNotEvaluated', () => []),
    Match.tag('ContradictionJudged', (judged) =>
      distinctSorted(
        judged.unwitnessedPairs.map((pair) => keyOf(pair.packId, pair.ruleA, pair.ruleB)),
      )),
    Match.exhaustive,
  )

Differential.compare({
  reference: (world: World) => Effect.succeed(oracleUnwitnessedOf(world)),
  candidate: (world: World) => Effect.map(runInMemory(world, {}), productUnwitnessedOf),
})
  .on(worldArbitrary, { runBudget: 40, interruptAfterTimeLimit: 4000 })
  .assert((oracle, product) => sameKeysOf(oracle, product))

// ---------------------------------------------------------------------------
// Judge validity: the validated/unvalidated/refused tag and its TPR and TNR
// match the oracle whenever the run judges, and stay unevaluated otherwise.
// ---------------------------------------------------------------------------

interface ValidityView {
  readonly tag: 'validated' | 'unvalidated' | 'refused' | 'not-evaluated'
  readonly tpr: number | undefined
  readonly tnr: number | undefined
}
const validityTagOf = (validity: PackEval.JudgeValidityReport): string =>
  Match.value(validity).pipe(
    Match.tag('JudgeValidityValidated', () => 'validated'),
    Match.tag('JudgeValidityUnvalidated', () => 'unvalidated'),
    Match.tag('JudgeValidityUnavailable', () => 'refused'),
    Match.exhaustive,
  )
const oracleValidityViewOf = (world: World): ValidityView => {
  if (judgedOf(world) === false) return { tag: 'not-evaluated', tpr: undefined, tnr: undefined }
  const validity = oracleJudgeValidity(world, {})
  return {
    tag: validity.tag === 'not-applicable' ? 'not-evaluated' : validity.tag,
    tpr: validity.tpr,
    tnr: validity.tnr,
  }
}

const productValidityViewOf = (run: InMemoryRun): ValidityView =>
  Match.value(run.report?.contradiction).pipe(
    Match.when(undefined, () => ({ tag: 'not-evaluated', tpr: undefined, tnr: undefined } as const)),
    Match.tag('ContradictionNotEvaluated', () => ({ tag: 'not-evaluated', tpr: undefined, tnr: undefined } as const)),
    Match.tag('ContradictionJudged', (judged) =>
      Match.value(judged.judge).pipe(
        Match.tag(
          'JudgeValidityValidated',
          (validated) => ({ tag: 'validated', tpr: validated.tpr, tnr: validated.tnr } as const),
        ),
        Match.tag(
          'JudgeValidityUnvalidated',
          (unvalidated) => ({ tag: 'unvalidated', tpr: unvalidated.tpr, tnr: unvalidated.tnr } as const),
        ),
        Match.tag('JudgeValidityUnavailable', () => ({ tag: 'refused', tpr: undefined, tnr: undefined } as const)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

Differential.compare({
  reference: (world: World) => Effect.succeed(oracleValidityViewOf(world)),
  candidate: (world: World) => Effect.map(runInMemory(world, {}), productValidityViewOf),
})
  .on(worldArbitrary, { runBudget: 40, interruptAfterTimeLimit: 4000 })
  .assert((oracle, product) => oracle.tag === product.tag && oracle.tpr === product.tpr && oracle.tnr === product.tnr)

// ---------------------------------------------------------------------------
// Outcome and exit code: the run's exit code is the oracle's, so refused runs
// exit 2, witnessed contradictions exit 1, and clean runs exit 0.
// ---------------------------------------------------------------------------

Differential.compare({
  reference: (world: World) => Effect.succeed(oracleRunOutcome(world, {}).exitCode),
  candidate: (world: World) => Effect.map(runInMemory(world, {}), (run) => run.exitCode),
})
  .on(worldArbitrary, { runBudget: 40, interruptAfterTimeLimit: 4000 })
  .assert((oracle, product) => oracle === product)

// ---------------------------------------------------------------------------
// Interval containment (KTD5): every reported routing interval lies in [0, 1]
// and contains the oracle's point estimate; the product reports a corrected
// rate for exactly the packs the oracle derives one for, and each pack's
// interval lies in [0, 1] and contains both its own estimate and the oracle's
// value for that pack.
// ---------------------------------------------------------------------------

interface IntervalRow {
  readonly key: string
  readonly tpr: number
  readonly tprLower: number
  readonly tprUpper: number
  readonly tnr: number
  readonly tnrLower: number
  readonly tnrUpper: number
}

interface IntervalCandidate {
  readonly routing: ReadonlyArray<IntervalRow>
  readonly rates: ReadonlyArray<
    { readonly packId: string; readonly estimate: number; readonly lower: number; readonly upper: number }
  >
}

interface IntervalReference {
  readonly points: ReadonlyArray<{ readonly key: string; readonly tpr: number; readonly tnr: number }>
  readonly correctedRates: ReadonlyArray<{ readonly packId: string; readonly rate: number }>
}

const isScored = Schema.is(PackEval.RuleScored)

const intervalCandidateOf = (run: InMemoryRun): IntervalCandidate => ({
  routing: (run.report?.rules ?? []).flatMap((row) =>
    isScored(row.verdict)
      ? [{
        key: keyOf(row.packId, row.stem, row.split),
        tpr: row.verdict.rates.tpr,
        tprLower: row.verdict.rates.tprLower,
        tprUpper: row.verdict.rates.tprUpper,
        tnr: row.verdict.rates.tnr,
        tnrLower: row.verdict.rates.tnrLower,
        tnrUpper: row.verdict.rates.tnrUpper,
      }]
      : []
  ),
  rates: Match.value(run.report?.contradiction).pipe(
    Match.when(undefined, () => []),
    Match.tag('ContradictionNotEvaluated', () => []),
    Match.tag(
      'ContradictionJudged',
      (judged) =>
        judged.rates.map((rate) => ({
          packId: rate.packId,
          estimate: rate.estimate,
          lower: rate.lower,
          upper: rate.upper,
        })),
    ),
    Match.exhaustive,
  ),
})

const intervalReferenceOf = (world: World): IntervalReference => ({
  points: oraclePointEstimates(world, {}).map((point) => ({
    key: keyOf(point.packId, point.rule, point.split),
    tpr: point.tpr,
    tnr: point.tnr,
  })),
  correctedRates: oracleCorrectedRates(world, {}).map((rate) => ({ packId: rate.packId, rate: rate.rate })),
})

const within01 = (values: ReadonlyArray<number>): boolean => values.every((value) => value >= 0 && value <= 1)

Differential.compare({
  reference: (world: World) => Effect.succeed(intervalReferenceOf(world)),
  candidate: (world: World) => Effect.map(runInMemory(world, {}), intervalCandidateOf),
})
  .on(worldArbitrary, { runBudget: 40, interruptAfterTimeLimit: 5000 })
  .assert((oracle, product) =>
    product.routing.length === oracle.points.length &&
    product.routing.every((row) => {
      const point = oracle.points.find((entry) => entry.key === row.key)
      return point !== undefined &&
        within01([row.tprLower, row.tpr, row.tprUpper, row.tnrLower, row.tnr, row.tnrUpper]) &&
        row.tprLower <= point.tpr && point.tpr <= row.tprUpper &&
        row.tnrLower <= point.tnr && point.tnr <= row.tnrUpper
    }) &&
    sameKeysOf(
      product.rates.map((rate) => rate.packId).toSorted(ascendingOf),
      oracle.correctedRates.map((rate) => rate.packId).toSorted(ascendingOf),
    ) &&
    product.rates.every((rate) => {
      const expected = oracle.correctedRates.find((entry) => entry.packId === rate.packId)
      return within01([rate.lower, rate.estimate, rate.upper]) &&
        rate.lower <= rate.estimate && rate.estimate <= rate.upper &&
        expected !== undefined &&
        expected.rate === rate.estimate &&
        rate.lower <= expected.rate && expected.rate <= rate.upper
    })
  )

type CanonicalTree = string | ReadonlyArray<CanonicalTree>

const canonicalCompareOf = (left: CanonicalTree, right: CanonicalTree): number =>
  ascendingOf(JSON.stringify(left), JSON.stringify(right))

const canonicalRowOf = (row: PackEval.RuleRoute): CanonicalTree => [
  row.packId,
  row.stem,
  row.split,
  String(row.counts.truePositives),
  String(row.counts.falseNegatives),
  String(row.counts.falsePositives),
  String(row.counts.trueNegatives),
  verdictTagOf(row.verdict),
  ...(isScored(row.verdict)
    ? [
      String(row.verdict.rates.tpr),
      String(row.verdict.rates.tprLower),
      String(row.verdict.rates.tprUpper),
      String(row.verdict.rates.tnr),
      String(row.verdict.rates.tnrLower),
      String(row.verdict.rates.tnrUpper),
    ]
    : []),
]

const canonicalContradictionOf = (contradiction: PackEval.ContradictionReport): CanonicalTree =>
  Match.value(contradiction).pipe(
    Match.tag('ContradictionNotEvaluated', () => 'not-evaluated'),
    Match.tag('ContradictionJudged', (judged) => [
      validityTagOf(judged.judge),
      judged.servedJudgeModel,
      judged.failures
        .map((failure): CanonicalTree => [
          failure.packId,
          failure.ruleA,
          failure.ruleB,
          failure.taskId,
          failure.critique,
        ])
        .toSorted(canonicalCompareOf),
      judged.unwitnessedPairs
        .map((pair): CanonicalTree => [pair.packId, pair.ruleA, pair.ruleB])
        .toSorted(canonicalCompareOf),
      judged.rates
        .map((rate): CanonicalTree => [rate.packId, String(rate.estimate), String(rate.lower), String(rate.upper)])
        .toSorted(canonicalCompareOf),
    ]),
    Match.exhaustive,
  )

const canonicalReportOf = (report: PackEval.EvalReport): CanonicalTree => [
  String(report.seed),
  String(report.iterations),
  String(report.confidence),
  String(report.provider),
  String(report.servedSelectorModel),
  String(report.outcome),
  String(report.refusal),
  report.rules.map(canonicalRowOf).toSorted(canonicalCompareOf),
  canonicalContradictionOf(report.contradiction),
]

const canonicalOf = (run: InMemoryRun): string =>
  JSON.stringify([
    String(run.exitCode),
    String(run.refusal),
    run.report === undefined ? 'no-report' : canonicalReportOf(run.report),
    askedKeysOf(run).selector,
    askedKeysOf(run).judge,
  ])
Metamorphic.on((world: World) => Effect.map(runInMemory(world, {}), canonicalOf))
  .relation({ transformInput: (world) => world, assertOutput: (first, second) => first === second })
  .on(worldArbitrary, { runBudget: 20, interruptAfterTimeLimit: 4000 })

// ---------------------------------------------------------------------------
// Generator validity (R3): every generated world is admissible or refuses
// with the refusal it was built to hold.
// ---------------------------------------------------------------------------

const refusedRoleOf = (world: World): 'selector' | 'judge' | undefined =>
  world.answers.selector.some((reply) => reply.kind === 'refused')
    ? 'selector'
    : world.answers.judge.some((reply) => reply.kind === 'refused')
    ? 'judge'
    : undefined

Differential.compare({
  reference: (world: World) =>
    Effect.succeed({
      intended: world.intended,
      distinctMatchableStrings: hasDistinctMatchableStrings(world),
      refusedRole: refusedRoleOf(world),
    }),
  candidate: (world: World) => Effect.map(runInMemory(world, {}), (run) => run.exitCode),
})
  .on(worldArbitrary, { runBudget: 40, interruptAfterTimeLimit: 4000 })
  .assert((generated, exitCode) =>
    generated.distinctMatchableStrings &&
    (generated.intended === 'admissible' ? exitCode === 0 || exitCode === 1 : exitCode === 2) &&
    (generated.intended === 'provider-refusal'
      ? generated.refusedRole !== undefined
      : generated.refusedRole === undefined)
  )

// ---------------------------------------------------------------------------
// Anchors (AE2): the oracle reproduces each hand-worked value, even when the
// product would agree with a wrong oracle.
// ---------------------------------------------------------------------------

Differential.compare({
  reference: () =>
    Effect.succeed({
      tp: scoredRuleAnchor.tp,
      fn: scoredRuleAnchor.fn,
      fp: scoredRuleAnchor.fp,
      tn: scoredRuleAnchor.tn,
      tpr: scoredRuleAnchor.tpr,
      tnr: scoredRuleAnchor.tnr,
    }),
  candidate: () => {
    const counts = oracleRoutingCounts(scoredRuleAnchor.world).find((row) =>
      row.packId === scoredRuleAnchor.packId && row.rule === scoredRuleAnchor.rule &&
      row.split === scoredRuleAnchor.split
    )
    const point = oraclePointEstimates(scoredRuleAnchor.world, {}).find((row) =>
      row.packId === scoredRuleAnchor.packId && row.rule === scoredRuleAnchor.rule &&
      row.split === scoredRuleAnchor.split
    )
    return Effect.succeed({
      tp: counts?.tp,
      fn: counts?.fn,
      fp: counts?.fp,
      tn: counts?.tn,
      tpr: point?.tpr,
      tnr: point?.tnr,
    })
  },
})
  .on(fc.constant(scoredRuleAnchor), { runBudget: 3, interruptAfterTimeLimit: 2000 })
  .assert((hand, oracle) =>
    hand.tp === oracle.tp && hand.fn === oracle.fn && hand.fp === oracle.fp && hand.tn === oracle.tn &&
    hand.tpr === oracle.tpr && hand.tnr === oracle.tnr
  )

Differential.compare({
  reference: () =>
    Effect.succeed({
      tp: insufficientEvidenceAnchor.tp,
      fn: insufficientEvidenceAnchor.fn,
      fp: insufficientEvidenceAnchor.fp,
      tn: insufficientEvidenceAnchor.tn,
      verdictTag: insufficientEvidenceAnchor.verdictTag,
    }),
  candidate: () => {
    const counts = oracleRoutingCounts(insufficientEvidenceAnchor.world).find((row) =>
      row.packId === insufficientEvidenceAnchor.packId && row.rule === insufficientEvidenceAnchor.rule &&
      row.split === insufficientEvidenceAnchor.split
    )
    const verdict = oracleRuleVerdicts(insufficientEvidenceAnchor.world, {}).find((row) =>
      row.packId === insufficientEvidenceAnchor.packId && row.rule === insufficientEvidenceAnchor.rule &&
      row.split === insufficientEvidenceAnchor.split
    )
    return Effect.succeed({
      tp: counts?.tp,
      fn: counts?.fn,
      fp: counts?.fp,
      tn: counts?.tn,
      verdictTag: verdict?.tag,
    })
  },
})
  .on(fc.constant(insufficientEvidenceAnchor), { runBudget: 3, interruptAfterTimeLimit: 2000 })
  .assert((hand, oracle) =>
    hand.tp === oracle.tp && hand.fn === oracle.fn && hand.fp === oracle.fp && hand.tn === oracle.tn &&
    hand.verdictTag === oracle.verdictTag
  )

Differential.compare({
  reference: () =>
    Effect.succeed({
      tpr: validatedJudgeAnchor.tpr,
      tnr: validatedJudgeAnchor.tnr,
      correctedRate: validatedJudgeAnchor.correctedRate,
      exitCode: validatedJudgeAnchor.exitCode,
    }),
  candidate: () => {
    const validity = oracleJudgeValidity(validatedJudgeAnchor.world, {})
    const correctedRates = oracleCorrectedRates(validatedJudgeAnchor.world, {})
    return Effect.succeed({
      tpr: validity.tpr,
      tnr: validity.tnr,
      correctedRate: correctedRates[0]?.rate,
      exitCode: oracleRunOutcome(validatedJudgeAnchor.world, {}).exitCode,
    })
  },
})
  .on(fc.constant(validatedJudgeAnchor), { runBudget: 3, interruptAfterTimeLimit: 2000 })
  .assert((hand, oracle) =>
    hand.tpr === oracle.tpr && hand.tnr === oracle.tnr && hand.correctedRate === oracle.correctedRate &&
    hand.exitCode === oracle.exitCode
  )
