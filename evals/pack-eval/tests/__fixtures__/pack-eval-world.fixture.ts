import { dual } from 'effect/Function'

/**
 * One description of a pack-eval test world, as plain data.
 *
 * A world is everything a pack-eval run reads and everything its providers say:
 * the pack rule files, the dataset files (selector instruction, tasks, routing
 * labels, pair labels, judge prompt), the discovery inputs (dimensions,
 * candidates), the recorded selection traces, the fingerprint checkout, and the
 * scripted answers per provider role (selector, judge, task generator).
 *
 * This module imports no pack-eval module — the oracle fixture reads the world
 * directly (R4), and only the interpreters that build pack-eval commands import
 * `@systemfsoftware/pack-eval`. Its one import is `dual`, so the modifiers take a
 * data-last form beside the data-first one.
 *
 * Two contracts the rest of the suite leans on:
 *
 * - `intended` is the refusal the world was built to hold, or `'admissible'`
 *   when the world is clean. The generated population (see
 *   `pack-eval-world-arbitrary.fixture.ts`) and the named builders both carry
 *   it, so a check can compare it with what the product does (R3).
 * - The world's task texts, pack ids, rule stems, and planted bodies are the
 *   strings a provider request carries. They are unique and none contains
 *   another, so the loopback can find a request's question by locating them in
 *   the request text (KTD7). `hasDistinctMatchableStrings` states that
 *   property.
 */

/**
 * The refusal a world was built to hold, or `'admissible'`.
 *
 * - `'renamed-rule'`: a rule file kept its content but changed its stem, while
 *   the routing labels still name the old stem.
 * - `'malformed-rule'`: a rule file holds text that is not `---` frontmatter,
 *   so reading its pack refuses.
 * - `'missing-rule-label'`: a routing label names a stem no rule in the pack
 *   holds.
 * - `'provider-refusal'`: a provider answers a request with a failure.
 * - `'missing-judge-prompt'`: pair labels are present while the judge prompt
 *   is absent.
 * - `'unwitnessed-pair'`: a pair label names a pair no task's labels govern
 *   together.
 */
export type RefusalKind =
  | 'admissible'
  | 'renamed-rule'
  | 'malformed-rule'
  | 'missing-rule-label'
  | 'provider-refusal'
  | 'missing-judge-prompt'
  | 'unwitnessed-pair'

export const refusalKinds: ReadonlyArray<RefusalKind> = [
  'admissible',
  'renamed-rule',
  'malformed-rule',
  'missing-rule-label',
  'provider-refusal',
  'missing-judge-prompt',
  'unwitnessed-pair',
]

export type WorldTaskSplit = 'dev' | 'test'
export type WorldPairSplit = 'train' | 'dev' | 'test'
export type WorldVerdict = 'Pass' | 'Fail'
type WorldPairOrigin = 'observed' | 'planted'
type WorldProviderRole = 'selector' | 'judge' | 'generator'

/** A rule file as the pack directory holds it. */
export interface WorldRuleFile {
  readonly stem: string
  readonly title: string
  readonly appliesWhen: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
  readonly body: string
  /**
   * When true the file is written as text that is not `---` frontmatter — the
   * fields above stay the rule the fixture author meant, but the file cannot be
   * read back into a rule.
   */
  readonly malformed?: boolean | undefined
}

export interface WorldPack {
  readonly id: string
  readonly rules: ReadonlyArray<WorldRuleFile>
}

export interface WorldInstruction {
  readonly text: string
  readonly consumer: string
  readonly pluginVersion: string
  readonly sourcePath: string
}

export interface WorldTask {
  readonly id: string
  readonly text: string
  readonly split: WorldTaskSplit
  readonly dimensions: Readonly<Record<string, string>>
}

export interface WorldRoutingEntry {
  readonly taskId: string
  readonly packId: string
  readonly governing: ReadonlyArray<string>
  readonly deferred: ReadonlyArray<string>
}

export interface WorldPairLabel {
  readonly id: string
  readonly taskId: string
  readonly packId: string
  /** The pair's stems, ascending. */
  readonly ruleA: string
  readonly ruleB: string
  readonly split: WorldPairSplit
  readonly verdict: WorldVerdict
  readonly origin: WorldPairOrigin
  readonly notes: string
  /** A replacement for rule B's body; only planted labels carry one. */
  readonly plantedBody?: string | undefined
}

export interface WorldJudgePrompt {
  readonly criterion: string
  readonly passDefinition: string
  readonly failDefinition: string
  readonly fewShotPairIds: ReadonlyArray<string>
}

export type WorldTuple = Readonly<Record<string, string>>

export interface WorldDimension {
  readonly name: string
  readonly captures: string
  readonly values: ReadonlyArray<string>
}

/** The discovery dimensions file: the dimensions the owner wrote, or raw text. */
type WorldDimensions =
  | Readonly<{
    readonly kind: 'described'
    readonly application: string
    readonly dimensions: ReadonlyArray<WorldDimension>
    readonly seeds: ReadonlyArray<WorldTuple>
  }>
  | Readonly<{ readonly kind: 'raw'; readonly text: string }>

interface WorldCandidate {
  readonly id: string
  readonly text: string
  readonly dimensions: WorldTuple
}

/** A recorded selection run, as the work directory holds it. */
interface WorldTrace {
  readonly taskId: string
  readonly packId: string
  readonly loadedStems: ReadonlyArray<string>
  readonly requestedModel: string
  readonly servedModel: string
  readonly instructionDigest: string
  readonly rawResponse: string
}

/** A file inside the fingerprint checkout, at a path relative to its base. */
interface WorldCheckoutFile {
  readonly path: string
  readonly content: string
}

interface WorldCheckout {
  readonly codeFiles: ReadonlyArray<WorldCheckoutFile>
  readonly lockfileText: string
  /** Files written beside the inputs; the fingerprint never digests them. */
  readonly outsideFiles: ReadonlyArray<WorldCheckoutFile>
}

export interface WorldProviderRefusal {
  readonly status: number
  readonly message: string
}

export type WorldSelectorReply =
  | Readonly<{
    readonly kind: 'selected'
    readonly taskId: string
    readonly packId: string
    readonly stems: ReadonlyArray<string>
    readonly servedModel: string
  }>
  | Readonly<{
    readonly kind: 'refused'
    readonly taskId: string
    readonly packId: string
    readonly refusal: WorldProviderRefusal
  }>

/** One judge question: a task, a pack, a rule pair, and rule B's served body. */
export interface WorldJudgeQuestion {
  readonly packId: string
  readonly taskId: string
  /** The pair's stems, ascending. */
  readonly ruleA: string
  readonly ruleB: string
  readonly plantedBody: string | undefined
}

export type WorldJudgeReply =
  | Readonly<{
    readonly kind: 'judged'
    readonly question: WorldJudgeQuestion
    readonly verdict: WorldVerdict
    readonly critique: string
    readonly servedModel: string
  }>
  | Readonly<{
    readonly kind: 'refused'
    readonly question: WorldJudgeQuestion
    readonly refusal: WorldProviderRefusal
  }>

export type WorldGeneratorTaskReply = Readonly<{ readonly tuple: WorldTuple; readonly text: string }>

type WorldGeneratorReply =
  | Readonly<{
    readonly kind: 'proposed'
    readonly proposedTuples: ReadonlyArray<WorldTuple>
    readonly writtenTasks: ReadonlyArray<WorldGeneratorTaskReply>
  }>
  | Readonly<{ readonly kind: 'refused'; readonly refusal: WorldProviderRefusal }>

/** The scripted answers, one list per provider role. */
interface WorldAnswers {
  readonly selector: ReadonlyArray<WorldSelectorReply>
  readonly judge: ReadonlyArray<WorldJudgeReply>
  readonly generator: WorldGeneratorReply
}

export interface World {
  readonly intended: RefusalKind
  readonly packs: ReadonlyArray<WorldPack>
  readonly instruction: WorldInstruction | undefined
  readonly tasks: ReadonlyArray<WorldTask>
  readonly routingLabels: ReadonlyArray<WorldRoutingEntry>
  readonly pairLabels: ReadonlyArray<WorldPairLabel>
  readonly judgePrompt: WorldJudgePrompt | undefined
  readonly dimensions: WorldDimensions | undefined
  readonly candidates: ReadonlyArray<WorldCandidate>
  readonly traces: ReadonlyArray<WorldTrace>
  readonly checkout: WorldCheckout
  readonly answers: WorldAnswers
}

/** The typed fields a builder or a check may override on a world. */
export type WorldOverrides = Readonly<Partial<World>>

const ascendingOfImpl = (left: string, right: string): number => Number(left > right) - Number(left < right)

/** Ascending string order, for `Array.prototype.toSorted`. */
export const ascendingOf: {
  (right: string): (left: string) => number
  (left: string, right: string): number
} = dual(2, ascendingOfImpl)

/**
 * The key-join the suite compares keys with: the separator is the escape
 * `'\u0000'`, never a literal NUL byte, so no key can be split by a world
 * string that holds a NUL.
 */
export const keyOf = (...parts: ReadonlyArray<string>): string => parts.join('\u0000')

/** Distinct strings, ascending. */
export const distinctSorted = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values)].toSorted(ascendingOf)

const headOf = <T>(values: ReadonlyArray<T>, fallback: T): T => values.find(() => true) ?? fallback

export const stemPairsOf = (pack: WorldPack): ReadonlyArray<readonly [string, string]> => {
  const stems = distinctSorted(pack.rules.map((rule) => rule.stem))
  return stems.flatMap((ruleA, index) => stems.slice(index + 1).map((ruleB) => [ruleA, ruleB] as const))
}

const governingStemsOf = (world: World, packId: string, taskId: string): ReadonlyArray<string> =>
  world.routingLabels
    .filter((entry) => entry.packId === packId && entry.taskId === taskId)
    .flatMap((entry) => entry.governing)

/** The pair's two stems do not both govern the task. */
const governsBothOf = (world: World, packId: string, taskId: string, ruleA: string, ruleB: string): boolean => {
  const governed = governingStemsOf(world, packId, taskId)
  return governed.includes(ruleA) && governed.includes(ruleB)
}

interface WorldWitnessedPair {
  readonly packId: string
  readonly ruleA: string
  readonly ruleB: string
  readonly taskIds: ReadonlyArray<string>
}

/**
 * Every stem pair some task's labels govern together, per pack and ascending —
 * the world's own definition of a witnessed pair. A pair that is absent here is
 * unwitnessed, whatever the pair labels say.
 */
export const witnessedPairsOf = (world: World): ReadonlyArray<WorldWitnessedPair> =>
  world.packs.flatMap((pack) =>
    stemPairsOf(pack).flatMap(([ruleA, ruleB]) => {
      const taskIds = world.tasks
        .map((task) => task.id)
        .filter((taskId) => governsBothOf(world, pack.id, taskId, ruleA, ruleB))
      return taskIds.length === 0 ? [] : [{ packId: pack.id, ruleA, ruleB, taskIds }]
    })
  )

/** The world's own strings a provider request may carry (KTD7). */
const matchableStringsOf = (world: World): ReadonlyArray<string> => [
  ...world.tasks.map((task) => task.text),
  ...world.packs.map((pack) => pack.id),
  ...world.packs.flatMap((pack) => pack.rules.map((rule) => rule.stem)),
  ...world.pairLabels.flatMap((label) => (label.plantedBody === undefined ? [] : [label.plantedBody])),
]

export const hasDistinctMatchableStrings = (world: World): boolean => {
  const strings = matchableStringsOf(world)
  if (new Set(strings).size !== strings.length) return false
  return strings.every((value, index) =>
    strings.every((other, otherIndex) => index === otherIndex || other.includes(value) === false)
  )
}

export const ruleTextOf = (rule: WorldRuleFile): string =>
  rule.malformed === true
    ? 'not frontmatter at all\n'
    : [
      '---',
      `title: ${rule.title}`,
      `applies_when: [${rule.appliesWhen.join(', ')}]`,
      `tags: [${rule.tags.join(', ')}]`,
      '---',
      '',
      rule.body,
      '',
    ].join('\n')

const emptyCheckout: WorldCheckout = { codeFiles: [], lockfileText: '', outsideFiles: [] }

const noRule: WorldRuleFile = { stem: 'ghost-rule', title: 'ghost rule', appliesWhen: [], tags: [], body: '' }
const noPack: WorldPack = { id: 'ghost-pack', rules: [noRule] }
const noTask: WorldTask = { id: 'ghost-task', text: 'ghost task', split: 'dev', dimensions: {} }

// ---------------------------------------------------------------------------
// The greenhouse world: an evaluate-shaped dataset with a judged pair. Three
// rules, five tasks, labels that witness the pruning/watering pair on two tasks
// and never witness the labelling rule, a train pair beside two test pairs the
// judge agrees with, and a selector that leaks the pruning rule.
// ---------------------------------------------------------------------------

export const plannerModel = 'acme/planner-large'
export const servedPlannerModel = 'acme/planner-large@acme'
export const servedJudgeModel = 'acme/judge-large@acme'

const instructionDigest = 'fixture-instruction-digest'

const greenhousePack: WorldPack = {
  id: 'greenhouse',
  rules: [
    {
      stem: 'watering-schedule',
      title: 'Water on a schedule',
      appliesWhen: ['touching the watering plan'],
      tags: ['water'],
      body: 'Water every second morning and write the amount in the log.',
    },
    {
      stem: 'prune-everything',
      title: 'Prune after every walk-through',
      appliesWhen: ['walking the rows for any reason'],
      tags: ['prune'],
      body: 'Cut back every shoot that crossed the wire.',
    },
    {
      stem: 'seed-labelling',
      title: 'Label every seed tray',
      appliesWhen: ['writing the seed order'],
      tags: ['seed'],
      body: 'Write the variety and the sowing date on every tray.',
    },
  ],
}

export const greenhouseInstruction: WorldInstruction = {
  text: 'Load every rule whose applies_when matches the work the task describes.',
  consumer: 'greenkeeper',
  pluginVersion: '1.0.0',
  sourcePath: 'references/agents/greenkeeper.md',
}

const greenhouseTasks: ReadonlyArray<WorldTask> = [
  {
    id: 'task-trellis',
    text: 'Tie the tomato shoots to the trellis before the weekend',
    split: 'dev',
    dimensions: {},
  },
  { id: 'task-typo', text: 'Fix a typo in the diary README', split: 'dev', dimensions: {} },
  {
    id: 'task-harvest',
    text: 'Harvest the ripe tomatoes before they split',
    split: 'test',
    dimensions: {},
  },
  {
    id: 'task-transplant',
    text: 'Transplant the seedlings into the raised bed',
    split: 'test',
    dimensions: {},
  },
  { id: 'task-vent', text: 'Open the east vent after the morning walk', split: 'test', dimensions: {} },
]

const greenhouseRoutingLabels: ReadonlyArray<WorldRoutingEntry> = [
  {
    taskId: 'task-trellis',
    packId: 'greenhouse',
    governing: ['watering-schedule', 'prune-everything'],
    deferred: ['seed-labelling'],
  },
  {
    taskId: 'task-typo',
    packId: 'greenhouse',
    governing: [],
    deferred: ['watering-schedule', 'prune-everything', 'seed-labelling'],
  },
  {
    taskId: 'task-harvest',
    packId: 'greenhouse',
    governing: ['watering-schedule'],
    deferred: ['seed-labelling'],
  },
  {
    taskId: 'task-transplant',
    packId: 'greenhouse',
    governing: ['watering-schedule', 'prune-everything'],
    deferred: ['seed-labelling'],
  },
  {
    taskId: 'task-vent',
    packId: 'greenhouse',
    governing: ['prune-everything'],
    deferred: ['seed-labelling'],
  },
]

const greenhousePairLabels: ReadonlyArray<WorldPairLabel> = [
  {
    id: 'pair-train-walk',
    taskId: 'task-trellis',
    packId: 'greenhouse',
    ruleA: 'prune-everything',
    ruleB: 'watering-schedule',
    split: 'train',
    verdict: 'Pass',
    origin: 'observed',
    notes: 'one walk-through can satisfy both rules',
  },
  {
    id: 'pair-test-walk',
    taskId: 'task-trellis',
    packId: 'greenhouse',
    ruleA: 'prune-everything',
    ruleB: 'watering-schedule',
    split: 'test',
    verdict: 'Pass',
    origin: 'observed',
    notes: 'one walk-through can satisfy both rules',
  },
  {
    id: 'pair-test-clash',
    taskId: 'task-transplant',
    packId: 'greenhouse',
    ruleA: 'prune-everything',
    ruleB: 'watering-schedule',
    split: 'test',
    verdict: 'Fail',
    origin: 'observed',
    notes: 'the pruning cut removes the shoots the watering schedule keeps wet',
  },
]

export const greenhouseJudgePrompt: WorldJudgePrompt = {
  criterion: 'On this task, can one change satisfy both rules?',
  passDefinition: 'Pass: one change can satisfy both rules at once.',
  failDefinition: 'Fail: no single change satisfies both rules together.',
  fewShotPairIds: ['pair-train-walk'],
}

const greenhouseSelectorReplies: ReadonlyArray<WorldSelectorReply> = [
  {
    kind: 'selected',
    taskId: 'task-trellis',
    packId: 'greenhouse',
    stems: ['watering-schedule', 'prune-everything'],
    servedModel: servedPlannerModel,
  },
  { kind: 'selected', taskId: 'task-typo', packId: 'greenhouse', stems: [], servedModel: servedPlannerModel },
  {
    kind: 'selected',
    taskId: 'task-harvest',
    packId: 'greenhouse',
    stems: ['watering-schedule', 'prune-everything'],
    servedModel: servedPlannerModel,
  },
  {
    kind: 'selected',
    taskId: 'task-transplant',
    packId: 'greenhouse',
    stems: ['watering-schedule'],
    servedModel: servedPlannerModel,
  },
  {
    kind: 'selected',
    taskId: 'task-vent',
    packId: 'greenhouse',
    stems: ['prune-everything', 'seed-labelling'],
    servedModel: servedPlannerModel,
  },
]

const judgeQuestionOf = (taskId: string, plantedBody: string | undefined): WorldJudgeQuestion => ({
  packId: 'greenhouse',
  taskId,
  ruleA: 'prune-everything',
  ruleB: 'watering-schedule',
  plantedBody,
})

const greenhouseJudgeReplies: ReadonlyArray<WorldJudgeReply> = [
  {
    kind: 'judged',
    question: judgeQuestionOf('task-trellis', undefined),
    verdict: 'Pass',
    critique: 'one walk-through can satisfy both rules',
    servedModel: servedJudgeModel,
  },
  {
    kind: 'judged',
    question: judgeQuestionOf('task-transplant', undefined),
    verdict: 'Fail',
    critique: 'the pruning cut removes the shoots the watering schedule keeps wet',
    servedModel: servedJudgeModel,
  },
]

const noGenerator: WorldGeneratorReply = { kind: 'proposed', proposedTuples: [], writtenTasks: [] }

const noAnswers: WorldAnswers = {
  selector: greenhouseSelectorReplies,
  judge: greenhouseJudgeReplies,
  generator: noGenerator,
}

const tracesOf = (
  packId: string,
  replies: ReadonlyArray<WorldSelectorReply>,
): ReadonlyArray<WorldTrace> =>
  replies.flatMap((reply) =>
    reply.kind === 'selected'
      ? [{
        taskId: reply.taskId,
        packId,
        loadedStems: reply.stems,
        requestedModel: plannerModel,
        servedModel: reply.servedModel,
        instructionDigest,
        rawResponse: JSON.stringify({ loaded: reply.stems }),
      }]
      : []
  )

const hasOwn = (overrides: WorldOverrides, key: keyof WorldOverrides): boolean =>
  Object.prototype.hasOwnProperty.call(overrides, key)

/** Merge typed overrides onto a world, field by field, so nothing is dropped. */
const worldWith = (base: World, overrides: WorldOverrides): World => ({
  intended: hasOwn(overrides, 'intended') ? overrides.intended ?? base.intended : base.intended,
  packs: overrides.packs ?? base.packs,
  instruction: hasOwn(overrides, 'instruction') ? overrides.instruction : base.instruction,
  tasks: overrides.tasks ?? base.tasks,
  routingLabels: overrides.routingLabels ?? base.routingLabels,
  pairLabels: overrides.pairLabels ?? base.pairLabels,
  judgePrompt: hasOwn(overrides, 'judgePrompt') ? overrides.judgePrompt : base.judgePrompt,
  dimensions: hasOwn(overrides, 'dimensions') ? overrides.dimensions : base.dimensions,
  candidates: overrides.candidates ?? base.candidates,
  traces: overrides.traces ?? base.traces,
  checkout: overrides.checkout ?? base.checkout,
  answers: overrides.answers ?? base.answers,
})

/**
 * The evaluate area's world: the greenhouse pack, its tasks, sparse labels, the
 * judged pair, a judge prompt with one train example, and a scripted answer for
 * every question the world asks.
 */
export const evaluateWorld = (overrides?: WorldOverrides): World =>
  worldWith({
    intended: 'admissible',
    packs: [greenhousePack],
    instruction: greenhouseInstruction,
    tasks: greenhouseTasks,
    routingLabels: greenhouseRoutingLabels,
    pairLabels: greenhousePairLabels,
    judgePrompt: greenhouseJudgePrompt,
    dimensions: undefined,
    candidates: [],
    traces: [],
    checkout: emptyCheckout,
    answers: noAnswers,
  }, overrides ?? {})

// ---------------------------------------------------------------------------
// The contradiction judge area's world: two rules that clash on one task, and a
// train pair the judge's prompt remembers.
// ---------------------------------------------------------------------------

const ripeningPack: WorldPack = {
  id: 'ripening-room',
  rules: [
    {
      stem: 'hourly-venting',
      title: 'Vent the ripening room hourly',
      appliesWhen: ['cooling the ripening room'],
      tags: ['air'],
      body: 'Vent the room every hour while the fruit ripens.',
    },
    {
      stem: 'sealed-ripening',
      title: 'Seal the room while fruit ripens',
      appliesWhen: ['holding fruit in the room'],
      tags: ['air'],
      body: 'Keep every vent sealed while the room holds fruit.',
    },
  ],
}

const ripeningTask: WorldTask = {
  id: 'task-cool',
  text: 'Cool the ripening room before the weekend',
  split: 'dev',
  dimensions: {},
}

const ripeningClashNotes =
  'the bodies order opposite vent settings for the same room, so no single change satisfies both'

const ripeningPair = (id: string, split: WorldPairSplit): WorldPairLabel => ({
  id,
  taskId: 'task-cool',
  packId: 'ripening-room',
  ruleA: 'hourly-venting',
  ruleB: 'sealed-ripening',
  split,
  verdict: 'Fail',
  origin: 'observed',
  notes: ripeningClashNotes,
})

/** A world whose judge prompt carries the remembered clash as a few-shot example. */
export const contradictionJudgeWorld = (overrides?: WorldOverrides): World =>
  worldWith({
    intended: 'admissible',
    packs: [ripeningPack],
    instruction: greenhouseInstruction,
    tasks: [ripeningTask],
    routingLabels: [{
      taskId: 'task-cool',
      packId: 'ripening-room',
      governing: ['hourly-venting', 'sealed-ripening'],
      deferred: [],
    }],
    pairLabels: [ripeningPair('pair-seen', 'train'), ripeningPair('pair-test-clash', 'test')],
    judgePrompt: {
      criterion: 'On this task, can one change satisfy both rules?',
      passDefinition: 'Pass: one change can satisfy both rules at once.',
      failDefinition: 'Fail: no single change satisfies both rules together.',
      fewShotPairIds: ['pair-seen'],
    },
    dimensions: undefined,
    candidates: [],
    traces: [],
    checkout: emptyCheckout,
    answers: {
      selector: [{
        kind: 'selected',
        taskId: 'task-cool',
        packId: 'ripening-room',
        stems: ['hourly-venting'],
        servedModel: servedPlannerModel,
      }],
      judge: [{
        kind: 'judged',
        question: {
          packId: 'ripening-room',
          taskId: 'task-cool',
          ruleA: 'hourly-venting',
          ruleB: 'sealed-ripening',
          plantedBody: undefined,
        },
        verdict: 'Fail',
        critique: ripeningClashNotes,
        servedModel: servedJudgeModel,
      }],
      generator: noGenerator,
    },
  }, overrides ?? {})

// ---------------------------------------------------------------------------
// The rule selector area's world: one pack, one task, one answer.
// ---------------------------------------------------------------------------

/** A world small enough to ask the selector about a single (task, pack) cell. */
export const ruleSelectorWorld = (overrides?: WorldOverrides): World =>
  worldWith(
    evaluateWorld({
      packs: [{ id: 'greenhouse', rules: greenhousePack.rules.slice(0, 2) }],
      tasks: greenhouseTasks.slice(0, 1),
      routingLabels: [],
      pairLabels: [],
      judgePrompt: undefined,
    }),
    overrides ?? {},
  )

// ---------------------------------------------------------------------------
// The discovery area's world: owner dimensions, a generator script, candidates.
// ---------------------------------------------------------------------------

const describedDimensions: WorldDimensions = {
  kind: 'described',
  application: 'a greenhouse diary',
  dimensions: [
    { name: 'job', captures: 'the work being done', values: ['watering', 'pruning', 'feeding'] },
    { name: 'pace', captures: 'how the day is going', values: ['steady', 'rushed'] },
  ],
  seeds: [{ job: 'watering', pace: 'steady' }],
}

const discoveryGenerator: WorldGeneratorReply = {
  kind: 'proposed',
  proposedTuples: [{ job: 'pruning', pace: 'rushed' }, { job: 'feeding', pace: 'steady' }],
  writtenTasks: [
    { tuple: { job: 'pruning', pace: 'rushed' }, text: 'Prune the tomato shoots before the weekend' },
    { tuple: { job: 'feeding', pace: 'steady' }, text: 'Feed the beds on Friday morning' },
  ],
}

interface DiscoveryWorldOptions {
  readonly dimensions?: WorldDimensions | undefined
  readonly generator?: WorldGeneratorReply | undefined
}

/** A world that carries the owner's dimensions and a scripted task generator. */
export const discoveryWorld = (options?: DiscoveryWorldOptions): World =>
  worldWith(evaluateWorld(), {
    dimensions: options?.dimensions ?? describedDimensions,
    candidates: [],
    answers: {
      selector: greenhouseSelectorReplies,
      judge: greenhouseJudgeReplies,
      generator: options?.generator ?? discoveryGenerator,
    },
  })

// ---------------------------------------------------------------------------
// The review area's world: candidates waiting for a verdict, plus the traces the
// selector already wrote.
// ---------------------------------------------------------------------------

const reviewCandidates: ReadonlyArray<WorldCandidate> = [
  { id: 'candidate-hoe', text: 'Hoe the beds before the weekend', dimensions: { job: 'feeding', pace: 'steady' } },
  {
    id: 'candidate-vent',
    text: 'Close the vents after the last walk-through',
    dimensions: { job: 'watering', pace: 'rushed' },
  },
]

/** A world whose work directory already holds candidates and selection traces. */
export const reviewWorld = (overrides?: WorldOverrides): World =>
  worldWith(
    evaluateWorld({
      candidates: reviewCandidates,
      traces: tracesOf('greenhouse', greenhouseSelectorReplies),
    }),
    overrides ?? {},
  )

// ---------------------------------------------------------------------------
// The fingerprint area's world: the same dataset beside the evaluator's code and
// lockfile, with one named input change per current-suite variant.
// ---------------------------------------------------------------------------

const fingerprintCheckout: WorldCheckout = {
  codeFiles: [
    { path: 'code/src/evaluate.ts', content: 'export const evaluate = 1\n' },
    { path: 'code/src/drivers/score.ts', content: 'export const score = 2\n' },
  ],
  lockfileText: 'lockfileVersion: 9.0\n',
  outsideFiles: [],
}

const outsideCheckoutFiles: ReadonlyArray<WorldCheckoutFile> = [
  { path: 'code/README.md', content: 'a note nobody digests\n' },
  { path: 'dataset/notes.txt', content: 'owner scratch, not an input\n' },
]

export interface FingerprintMutation {
  /** Water every morning instead of every second morning. */
  readonly ruleBody?: boolean | undefined
  /** One routing label entry short of the western world's labels. */
  readonly routingLabels?: boolean | undefined
  /** The instruction asks the selector to be generous. */
  readonly instruction?: boolean | undefined
  /** The criterion asks the judge to count the shoots too. */
  readonly judgePrompt?: boolean | undefined
  /** The test pass label's notes read differently. */
  readonly pairLabel?: boolean | undefined
  /** Files written beside the fingerprint inputs. */
  readonly outsideFile?: boolean | undefined
}

interface FingerprintWorldOptions {
  readonly mutation?: FingerprintMutation | undefined
}

const withChangedRuleBody = (world: World): World =>
  worldWith(world, {
    packs: world.packs.map((pack) => ({
      ...pack,
      rules: pack.rules.map((rule) =>
        rule.stem === 'watering-schedule'
          ? { ...rule, body: 'Water every morning and write the amount in the log.' }
          : rule
      ),
    })),
  })

const withShortenedRoutingLabels = (world: World): World =>
  worldWith(world, { routingLabels: world.routingLabels.slice(0, Math.max(world.routingLabels.length - 1, 0)) })

const withGenerousInstruction = (world: World): World =>
  world.instruction === undefined
    ? world
    : worldWith(world, { instruction: { ...world.instruction, text: `${world.instruction.text} Be generous.` } })

const withShootCountingJudgePrompt = (world: World): World =>
  world.judgePrompt === undefined
    ? world
    : worldWith(world, {
      judgePrompt: { ...world.judgePrompt, criterion: `${world.judgePrompt.criterion} Count the shoots too.` },
    })

const withRewordedPairLabel = (world: World): World =>
  worldWith(world, {
    pairLabels: world.pairLabels.map((label) =>
      label.id === 'pair-test-walk'
        ? { ...label, notes: 'the walk-through satisfies both rules twice over' }
        : label
    ),
  })

/** A world whose fingerprint inputs are a pack, a dataset, code, and a lockfile. */
export const fingerprintWorld = (options?: FingerprintWorldOptions): World => {
  const checkout: WorldCheckout = options?.mutation?.outsideFile === true
    ? { ...fingerprintCheckout, outsideFiles: outsideCheckoutFiles }
    : fingerprintCheckout
  return [
    options?.mutation?.ruleBody === true ? withChangedRuleBody : undefined,
    options?.mutation?.routingLabels === true ? withShortenedRoutingLabels : undefined,
    options?.mutation?.instruction === true ? withGenerousInstruction : undefined,
    options?.mutation?.judgePrompt === true ? withShootCountingJudgePrompt : undefined,
    options?.mutation?.pairLabel === true ? withRewordedPairLabel : undefined,
  ].flatMap((change) => (change === undefined ? [] : [change]))
    .reduce((world, change) => change(world), evaluateWorld({ checkout }))
}

// ---------------------------------------------------------------------------
// The tune-judge area's world: train examples that ride along, dev pairs that are
// judged, and a test pair that is not.
// ---------------------------------------------------------------------------

const ventingPack: WorldPack = {
  id: 'venting-room',
  rules: [
    {
      stem: 'hourly-venting',
      title: 'Vent the ripening room hourly',
      appliesWhen: ['cooling the ripening room'],
      tags: ['air'],
      body: 'Open the vents for one hour in every three.',
    },
    {
      stem: 'sealed-ripening',
      title: 'Seal the room while fruit ripens',
      appliesWhen: ['holding fruit in the room'],
      tags: ['air'],
      body: 'Keep every vent sealed while the room holds fruit.',
    },
  ],
}

const ventingPairs: ReadonlyArray<readonly [string, WorldTaskSplit]> = [
  ['task-train-venting', 'dev'],
  ['task-dev-trellis', 'dev'],
  ['task-dev-harvest', 'dev'],
  ['task-dev-mulch', 'dev'],
  ['task-dev-compost', 'dev'],
  ['task-test-vent', 'test'],
]

const ventingTasks: ReadonlyArray<WorldTask> = [
  {
    id: 'task-train-venting',
    text: 'TRAIN task: cool the ripening room before the weekend',
    split: 'dev',
    dimensions: {},
  },
  { id: 'task-dev-trellis', text: 'DEV-A task: tie the tomato shoots to the trellis', split: 'dev', dimensions: {} },
  { id: 'task-dev-harvest', text: 'DEV-B task: harvest the ripe tomatoes', split: 'dev', dimensions: {} },
  { id: 'task-dev-mulch', text: 'DEV-C task: mulch the raised bed before noon', split: 'dev', dimensions: {} },
  { id: 'task-dev-compost', text: 'DEV-D task: turn the compost heap at dusk', split: 'dev', dimensions: {} },
  { id: 'task-test-vent', text: 'TEST task: open the east vent after the morning walk', split: 'test', dimensions: {} },
]

const ventingPlant = 'Seal every vent and hold it open while the room holds fruit.'

const ventingPair = (options: {
  readonly id: string
  readonly taskId: string
  readonly split: WorldPairSplit
  readonly verdict: WorldVerdict
  readonly origin: WorldPairOrigin
  readonly notes: string
  readonly plantedBody?: string | undefined
}): WorldPairLabel => ({
  id: options.id,
  taskId: options.taskId,
  packId: 'venting-room',
  ruleA: 'hourly-venting',
  ruleB: 'sealed-ripening',
  split: options.split,
  verdict: options.verdict,
  origin: options.origin,
  notes: options.notes,
  ...(options.plantedBody === undefined ? {} : { plantedBody: options.plantedBody }),
})

const ventingJudgeQuestion = (taskId: string, plantedBody: string | undefined): WorldJudgeQuestion => ({
  packId: 'venting-room',
  taskId,
  ruleA: 'hourly-venting',
  ruleB: 'sealed-ripening',
  plantedBody,
})

const ventingJudge = (
  taskId: string,
  verdict: WorldVerdict,
  critique: string,
  plantedBody: string | undefined,
): WorldJudgeReply => ({
  kind: 'judged',
  question: ventingJudgeQuestion(taskId, plantedBody),
  verdict,
  critique,
  servedModel: servedJudgeModel,
})

const ventingCritiqueClash = 'hourly-venting opens the vents the sealed rule keeps shut.'
const ventingCritiqueFit = 'the work never touches the vents, so both rules hold.'

/** A world whose dev pairs are judged while its train pair rides along inside. */
export const tuneJudgeWorld = (overrides?: WorldOverrides): World =>
  worldWith({
    intended: 'admissible',
    packs: [ventingPack],
    instruction: greenhouseInstruction,
    tasks: ventingTasks,
    routingLabels: ventingPairs.map(([taskId]) => ({
      taskId,
      packId: 'venting-room',
      governing: ['hourly-venting', 'sealed-ripening'],
      deferred: [],
    })),
    pairLabels: [
      ventingPair({
        id: 'pair-train-observed',
        taskId: 'task-train-venting',
        split: 'train',
        verdict: 'Fail',
        origin: 'observed',
        notes: 'the hourly vents and the sealed room cannot both hold, so no single change satisfies both rules',
      }),
      ventingPair({
        id: 'pair-train-planted',
        taskId: 'task-train-venting',
        split: 'train',
        verdict: 'Fail',
        origin: 'planted',
        notes: 'the sealed order and the hourly order contradict each other on the same vents',
        plantedBody: ventingPlant,
      }),
      ventingPair({
        id: 'pair-dev-trellis',
        taskId: 'task-dev-trellis',
        split: 'dev',
        verdict: 'Pass',
        origin: 'observed',
        notes: ventingCritiqueFit,
      }),
      ventingPair({
        id: 'pair-dev-harvest',
        taskId: 'task-dev-harvest',
        split: 'dev',
        verdict: 'Pass',
        origin: 'observed',
        notes: ventingCritiqueFit,
      }),
      ventingPair({
        id: 'pair-dev-mulch',
        taskId: 'task-dev-mulch',
        split: 'dev',
        verdict: 'Fail',
        origin: 'observed',
        notes: ventingCritiqueClash,
      }),
      ventingPair({
        id: 'pair-dev-compost',
        taskId: 'task-dev-compost',
        split: 'dev',
        verdict: 'Pass',
        origin: 'observed',
        notes: ventingCritiqueFit,
      }),
      ventingPair({
        id: 'pair-test-vent',
        taskId: 'task-test-vent',
        split: 'test',
        verdict: 'Fail',
        origin: 'observed',
        notes: ventingCritiqueClash,
      }),
    ],
    judgePrompt: {
      criterion: 'On this task, can one change satisfy both rules?',
      passDefinition: 'Pass: one change can satisfy both rules at once.',
      failDefinition: 'Fail: no single change satisfies both rules together.',
      fewShotPairIds: ['pair-train-observed', 'pair-train-planted'],
    },
    dimensions: undefined,
    candidates: [],
    traces: [],
    checkout: emptyCheckout,
    answers: {
      selector: ventingTasks.map((task) => ({
        kind: 'selected' as const,
        taskId: task.id,
        packId: 'venting-room',
        stems: [],
        servedModel: servedPlannerModel,
      })),
      judge: [
        ventingJudge('task-dev-trellis', 'Fail', ventingCritiqueClash, undefined),
        ventingJudge('task-dev-harvest', 'Pass', ventingCritiqueFit, undefined),
        ventingJudge('task-dev-mulch', 'Fail', ventingCritiqueClash, undefined),
        ventingJudge('task-dev-compost', 'Pass', ventingCritiqueFit, undefined),
        ventingJudge('task-train-venting', 'Fail', ventingCritiqueClash, undefined),
        ventingJudge('task-train-venting', 'Pass', ventingCritiqueFit, ventingPlant),
        ventingJudge('task-test-vent', 'Fail', ventingCritiqueClash, undefined),
      ],
      generator: noGenerator,
    },
  }, overrides ?? {})

// ---------------------------------------------------------------------------
// The modifiers. Each one changes only what it names, and states the refusal the
// changed world is built to hold.
// ---------------------------------------------------------------------------

const labelNamedStems = (world: World): ReadonlyArray<string> =>
  distinctSorted(world.routingLabels.flatMap((entry) => [...entry.governing, ...entry.deferred]))

const pairNamedStems = (world: World): ReadonlyArray<string> =>
  distinctSorted(world.pairLabels.flatMap((label) => [label.ruleA, label.ruleB]))

interface RenameRuleOptions {
  readonly stem?: string | undefined
  readonly renamedTo?: string | undefined
}

const renamedRuleImpl = (world: World, options: RenameRuleOptions): World => {
  const named = labelNamedStems(world)
  const pairNames = pairNamedStems(world)
  const candidates = world.packs.flatMap((pack) => pack.rules.map((rule) => ({ pack, rule })))
  const target = options.stem === undefined
    ? candidates.find((candidate) =>
      named.includes(candidate.rule.stem) && pairNames.includes(candidate.rule.stem) === false
    )
    : candidates.find((candidate) => candidate.rule.stem === options.stem)
  const chosen = target ?? headOf(candidates, { pack: noPack, rule: noRule })
  const renamedTo = options.renamedTo ?? `${chosen.rule.stem}-renamed`
  return worldWith(world, {
    intended: 'renamed-rule',
    packs: world.packs.map((pack) =>
      pack.id === chosen.pack.id
        ? {
          ...pack,
          rules: pack.rules.map((rule) => (rule.stem === chosen.rule.stem ? { ...rule, stem: renamedTo } : rule)),
        }
        : pack
    ),
  })
}

/**
 * Rename a rule file the routing labels name, so the labels name a stem the pack
 * no longer holds. The stem is chosen among the label-named stems no pair label
 * names, so the label refusal stays the first one the run reaches.
 */
export const withRenamedRule: {
  (options: RenameRuleOptions): (world: World) => World
  (world: World, options: RenameRuleOptions): World
} = dual(2, renamedRuleImpl)

interface MalformedRuleOptions {
  readonly stem?: string | undefined
}

const malformedRuleImpl = (world: World, options: MalformedRuleOptions): World => {
  const named = labelNamedStems(world)
  const candidates = world.packs.flatMap((pack) => pack.rules)
  const target = options.stem === undefined
    ? headOf(candidates.filter((rule) => named.includes(rule.stem)), noRule)
    : headOf(candidates.filter((rule) => rule.stem === options.stem), noRule)
  return worldWith(world, {
    intended: 'malformed-rule',
    packs: world.packs.map((pack) => ({
      ...pack,
      rules: pack.rules.map((rule) => (rule.stem === target.stem ? { ...rule, malformed: true } : rule)),
    })),
  })
}

/** Mark a rule file as text that cannot be read back, so its pack refuses. */
export const withMalformedRule: {
  (options: MalformedRuleOptions): (world: World) => World
  (world: World, options: MalformedRuleOptions): World
} = dual(2, malformedRuleImpl)

interface MissingRuleLabelOptions {
  readonly stem?: string | undefined
}

const labelNamingMissingRuleImpl = (world: World, options: MissingRuleLabelOptions): World => {
  const ghost = options.stem ?? 'missing-rule'
  return worldWith(world, {
    intended: 'missing-rule-label',
    routingLabels: world.routingLabels.map((entry, index) =>
      index === 0 ? { ...entry, deferred: [...entry.deferred, ghost] } : entry
    ),
  })
}

/** Add a stem no rule holds to the first routing label's deferred list. */
export const withLabelNamingMissingRule: {
  (options: MissingRuleLabelOptions): (world: World) => World
  (world: World, options: MissingRuleLabelOptions): World
} = dual(2, labelNamingMissingRuleImpl)

const unwitnessedTripleOf = (
  world: World,
): Readonly<{ packId: string; taskId: string; ruleA: string; ruleB: string }> | undefined =>
  world.packs
    .flatMap((pack) =>
      stemPairsOf(pack).flatMap(([ruleA, ruleB]) =>
        world.tasks.map((task) => ({ packId: pack.id, taskId: task.id, ruleA, ruleB }))
      )
    )
    .find((triple) => governsBothOf(world, triple.packId, triple.taskId, triple.ruleA, triple.ruleB) === false)

const unwitnessedPairLabel = (world: World): WorldPairLabel => {
  const found = unwitnessedTripleOf(world)
  if (found !== undefined) {
    return {
      id: 'pair-unwitnessed',
      taskId: found.taskId,
      packId: found.packId,
      ruleA: found.ruleA,
      ruleB: found.ruleB,
      split: 'test',
      verdict: 'Fail',
      origin: 'observed',
      notes: 'no task needs this pair together',
    }
  }
  const pack = headOf(world.packs, noPack)
  return {
    id: 'pair-unwitnessed',
    taskId: headOf(world.tasks, noTask).id,
    packId: pack.id,
    ruleA: headOf(pack.rules, noRule).stem,
    ruleB: 'ghost-rule',
    split: 'test',
    verdict: 'Fail',
    origin: 'observed',
    notes: 'no task needs this pair together',
  }
}

/** Append a pair label naming a pair no task's labels govern together. */
export const withUnwitnessedPair = (world: World): World =>
  worldWith(world, {
    intended: 'unwitnessed-pair',
    pairLabels: [...world.pairLabels, unwitnessedPairLabel(world)],
  })

export const withoutJudgePrompt = (world: World): World =>
  worldWith(world, { intended: 'missing-judge-prompt', judgePrompt: undefined })

interface ProviderRefusalTarget {
  readonly role?: WorldProviderRole | undefined
  readonly status?: number | undefined
  readonly message?: string | undefined
}

const refusalOf = (target: ProviderRefusalTarget): WorldProviderRefusal => ({
  status: target.status ?? 500,
  message: target.message ?? 'upstream is down',
})

const refusedSelectorReply = (reply: WorldSelectorReply, refusal: WorldProviderRefusal): WorldSelectorReply =>
  reply.kind === 'selected'
    ? { kind: 'refused', taskId: reply.taskId, packId: reply.packId, refusal }
    : reply

const refusedJudgeReply = (reply: WorldJudgeReply, refusal: WorldProviderRefusal): WorldJudgeReply =>
  reply.kind === 'judged' ? { kind: 'refused', question: reply.question, refusal } : reply

const providerRefusalImpl = (world: World, target: ProviderRefusalTarget): World => {
  const refusal = refusalOf(target)
  const role = target.role ?? 'selector'
  const answers: WorldAnswers = role === 'judge'
    ? {
      ...world.answers,
      judge: world.answers.judge.map((reply, index) => index === 0 ? refusedJudgeReply(reply, refusal) : reply),
    }
    : role === 'generator'
    ? { ...world.answers, generator: { kind: 'refused', refusal } }
    : {
      ...world.answers,
      selector: world.answers.selector.map((reply, index) =>
        index === 0 ? refusedSelectorReply(reply, refusal) : reply
      ),
    }
  return worldWith(world, { intended: 'provider-refusal', answers })
}

/**
 * Script a provider refusal for the role's first question. The default role is
 * the selector, which is the answer an evaluate run reaches first.
 */
export const withProviderRefusal: {
  (target: ProviderRefusalTarget): (world: World) => World
  (world: World, target: ProviderRefusalTarget): World
} = dual(2, providerRefusalImpl)
