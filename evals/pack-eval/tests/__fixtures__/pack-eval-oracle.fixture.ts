import { dual } from 'effect/Function'
import {
  type World,
  type WorldJudgeReply,
  type WorldPairLabel,
  type WorldTaskSplit,
  type WorldVerdict,
} from './pack-eval-world.fixture.js'

export type OracleSplit = WorldTaskSplit

export type RuleVerdictTag = 'scored' | 'insufficient-evidence' | 'unlabelled'

export const defaultEvidenceFloor = 3

export const defaultJudgeMinimum = 0.8

export interface OracleOptions {
  readonly evidenceFloor?: number | undefined
  readonly judgeMinimum?: number | undefined
  readonly judgeModelPresent?: boolean | undefined
  readonly confidence?: number | undefined
  readonly seed?: number | undefined
}

export interface OracleRuleCounts {
  readonly packId: string
  readonly rule: string
  readonly split: OracleSplit
  readonly tp: number
  readonly fn: number
  readonly fp: number
  readonly tn: number
}

export interface OracleRuleVerdict {
  readonly packId: string
  readonly rule: string
  readonly split: OracleSplit
  readonly tag: RuleVerdictTag
}

export interface OraclePointEstimate {
  readonly packId: string
  readonly rule: string
  readonly split: OracleSplit
  readonly tpr: number
  readonly tnr: number
}

export interface OracleWitnessedPair {
  readonly packId: string
  readonly ruleA: string
  readonly ruleB: string
  readonly taskIds: ReadonlyArray<string>
}

export interface OracleUnwitnessedPair {
  readonly packId: string
  readonly ruleA: string
  readonly ruleB: string
  readonly pairLabelId: string
}

export type JudgeValidityTag = 'validated' | 'unvalidated' | 'refused' | 'not-applicable'

export interface OracleJudgeValidity {
  readonly tag: JudgeValidityTag
  readonly tpr: number | undefined
  readonly tnr: number | undefined
  readonly reason: string | undefined
}

export type OracleCorrectedRate =
  | Readonly<{ readonly tag: 'reported'; readonly rate: number }>
  | Readonly<{ readonly tag: 'not-applicable'; readonly reason: string }>

export type RunOutcome = 'clean' | 'witnessed-contradiction' | 'refused'

export interface OracleRunOutcome {
  readonly outcome: RunOutcome
  readonly exitCode: 0 | 1 | 2
  readonly reason: string | undefined
}

export interface OracleSelectorQuestion {
  readonly taskId: string
  readonly packId: string
}

export interface OracleJudgeQuestion {
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

const ascendingOf = (left: string, right: string): number => Number(left > right) - Number(left < right)

const keyOf = (...parts: ReadonlyArray<string>): string => parts.join('\u0000')

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const floorOf = (options: OracleOptions): number => options.evidenceFloor ?? defaultEvidenceFloor

const minimumOf = (options: OracleOptions): number => options.judgeMinimum ?? defaultJudgeMinimum

const judgePresent = (options: OracleOptions): boolean => options.judgeModelPresent ?? true

const stemsOfPack = (world: World, packId: string): ReadonlySet<string> =>
  new Set((world.packs.find((pack) => pack.id === packId)?.rules ?? []).map((rule) => rule.stem))

const distinctSorted = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values)].toSorted(ascendingOf)

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
    const stems = stemsOfPack(world, entry.packId)
    return [...entry.governing, ...entry.deferred]
      .filter((stem) => !stems.has(stem))
      .map((stem) => `routing label for ${entry.taskId} names ${stem}`)
  })
  const fromPairs = world.pairLabels.flatMap((label) => {
    const stems = stemsOfPack(world, label.packId)
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

const admissionRefusal = (world: World): OracleRefusal | undefined =>
  malformedRefusal(world) ?? missingStemRefusal(world) ?? missingJudgePromptRefusal(world)

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

const routingEntryOf = (world: World, packId: string, taskId: string) =>
  world.routingLabels.find((entry) => entry.packId === packId && entry.taskId === taskId)

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
  const cellOf = (taskId: string): LabelledCell | undefined => {
    const entry = routingEntryOf(world, packId, taskId)
    if (entry === undefined) return undefined
    const governing = entry.governing.includes(stem)
    const deferred = entry.deferred.includes(stem)
    if (!governing && !deferred) return undefined
    return { governing, loaded: loadedStemsOf(world, taskId, packId).has(stem) }
  }
  return world.tasks
    .filter((task) => task.split === split)
    .flatMap((task) => {
      const cell = cellOf(task.id)
      return cell === undefined ? [] : [cell]
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

const ruleSplitsOf = (world: World): ReadonlyArray<readonly [string, string]> =>
  world.packs.flatMap((pack) =>
    distinctSorted(pack.rules.map((rule) => rule.stem)).map((stem) => [pack.id, stem] as const)
  )

export const oracleRoutingCounts = (world: World): ReadonlyArray<OracleRuleCounts> =>
  ruleSplitsOf(world).flatMap(([packId, stem]) => splits.map((split) => countsFor(world, packId, stem, split)))

const verdictTagOf = (counts: OracleRuleCounts, floor: number): RuleVerdictTag => {
  const positives = counts.tp + counts.fn
  const negatives = counts.tn + counts.fp
  if (positives + negatives === 0) return 'unlabelled'
  return positives < floor || negatives < floor ? 'insufficient-evidence' : 'scored'
}

const ruleVerdictsImpl = (world: World, options: OracleOptions): ReadonlyArray<OracleRuleVerdict> =>
  oracleRoutingCounts(world).map((counts) => ({
    packId: counts.packId,
    rule: counts.rule,
    split: counts.split,
    tag: verdictTagOf(counts, floorOf(options)),
  }))

export const oracleRuleVerdicts: {
  (options: OracleOptions): (world: World) => ReadonlyArray<OracleRuleVerdict>
  (world: World, options: OracleOptions): ReadonlyArray<OracleRuleVerdict>
} = dual(2, ruleVerdictsImpl)

const pointEstimateOf = (
  options: OracleOptions,
  counts: OracleRuleCounts,
): ReadonlyArray<OraclePointEstimate> => {
  if (verdictTagOf(counts, floorOf(options)) !== 'scored') return []
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
  oracleRoutingCounts(world).flatMap((counts) => pointEstimateOf(options, counts))

export const oraclePointEstimates: {
  (options: OracleOptions): (world: World) => ReadonlyArray<OraclePointEstimate>
  (world: World, options: OracleOptions): ReadonlyArray<OraclePointEstimate>
} = dual(2, pointEstimatesImpl)

const governsBoth = (world: World, packId: string, taskId: string, ruleA: string, ruleB: string): boolean => {
  const governed = world.routingLabels
    .filter((entry) => entry.packId === packId && entry.taskId === taskId)
    .flatMap((entry) => entry.governing)
  return governed.includes(ruleA) && governed.includes(ruleB)
}

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

export const oracleUnwitnessedPairs = (world: World): ReadonlyArray<OracleUnwitnessedPair> => {
  const witnessed = new Set(
    oracleWitnessedPairs(world).map((pair) => keyOf(pair.packId, pair.ruleA, pair.ruleB)),
  )
  return world.pairLabels
    .filter((label) => !witnessed.has(keyOf(label.packId, label.ruleA, label.ruleB)))
    .map((label) => ({ packId: label.packId, ruleA: label.ruleA, ruleB: label.ruleB, pairLabelId: label.id }))
    .toSorted((left, right) =>
      ascendingOf(
        keyOf(left.packId, left.ruleA, left.ruleB, left.pairLabelId),
        keyOf(right.packId, right.ruleA, right.ruleB, right.pairLabelId),
      )
    )
}

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

const correctedRateImpl = (world: World, options: OracleOptions): OracleCorrectedRate => {
  const validity = judgeValidityImpl(world, options)
  if (validity.tag !== 'validated' || validity.tpr === undefined || validity.tnr === undefined) {
    return { tag: 'not-applicable', reason: `judge is ${validity.tag}` }
  }
  const verdicts = witnessVerdictsOf(world)
  if (verdicts.length === 0) return { tag: 'not-applicable', reason: 'no witnessed pair verdicts' }
  const observed = verdicts.filter((verdict) => verdict === 'Pass').length / verdicts.length
  const denominator = validity.tpr + validity.tnr - 1
  if (denominator <= 0) return { tag: 'not-applicable', reason: 'judge is no better than random' }
  return { tag: 'reported', rate: clamp01((observed + validity.tnr - 1) / denominator) }
}

export const oracleCorrectedRate: {
  (options: OracleOptions): (world: World) => OracleCorrectedRate
  (world: World, options: OracleOptions): OracleCorrectedRate
} = dual(2, correctedRateImpl)

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
  if (providerRefusal(world) !== undefined) return []
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

export const oracleJudgeQuestions: {
  (options: OracleOptions): (world: World) => ReadonlyArray<OracleJudgeQuestion>
  (world: World, options: OracleOptions): ReadonlyArray<OracleJudgeQuestion>
} = dual(2, judgeQuestionsImpl)

const questionsImpl = (world: World, options: OracleOptions): OracleQuestions => {
  if (admissionRefusal(world) !== undefined) return { selector: [], judge: [] }
  return { selector: selectorQuestionOf(world), judge: judgeQuestionsImpl(world, options) }
}

export const oracleQuestions: {
  (options: OracleOptions): (world: World) => OracleQuestions
  (world: World, options: OracleOptions): OracleQuestions
} = dual(2, questionsImpl)
