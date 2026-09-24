import { dual } from 'effect/Function'
import {
  ascendingOf,
  distinctSorted,
  keyOf,
  type World,
  type WorldJudgeReply,
  type WorldPairLabel,
  type WorldTaskSplit,
  type WorldVerdict,
} from './pack-eval-world.fixture.js'

type OracleSplit = WorldTaskSplit

type RuleVerdictTag = 'scored' | 'insufficient-evidence' | 'unlabelled'

interface OracleEvidenceFloor {
  readonly positives: number
  readonly negatives: number
}

export const defaultEvidenceFloor: OracleEvidenceFloor = { positives: 3, negatives: 3 }

const defaultJudgeMinimum = 0.8

interface OracleOptions {
  readonly evidenceFloor?: OracleEvidenceFloor | undefined
  readonly judgeMinimum?: number | undefined
  readonly judgeModelPresent?: boolean | undefined
  readonly confidence?: number | undefined
  readonly seed?: number | undefined
}

interface OracleRuleCounts {
  readonly packId: string
  readonly rule: string
  readonly split: OracleSplit
  readonly tp: number
  readonly fn: number
  readonly fp: number
  readonly tn: number
}

interface OracleRuleVerdict {
  readonly packId: string
  readonly rule: string
  readonly split: OracleSplit
  readonly tag: RuleVerdictTag
}

interface OraclePointEstimate {
  readonly packId: string
  readonly rule: string
  readonly split: OracleSplit
  readonly tpr: number
  readonly tnr: number
}

interface OracleWitnessedPair {
  readonly packId: string
  readonly ruleA: string
  readonly ruleB: string
  readonly taskIds: ReadonlyArray<string>
}

type JudgeValidityTag = 'validated' | 'unvalidated' | 'refused' | 'not-applicable'

interface OracleJudgeValidity {
  readonly tag: JudgeValidityTag
  readonly tpr: number | undefined
  readonly tnr: number | undefined
  readonly reason: string | undefined
}

interface OracleCorrectedRate {
  readonly packId: string
  readonly rate: number
}

type RunOutcome = 'clean' | 'witnessed-contradiction' | 'refused'

interface OracleRunOutcome {
  readonly outcome: RunOutcome
  readonly exitCode: 0 | 1 | 2
  readonly reason: string | undefined
}

interface OracleSelectorQuestion {
  readonly taskId: string
  readonly packId: string
}

interface OracleJudgeQuestion {
  readonly packId: string
  readonly taskId: string
  readonly ruleA: string
  readonly ruleB: string
}

export interface OracleQuestions {
  readonly selector: ReadonlyArray<OracleSelectorQuestion>
  readonly judge: ReadonlyArray<OracleJudgeQuestion>
}

const splits: ReadonlyArray<OracleSplit> = ['dev', 'test']

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const floorOf = (options: OracleOptions): OracleEvidenceFloor => options.evidenceFloor ?? defaultEvidenceFloor

const minimumOf = (options: OracleOptions): number => options.judgeMinimum ?? defaultJudgeMinimum

const judgePresent = (options: OracleOptions): boolean => options.judgeModelPresent ?? true

const heldStemsOf = (world: World, packId: string): ReadonlySet<string> =>
  new Set((world.packs.find((pack) => pack.id === packId)?.rules ?? []).map((rule) => rule.stem))

interface OracleRefusal {
  readonly detail: string
}

const malformedRefusal = (world: World): OracleRefusal | undefined => {
  const malformed = world.packs.flatMap((pack) =>
    pack.rules.filter((rule) => rule.malformed === true).map((rule) => `${pack.id}:${rule.stem}`)
  )
  return malformed.length === 0 ? undefined : { detail: `malformed rule ${distinctSorted(malformed).join(', ')}` }
}

const missingStemRefusal = (world: World): OracleRefusal | undefined => {
  const fromRouting = world.routingLabels.flatMap((entry) => {
    const stems = heldStemsOf(world, entry.packId)
    return [...entry.governing, ...entry.deferred]
      .filter((stem) => !stems.has(stem))
      .map((stem) => `routing label for ${entry.taskId} names ${stem}`)
  })
  const fromPairs = world.pairLabels.flatMap((label) => {
    const stems = heldStemsOf(world, label.packId)
    return [label.ruleA, label.ruleB]
      .filter((stem) => !stems.has(stem))
      .map((stem) => `pair label ${label.id} names ${stem}`)
  })
  const missing = [...fromRouting, ...fromPairs]
  return missing.length === 0
    ? undefined
    : { detail: `label names a missing rule: ${distinctSorted(missing).join('; ')}` }
}

const missingJudgePromptRefusal = (world: World): OracleRefusal | undefined =>
  world.pairLabels.length > 0 && world.judgePrompt === undefined
    ? { detail: 'pair labels are present without a judge prompt' }
    : undefined

// A pair is witnessed only when one routing entry for its task and pack
// governs both rules (pack-evaluator plan U2 :330, a pair whose task does not
// label both rules as governing is refused).
const singleEntryGovernsPair = (
  world: World,
  packId: string,
  taskId: string,
  ruleA: string,
  ruleB: string,
): boolean =>
  world.routingLabels.some((entry) =>
    entry.packId === packId && entry.taskId === taskId &&
    entry.governing.includes(ruleA) && entry.governing.includes(ruleB)
  )

const unwitnessedPairRefusal = (world: World): OracleRefusal | undefined => {
  const first = world.pairLabels.find((label) =>
    singleEntryGovernsPair(world, label.packId, label.taskId, label.ruleA, label.ruleB) === false
  )
  return first === undefined
    ? undefined
    : { detail: `pair ${first.id} on task ${first.taskId} needs no witness: both ${first.packId} rules must govern it` }
}

const trainPairIdsOf = (world: World): ReadonlyArray<string> =>
  world.pairLabels.filter((label) => label.split === 'train').map((label) => label.id)

const leakedFewShotRefusal = (world: World): OracleRefusal | undefined => {
  const prompt = world.judgePrompt
  if (prompt === undefined) return undefined
  const leaked = prompt.fewShotPairIds.filter((id) => trainPairIdsOf(world).includes(id) === false)
  return leaked.length === 0
    ? undefined
    : { detail: `few-shot pair ${distinctSorted(leaked).join(', ')} is not in the train split` }
}

const admissionRefusal = (world: World): OracleRefusal | undefined =>
  malformedRefusal(world) ?? missingStemRefusal(world) ?? unwitnessedPairRefusal(world) ??
    leakedFewShotRefusal(world) ?? missingJudgePromptRefusal(world)

const providerRefusal = (world: World): OracleRefusal | undefined => {
  const selectorRefused = world.answers.selector.some((reply) => reply.kind === 'refused')
  const judgeRefused = world.answers.judge.some((reply) => reply.kind === 'refused')
  if (!selectorRefused && !judgeRefused) return undefined
  return { detail: `provider refused a ${selectorRefused ? 'selector' : 'judge'} request` }
}

const selectorAnswerOf = (world: World, taskId: string, packId: string) =>
  world.answers.selector.find((reply) => reply.taskId === taskId && reply.packId === packId)

const loadedStemsOf = (world: World, taskId: string, packId: string): ReadonlySet<string> => {
  const reply = selectorAnswerOf(world, taskId, packId)
  return new Set(reply !== undefined && reply.kind === 'selected' ? reply.stems : [])
}

// A deferred stem is an abstention and yields no cell; a pack rule that is
// neither governing nor deferred on the entry is a does-not-govern negative
// (pack-evaluator plan U6 :453-454, governs/does-not-govern vs defer).
interface LabelledCell {
  readonly governing: boolean
  readonly loaded: boolean
}

const labelledCellsOf = (
  world: World,
  packId: string,
  stem: string,
  split: OracleSplit,
): ReadonlyArray<LabelledCell> => {
  const stems = new Set(
    world.packs.find((pack) => pack.id === packId)?.rules.map((rule) => rule.stem) ?? [],
  )
  return world.routingLabels
    .filter((entry) => entry.packId === packId)
    .flatMap((entry) => {
      const task = world.tasks.find((candidate) => candidate.id === entry.taskId)
      if (task === undefined || task.split !== split) return []
      if (entry.deferred.includes(stem) || stems.has(stem) === false) return []
      return [{
        governing: entry.governing.includes(stem),
        loaded: loadedStemsOf(world, task.id, packId).has(stem),
      }]
    })
}

const emptyCountsOf = (packId: string, stem: string, split: OracleSplit): OracleRuleCounts => ({
  packId,
  rule: stem,
  split,
  tp: 0,
  fn: 0,
  fp: 0,
  tn: 0,
})

const countsFor = (world: World, packId: string, stem: string, split: OracleSplit): OracleRuleCounts => {
  const cells = labelledCellsOf(world, packId, stem, split)
  const governing = cells.filter((cell) => cell.governing)
  const deferred = cells.filter((cell) => !cell.governing)
  return {
    ...emptyCountsOf(packId, stem, split),
    tp: governing.filter((cell) => cell.loaded).length,
    fn: governing.filter((cell) => !cell.loaded).length,
    fp: deferred.filter((cell) => cell.loaded).length,
    tn: deferred.filter((cell) => !cell.loaded).length,
  }
}

const ruleCellsOf = (world: World, packId: string, stem: string): number =>
  world.routingLabels
    .filter((entry) => entry.packId === packId)
    .filter((entry) => world.tasks.some((task) => task.id === entry.taskId))
    .filter(() => heldStemsOf(world, packId).has(stem))
    .filter((entry) => entry.deferred.includes(stem) === false)
    .length

const ruleSplitsOf = (world: World): ReadonlyArray<readonly [string, string]> =>
  world.packs.flatMap((pack) =>
    [...new Set(pack.rules.map((rule) => rule.stem))].toSorted().map((stem) => [pack.id, stem] as const)
  )

export const oracleRoutingCounts = (world: World): ReadonlyArray<OracleRuleCounts> =>
  ruleSplitsOf(world).flatMap(([packId, stem]) => splits.map((split) => countsFor(world, packId, stem, split)))

const verdictTagOf = (
  counts: OracleRuleCounts,
  world: World,
  floor: OracleEvidenceFloor,
): RuleVerdictTag => {
  if (ruleCellsOf(world, counts.packId, counts.rule) === 0) return 'unlabelled'
  const positives = counts.tp + counts.fn
  const negatives = counts.tn + counts.fp
  return positives < Math.max(floor.positives, 1) || negatives < Math.max(floor.negatives, 1)
    ? 'insufficient-evidence'
    : 'scored'
}

const ruleVerdictsImpl = (world: World, options: OracleOptions): ReadonlyArray<OracleRuleVerdict> =>
  oracleRoutingCounts(world).map((counts) => ({
    packId: counts.packId,
    rule: counts.rule,
    split: counts.split,
    tag: verdictTagOf(counts, world, floorOf(options)),
  }))
export const oracleRuleVerdicts: {
  (options: OracleOptions): (world: World) => ReadonlyArray<OracleRuleVerdict>
  (world: World, options: OracleOptions): ReadonlyArray<OracleRuleVerdict>
} = dual(2, ruleVerdictsImpl)

const pointEstimateOf = (
  world: World,
  options: OracleOptions,
  counts: OracleRuleCounts,
): ReadonlyArray<OraclePointEstimate> => {
  if (verdictTagOf(counts, world, floorOf(options)) !== 'scored') return []
  const positives = counts.tp + counts.fn
  const negatives = counts.tn + counts.fp
  return [{
    packId: counts.packId,
    rule: counts.rule,
    split: counts.split,
    tpr: counts.tp / positives,
    tnr: counts.tn / negatives,
  }]
}

const pointEstimatesImpl = (world: World, options: OracleOptions): ReadonlyArray<OraclePointEstimate> =>
  oracleRoutingCounts(world).flatMap((counts) => pointEstimateOf(world, options, counts))

export const oraclePointEstimates: {
  (options: OracleOptions): (world: World) => ReadonlyArray<OraclePointEstimate>
  (world: World, options: OracleOptions): ReadonlyArray<OraclePointEstimate>
} = dual(2, pointEstimatesImpl)

const governsBoth = (world: World, packId: string, taskId: string, ruleA: string, ruleB: string): boolean =>
  singleEntryGovernsPair(world, packId, taskId, ruleA, ruleB)

const witnessedPairOf = (
  world: World,
  packId: string,
  ruleA: string,
  ruleB: string,
): ReadonlyArray<OracleWitnessedPair> => {
  const taskIds = world.tasks
    .map((task) => task.id)
    .filter((taskId) => governsBoth(world, packId, taskId, ruleA, ruleB))
    .toSorted(ascendingOf)
  if (taskIds.length === 0) return []
  return [{ packId, ruleA, ruleB, taskIds }]
}

export const oracleWitnessedPairs = (world: World): ReadonlyArray<OracleWitnessedPair> =>
  world.packs.flatMap((pack) => {
    const stems = distinctSorted(pack.rules.map((rule) => rule.stem))
    return stems.flatMap((ruleA, index) =>
      stems.slice(index + 1).flatMap((ruleB) => witnessedPairOf(world, pack.id, ruleA, ruleB))
    )
  })

const judgeReplyOf = (
  world: World,
  packId: string,
  taskId: string,
  ruleA: string,
  ruleB: string,
): WorldJudgeReply | undefined =>
  world.answers.judge.find((reply) =>
    reply.question.packId === packId &&
    reply.question.taskId === taskId &&
    reply.question.ruleA === ruleA &&
    reply.question.ruleB === ruleB
  )

const judgeVerdictOf = (
  world: World,
  packId: string,
  taskId: string,
  ruleA: string,
  ruleB: string,
): WorldVerdict | undefined => {
  const reply = judgeReplyOf(world, packId, taskId, ruleA, ruleB)
  return reply !== undefined && reply.kind === 'judged' ? reply.verdict : undefined
}

const verdictsOf = (
  world: World,
  packId: string,
  taskId: string,
  ruleA: string,
  ruleB: string,
): ReadonlyArray<WorldVerdict> => {
  const verdict = judgeVerdictOf(world, packId, taskId, ruleA, ruleB)
  return verdict === undefined ? [] : [verdict]
}

interface Agreement {
  readonly label: WorldPairLabel
  readonly verdict: WorldVerdict
}

const agreementsOf = (world: World, label: WorldPairLabel): ReadonlyArray<Agreement> =>
  verdictsOf(world, label.packId, label.taskId, label.ruleA, label.ruleB).map((verdict) => ({ label, verdict }))

const judgeRefusalOf = (reason: string): OracleJudgeValidity => ({
  tag: 'refused',
  tpr: undefined,
  tnr: undefined,
  reason,
})

const judgeValidityImpl = (world: World, options: OracleOptions): OracleJudgeValidity => {
  if (world.pairLabels.length === 0) {
    return { tag: 'not-applicable', tpr: undefined, tnr: undefined, reason: 'no pair labels' }
  }
  if (world.judgePrompt === undefined) return judgeRefusalOf('pair labels without a judge prompt')
  if (!judgePresent(options)) return judgeRefusalOf('no judge model configured')
  const test = world.pairLabels.filter((label) => label.split === 'test')
  if (test.length === 0) return judgeRefusalOf('no test pair labels')
  const agreed = test.flatMap((label) => agreementsOf(world, label))
  const missingNames = distinctSorted(
    test.filter((label) => !agreed.some((entry) => entry.label.id === label.id)).map((label) => label.id),
  ).join(', ')
  if (agreed.length !== test.length) return judgeRefusalOf(`no judge verdict for ${missingNames}`)
  const tp = agreed.filter((entry) => entry.label.verdict === 'Pass' && entry.verdict === 'Pass').length
  const fn = agreed.filter((entry) => entry.label.verdict === 'Pass' && entry.verdict === 'Fail').length
  const tn = agreed.filter((entry) => entry.label.verdict === 'Fail' && entry.verdict === 'Fail').length
  const fp = agreed.filter((entry) => entry.label.verdict === 'Fail' && entry.verdict === 'Pass').length
  if (tp + fn === 0 || tn + fp === 0) return judgeRefusalOf('test pair labels hold one class')
  const tpr = tp / (tp + fn)
  const tnr = tn / (tn + fp)
  if (tpr + tnr <= 1) return judgeRefusalOf(`judge is no better than chance (tpr ${tpr} + tnr ${tnr} <= 1)`)
  const minimum = minimumOf(options)
  return tpr >= minimum && tnr >= minimum
    ? { tag: 'validated', tpr, tnr, reason: undefined }
    : { tag: 'unvalidated', tpr, tnr, reason: `tpr ${tpr} or tnr ${tnr} below ${minimum}` }
}

export const oracleJudgeValidity: {
  (options: OracleOptions): (world: World) => OracleJudgeValidity
  (world: World, options: OracleOptions): OracleJudgeValidity
} = dual(2, judgeValidityImpl)

const witnessVerdictsOf = (world: World): ReadonlyArray<WorldVerdict> =>
  oracleWitnessedPairs(world).flatMap((pair) =>
    pair.taskIds.flatMap((taskId) => verdictsOf(world, pair.packId, taskId, pair.ruleA, pair.ruleB))
  )

const packWitnessVerdictsOf = (world: World, packId: string): ReadonlyArray<WorldVerdict> =>
  oracleWitnessedPairs(world)
    .filter((pair) => pair.packId === packId)
    .flatMap((pair) => pair.taskIds.flatMap((taskId) => verdictsOf(world, pair.packId, taskId, pair.ruleA, pair.ruleB)))

// Pack-evaluator plan R12 names the corrected contradiction rate among the
// witnessed pairs of each pack. judgy estimates the success rate on the test
// labels, so the contradiction rate is one minus that estimate; the observation
// the correction is applied to is that pack's own witnessed verdicts, while the
// calibration stays the run's test labels.
const correctedRatesImpl = (world: World, options: OracleOptions): ReadonlyArray<OracleCorrectedRate> => {
  if (admissionRefusal(world) !== undefined || providerRefusal(world) !== undefined) return []
  const validity = judgeValidityImpl(world, options)
  const tpr = validity.tpr
  const tnr = validity.tnr
  if (validity.tag !== 'validated' || tpr === undefined || tnr === undefined) return []
  const denominator = tpr + tnr - 1
  if (denominator <= 0) return []
  return world.packs.flatMap((pack): ReadonlyArray<OracleCorrectedRate> => {
    const verdicts = packWitnessVerdictsOf(world, pack.id)
    if (verdicts.length === 0) return []
    const observed = verdicts.filter((verdict) => verdict === 'Pass').length / verdicts.length
    return [{ packId: pack.id, rate: 1 - clamp01((observed + tnr - 1) / denominator) }]
  })
}

export const oracleCorrectedRates: {
  (options: OracleOptions): (world: World) => ReadonlyArray<OracleCorrectedRate>
  (world: World, options: OracleOptions): ReadonlyArray<OracleCorrectedRate>
} = dual(2, correctedRatesImpl)

const runOutcomeImpl = (world: World, options: OracleOptions): OracleRunOutcome => {
  const admission = admissionRefusal(world)
  if (admission !== undefined) return { outcome: 'refused', exitCode: 2, reason: admission.detail }
  const provider = providerRefusal(world)
  if (provider !== undefined) return { outcome: 'refused', exitCode: 2, reason: provider.detail }
  if (world.pairLabels.length === 0) {
    return { outcome: 'clean', exitCode: 0, reason: 'contradiction is not yet evaluated' }
  }
  if (!judgePresent(options)) return { outcome: 'refused', exitCode: 2, reason: 'no judge model configured' }
  const validity = judgeValidityImpl(world, options)
  if (validity.tag === 'refused') return { outcome: 'clean', exitCode: 0, reason: validity.reason }
  if (validity.tag !== 'validated') {
    return { outcome: 'clean', exitCode: 0, reason: `judge is ${validity.tag} and its verdicts are advisory` }
  }
  const fails = witnessVerdictsOf(world).filter((verdict) => verdict === 'Fail').length
  return fails > 0
    ? { outcome: 'witnessed-contradiction', exitCode: 1, reason: `${fails} witnessed pair verdict(s) are Fail` }
    : { outcome: 'clean', exitCode: 0, reason: 'no witnessed pair verdict is Fail' }
}

export const oracleRunOutcome: {
  (options: OracleOptions): (world: World) => OracleRunOutcome
  (world: World, options: OracleOptions): OracleRunOutcome
} = dual(2, runOutcomeImpl)

const selectorQuestionOf = (world: World): ReadonlyArray<OracleSelectorQuestion> =>
  world.tasks
    .flatMap((task) => world.packs.map((pack) => ({ taskId: task.id, packId: pack.id })))
    .toSorted((left, right) => ascendingOf(keyOf(left.packId, left.taskId), keyOf(right.packId, right.taskId)))

const judgeComparator = (left: OracleJudgeQuestion, right: OracleJudgeQuestion): number =>
  ascendingOf(
    keyOf(left.packId, left.taskId, left.ruleA, left.ruleB),
    keyOf(right.packId, right.taskId, right.ruleA, right.ruleB),
  )

const judgeQuestionsImpl = (world: World, options: OracleOptions): ReadonlyArray<OracleJudgeQuestion> => {
  if (admissionRefusal(world) !== undefined) return []
  if (world.pairLabels.length === 0 || world.judgePrompt === undefined || !judgePresent(options)) return []
  const selectorClean = world.tasks.every((task) =>
    world.packs.every((pack) => {
      const reply = selectorAnswerOf(world, task.id, pack.id)
      return reply !== undefined && reply.kind === 'selected'
    })
  )
  if (!selectorClean) return []
  const validityTargets: ReadonlyArray<OracleJudgeQuestion> = world.pairLabels
    .filter((label) => label.split === 'test')
    .map((label) => ({ packId: label.packId, taskId: label.taskId, ruleA: label.ruleA, ruleB: label.ruleB }))
  const witnessTargets: ReadonlyArray<OracleJudgeQuestion> = oracleWitnessedPairs(world).flatMap((pair) =>
    pair.taskIds.map((taskId) => ({ packId: pair.packId, taskId, ruleA: pair.ruleA, ruleB: pair.ruleB }))
  )
  const targets = [...validityTargets, ...witnessTargets].toSorted(judgeComparator)
  return targets.filter((question, index) => {
    const previous = targets[index - 1]
    return previous === undefined || judgeComparator(previous, question) !== 0
  })
}

const questionsImpl = (world: World, options: OracleOptions): OracleQuestions => {
  if (admissionRefusal(world) !== undefined) return { selector: [], judge: [] }
  return { selector: selectorQuestionOf(world), judge: judgeQuestionsImpl(world, options) }
}

export const oracleQuestions: {
  (options: OracleOptions): (world: World) => OracleQuestions
  (world: World, options: OracleOptions): OracleQuestions
} = dual(2, questionsImpl)
