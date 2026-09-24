import {
  evaluateWorld,
  servedJudgeModel,
  servedPlannerModel,
  type World,
  type WorldJudgeReply,
  type WorldPairLabel,
  type WorldRoutingEntry,
  type WorldRuleFile,
  type WorldSelectorReply,
  type WorldTask,
  type WorldTaskSplit,
  type WorldVerdict,
} from './pack-eval-world.fixture.js'

const anchorPackId = 'anchor-pack'
const anchorRuleStem = 'anchor-rule'
const alphaRuleStem = 'alpha-rule'
const betaRuleStem = 'beta-rule'

const oneThrough = (count: number): ReadonlyArray<number> => [...Array(count).keys()].map((key) => key + 1)

const anchorRuleOf = (stem: string): WorldRuleFile => ({
  stem,
  title: `${stem} title`,
  appliesWhen: [`while doing ${stem} work`],
  tags: [stem],
  body: `The ${stem} rule body.`,
})

const anchorTaskOf = (index: number, split: WorldTaskSplit): WorldTask => ({
  id: `anchor-task-${index}`,
  text: `anchor task number ${index}`,
  split,
  dimensions: {},
})

const anchorRoutingOf = (
  index: number,
  governing: ReadonlyArray<string>,
  deferred: ReadonlyArray<string>,
): WorldRoutingEntry => ({
  taskId: `anchor-task-${index}`,
  packId: anchorPackId,
  governing,
  deferred,
})

const governingAnchorRouting = (index: number): WorldRoutingEntry => anchorRoutingOf(index, [anchorRuleStem], [])
const deferredAnchorRouting = (index: number): WorldRoutingEntry => anchorRoutingOf(index, [], [anchorRuleStem])

const anchorSelectorReplyOf = (index: number, stems: ReadonlyArray<string>): WorldSelectorReply => ({
  kind: 'selected',
  taskId: `anchor-task-${index}`,
  packId: anchorPackId,
  stems,
  servedModel: servedPlannerModel,
})

const anchorJudgeReplyOf = (
  index: number,
  ruleA: string,
  ruleB: string,
  verdict: WorldVerdict,
): WorldJudgeReply => ({
  kind: 'judged',
  question: { packId: anchorPackId, taskId: `anchor-task-${index}`, ruleA, ruleB, plantedBody: undefined },
  verdict,
  critique: `anchor critique ${index}`,
  servedModel: servedJudgeModel,
})

const anchorPairLabelOf = (index: number, ruleA: string, ruleB: string, verdict: WorldVerdict): WorldPairLabel => ({
  id: `anchor-pair-${index}`,
  taskId: `anchor-task-${index}`,
  packId: anchorPackId,
  ruleA,
  ruleB,
  split: 'test',
  verdict,
  origin: 'observed',
  notes: `anchor pair note ${index}`,
})

const noGenerator = { kind: 'proposed', proposedTuples: [], writtenTasks: [] } as const

const anchorJudgePrompt = {
  criterion: 'On this task, can one change satisfy both rules?',
  passDefinition: 'Pass: one change can satisfy both rules at once.',
  failDefinition: 'Fail: no single change satisfies both rules together.',
  fewShotPairIds: [],
}

const scoredRuleWorld = evaluateWorld({
  packs: [{ id: anchorPackId, rules: [anchorRuleOf(anchorRuleStem)] }],
  tasks: oneThrough(6).map((index) => anchorTaskOf(index, 'dev')),
  routingLabels: [1, 2, 3].map(governingAnchorRouting).concat([4, 5, 6].map(deferredAnchorRouting)),
  pairLabels: [],
  judgePrompt: undefined,
  answers: {
    selector: [
      anchorSelectorReplyOf(1, [anchorRuleStem]),
      anchorSelectorReplyOf(2, [anchorRuleStem]),
      anchorSelectorReplyOf(3, []),
      anchorSelectorReplyOf(4, [anchorRuleStem]),
      anchorSelectorReplyOf(5, []),
      anchorSelectorReplyOf(6, []),
    ],
    judge: [],
    generator: noGenerator,
  },
})

const insufficientEvidenceWorld = evaluateWorld({
  packs: [{ id: anchorPackId, rules: [anchorRuleOf(anchorRuleStem)] }],
  tasks: oneThrough(4).map((index) => anchorTaskOf(index, 'dev')),
  routingLabels: [1, 2].map(governingAnchorRouting).concat([3, 4].map(deferredAnchorRouting)),
  pairLabels: [],
  judgePrompt: undefined,
  answers: {
    selector: [
      anchorSelectorReplyOf(1, [anchorRuleStem]),
      anchorSelectorReplyOf(2, []),
      anchorSelectorReplyOf(3, []),
      anchorSelectorReplyOf(4, []),
    ],
    judge: [],
    generator: noGenerator,
  },
})

const judgedPairWorld = evaluateWorld({
  packs: [{ id: anchorPackId, rules: [anchorRuleOf(alphaRuleStem), anchorRuleOf(betaRuleStem)] }],
  tasks: oneThrough(14).map((index) => anchorTaskOf(index, 'dev')),
  routingLabels: oneThrough(14).map((index) => anchorRoutingOf(index, [alphaRuleStem, betaRuleStem], [])),
  pairLabels: [1, 2, 3, 4, 5, 6, 7, 8]
    .map((index) => anchorPairLabelOf(index, alphaRuleStem, betaRuleStem, 'Pass'))
    .concat([9, 10, 11, 12, 13, 14].map((index) => anchorPairLabelOf(index, alphaRuleStem, betaRuleStem, 'Fail'))),
  judgePrompt: anchorJudgePrompt,
  answers: {
    selector: oneThrough(14).map((index) => anchorSelectorReplyOf(index, [alphaRuleStem, betaRuleStem])),
    judge: [1, 2, 3, 4, 5, 6, 7]
      .map((index) => anchorJudgeReplyOf(index, alphaRuleStem, betaRuleStem, 'Pass'))
      .concat(
        [8, 9, 10, 11, 12, 13, 14].map((index) => anchorJudgeReplyOf(index, alphaRuleStem, betaRuleStem, 'Fail')),
      ),
    generator: noGenerator,
  },
})

export interface ScoredRuleAnchor {
  readonly name: 'scored-rule-counts'
  readonly world: World
  readonly packId: string
  readonly rule: string
  readonly split: WorldTaskSplit
  readonly tp: number
  readonly fn: number
  readonly fp: number
  readonly tn: number
  readonly tpr: number
  readonly tnr: number
  readonly derivation: string
}

export interface InsufficientEvidenceAnchor {
  readonly name: 'insufficient-evidence-rule'
  readonly world: World
  readonly packId: string
  readonly rule: string
  readonly split: WorldTaskSplit
  readonly tp: number
  readonly fn: number
  readonly fp: number
  readonly tn: number
  readonly verdictTag: 'insufficient-evidence'
  readonly derivation: string
}

export interface ValidatedJudgeAnchor {
  readonly name: 'validated-judge-corrected-rate'
  readonly world: World
  readonly tpr: number
  readonly tnr: number
  readonly correctedRate: number
  readonly exitCode: 1
  readonly derivation: string
}

export interface BootstrapIntervalAnchor {
  readonly name: 'seeded-bootstrap-interval'
  readonly world: World
  readonly seed: number
  readonly confidence: number
  readonly lower: undefined
  readonly upper: undefined
  readonly pinnedFromProduct: true
  readonly derivation: string
}

export const scoredRuleAnchor: ScoredRuleAnchor = {
  name: 'scored-rule-counts',
  world: scoredRuleWorld,
  packId: anchorPackId,
  rule: anchorRuleStem,
  split: 'dev',
  tp: 2,
  fn: 1,
  fp: 1,
  tn: 2,
  tpr: 2 / 3,
  tnr: 2 / 3,
  derivation: [
    'Product plan AE1: a task labelled as governed by the rule that the selector loads gives TP 1; AE2: a task',
    'labelled as not governed where the selector loads the rule gives FP 1. A label positive is the stem in the',
    'routing entry governing list, a negative is the stem in the deferred list, and a cell naming the rule in',
    'neither is unlabelled and contributes nothing (product plan R13; rebuild plan U4: TP + FN + FP + TN equals',
    'the number of labelled cells). Six dev tasks: governing and loaded on tasks 1 and 2 (TP 2), governing and',
    'not loaded on task 3 (FN 1), deferred but loaded on task 4 (FP 1), deferred and not loaded on tasks 5 and',
    '6 (TN 2). TPR = TP / (TP + FN) = 2/3 and TNR = TN / (TN + FP) = 2/3 per evals-skills validate-evaluator',
    'Step 3. The split holds 3 positives and 3 negatives, the product plan U4 default evidence floor, so the',
    'rule is scored.',
  ].join(' '),
}

export const insufficientEvidenceAnchor: InsufficientEvidenceAnchor = {
  name: 'insufficient-evidence-rule',
  world: insufficientEvidenceWorld,
  packId: anchorPackId,
  rule: anchorRuleStem,
  split: 'dev',
  tp: 1,
  fn: 1,
  fp: 0,
  tn: 2,
  verdictTag: 'insufficient-evidence',
  derivation: [
    'Product plan R8: a rule below the evidence floor in a split is marked insufficient evidence instead of',
    'getting rates, and U4 sets the default floor at 3 positives and 3 negatives. Four dev tasks give 2',
    'positives (tasks 1 and 2) and 2 negatives (tasks 3 and 4); the selector loads the rule only on task 1, so',
    'insufficient-evidence and no TPR or TNR is reported.',
  ].join(' '),
}

export const validatedJudgeAnchor: ValidatedJudgeAnchor = {
  name: 'validated-judge-corrected-rate',
  world: judgedPairWorld,
  tpr: 7 / 8,
  tnr: 1,
  correctedRate: 4 / 7,
  exitCode: 1,
  derivation: [
    'Product plan R10: the judge counts as validated when its test TPR and TNR both reach the configured',
    'minimum (default 0.8). The test pair labels hold 8 Pass and 6 Fail; the judge answers Pass on 7 of the 8',
    'Pass labels and Fail on all 6 Fail labels, so with validate-evaluator Step 3, TPR = 7/8 = 0.875 and',
    'TNR = 6/6 = 1.0, and the judge is validated. Both rules govern every one of the 14 tasks, so the pair',
    '(alpha-rule, beta-rule) is witnessed by all 14 tasks; judgy treats the witnessed verdicts as the',
    'unlabelled sample, so p_obs = judge Pass share among witnessed verdicts = 7/14 = 0.5. The Rogan-Gladen',
    'correction (validate-evaluator Step 7, judgy estimate_success_rate) is theta = (p_obs + TNR - 1) /',
    '(TPR + TNR - 1) = (0.5 + 1.0 - 1) / (0.875 + 1.0 - 1) = 0.5 / 0.875 = 4/7, already inside [0, 1] so',
    'the clip does not move it. Every count is dyadic, so the hand value 4/7 is the exact IEEE double the',
    'oracle computes. Product plan R11: a validated judge returning Fail on a witnessed pair fails the run,',
    'and 7 witnessed verdicts are Fail, so the exit code is 1.',
  ].join(' '),
}

export const bootstrapIntervalAnchor: BootstrapIntervalAnchor = {
  name: 'seeded-bootstrap-interval',
  world: judgedPairWorld,
  seed: 42,
  confidence: 0.95,
  lower: undefined,
  upper: undefined,
  pinnedFromProduct: true,
  derivation: [
    'judgy estimate_success_rate computes the interval by resampling the test labels with replacement, holding',
    'the observed rate fixed, skipping resamples with one class or TPR + TNR <= 1, and taking the alpha/2 and',
    '1 - alpha/2 percentiles of the clipped bootstrap thetas (defaults 20000 iterations, confidence 0.95). The',
    "exact bounds depend on the resample stream: judgy draws through numpy's global PRNG, while the product",
    'port uses its own seeded generator whose algorithm the product plan KTD4 leaves to the implementation, and',
    'this oracle reports point estimates only (rebuild plan KTD5 keeps interval checks as relations plus one',
    "pinned anchor). Neither a hand derivation nor an independent recomputation can settle the product's",
    'bounds, so the expected lower and upper bounds must be pinned from the product by Main and are marked',
    'pinnedFromProduct; once pinned they must lie in [0, 1] and contain the corrected rate 4/7.',
  ].join(' '),
}

export const anchorWorlds: ReadonlyArray<{ readonly name: string; readonly world: World }> = [
  { name: scoredRuleAnchor.name, world: scoredRuleAnchor.world },
  { name: insufficientEvidenceAnchor.name, world: insufficientEvidenceAnchor.world },
  { name: validatedJudgeAnchor.name, world: validatedJudgeAnchor.world },
  { name: bootstrapIntervalAnchor.name, world: bootstrapIntervalAnchor.world },
]
