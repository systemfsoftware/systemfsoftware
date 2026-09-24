import * as fc from 'fast-check'
import {
  greenhouseInstruction,
  greenhouseJudgePrompt,
  type RefusalKind,
  refusalKinds,
  routingLabelDensityOf,
  servedJudgeModel,
  servedPlannerModel,
  stemPairsOf,
  withLabelNamingMissingRule,
  withMalformedRule,
  withoutJudgePrompt,
  withProviderRefusal,
  withRenamedRule,
  withUnwitnessedPair,
  witnessedPairsOf,
  type World,
  type WorldJudgePrompt,
  type WorldJudgeQuestion,
  type WorldJudgeReply,
  type WorldPack,
  type WorldPairLabel,
  type WorldPairSplit,
  type WorldRoutingEntry,
  type WorldRuleFile,
  type WorldSelectorReply,
  type WorldTask,
  type WorldTaskSplit,
  type WorldVerdict,
} from './pack-eval-world.fixture.js'

interface EntryPlan {
  readonly taskIndex: number
  readonly packIndex: number
  readonly governingMask: number
  readonly deferredMask: number
}

interface WorldBlueprint {
  readonly ids: ReadonlyArray<number>
  readonly kind: RefusalKind
  readonly packCount: number
  readonly firstRuleCount: number
  readonly secondRuleCount: number
  readonly taskCount: number
  readonly devCount: number
  readonly dense: boolean
  readonly extraEntries: ReadonlyArray<EntryPlan>
  readonly loadedMasks: ReadonlyArray<number>
  readonly verdicts: ReadonlyArray<WorldVerdict>
  readonly pairSplits: ReadonlyArray<WorldPairSplit>
  readonly extraPairLabels: number
  readonly fewShotCount: number
}

const refusalKindArbitrary: fc.Arbitrary<RefusalKind> = fc.oneof(
  ...refusalKinds.map((kind) => ({
    weight: kind === 'admissible' ? 3 : 1,
    arbitrary: fc.constant(kind),
  })),
)

const entryPlanArbitrary: fc.Arbitrary<EntryPlan> = fc.record({
  taskIndex: fc.integer({ min: 0, max: 4 }),
  packIndex: fc.integer({ min: 0, max: 1 }),
  governingMask: fc.integer({ min: 0, max: 15 }),
  deferredMask: fc.integer({ min: 0, max: 15 }),
})

const blueprintArbitrary: fc.Arbitrary<WorldBlueprint> = fc.record({
  ids: fc.uniqueArray(fc.integer({ min: 0, max: 99_999_999 }), { minLength: 40, maxLength: 40 }),
  kind: refusalKindArbitrary,
  packCount: fc.integer({ min: 1, max: 2 }),
  firstRuleCount: fc.integer({ min: 3, max: 4 }),
  secondRuleCount: fc.integer({ min: 2, max: 4 }),
  taskCount: fc.integer({ min: 2, max: 5 }),
  devCount: fc.integer({ min: 0, max: 4 }),
  dense: fc.boolean(),
  extraEntries: fc.array(entryPlanArbitrary, { minLength: 4, maxLength: 4 }),
  loadedMasks: fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 10, maxLength: 10 }),
  verdicts: fc.array(fc.constantFrom<WorldVerdict>('Pass', 'Fail'), { minLength: 6, maxLength: 6 }),
  pairSplits: fc.array(fc.constantFrom<WorldPairSplit>('train', 'dev', 'test'), { minLength: 2, maxLength: 2 }),
  extraPairLabels: fc.integer({ min: 0, max: 2 }),
  fewShotCount: fc.integer({ min: 0, max: 1 }),
})

const pad = (value: number): string => String(value).padStart(7, '0')

const idAt = (blueprint: WorldBlueprint, slot: number): string => pad(blueprint.ids[slot] ?? slot)

const maskAt = (masks: ReadonlyArray<number>, index: number): number => masks[index % masks.length] ?? 0

const verdictAt = (verdicts: ReadonlyArray<WorldVerdict>, index: number): WorldVerdict =>
  verdicts[index % verdicts.length] ?? 'Pass'

const splitAt = (splits: ReadonlyArray<WorldPairSplit>, index: number): WorldPairSplit =>
  splits[index % splits.length] ?? 'test'

const pickOf = <T>(values: ReadonlyArray<T>, fallback: T) => (index: number): T =>
  values[index % values.length] ?? fallback

const stemsOfMask = (stems: ReadonlyArray<string>, mask: number): ReadonlyArray<string> =>
  stems.filter((stem, index) => (mask & (1 << index)) !== 0)

const stemsOfPack = (pack: WorldPack): ReadonlyArray<string> => pack.rules.map((rule) => rule.stem)

const ruleFileOf = (id: string): WorldRuleFile => ({
  stem: `rule-${id}`,
  title: `title-${id}`,
  appliesWhen: [`when-${id}`],
  tags: [`tag-${id}`],
  body: `body-${id} tells the pack how to act.`,
})

interface PackSpec {
  readonly id: string
  readonly rules: ReadonlyArray<WorldRuleFile>
}

const packSpecOf = (
  blueprint: WorldBlueprint,
  packSlot: number,
  ruleSlotBase: number,
  ruleCount: number,
): PackSpec => ({
  id: `pack-${idAt(blueprint, packSlot)}`,
  rules: Array.from({ length: ruleCount }, (_, index) => ruleFileOf(idAt(blueprint, ruleSlotBase + index))),
})

interface WitnessTriple {
  readonly packId: string
  readonly taskId: string
  readonly ruleA: string
  readonly ruleB: string
}

const ascendingPairOf = (left: string, right: string): readonly [string, string] =>
  left < right ? [left, right] : [right, left]

interface WorldParts {
  readonly packs: ReadonlyArray<PackSpec>
  readonly firstPack: PackSpec
  readonly tasks: ReadonlyArray<WorldTask>
  readonly firstTask: WorldTask
  readonly routingLabels: ReadonlyArray<WorldRoutingEntry>
  readonly selectorReplies: ReadonlyArray<WorldSelectorReply>
  readonly judgeReplies: ReadonlyArray<WorldJudgeReply>
}

const buildParts = (blueprint: WorldBlueprint): WorldParts => {
  const firstPack = packSpecOf(blueprint, 0, 2, blueprint.firstRuleCount)
  const secondPack = packSpecOf(blueprint, 1, 6, blueprint.secondRuleCount)
  const packs: ReadonlyArray<PackSpec> = blueprint.packCount === 2 ? [firstPack, secondPack] : [firstPack]
  const packAt = pickOf(packs, firstPack)

  const firstTask: WorldTask = {
    id: `task-${idAt(blueprint, 20)}`,
    text: `work-${idAt(blueprint, 20)} tends the beds`,
    split: 'dev',
    dimensions: {},
  }
  const restSplitAt = (index: number): WorldTaskSplit =>
    index < Math.min(blueprint.devCount, blueprint.taskCount - 1) ? 'dev' : 'test'
  const tasks: ReadonlyArray<WorldTask> = [
    firstTask,
    ...Array.from({ length: blueprint.taskCount - 1 }, (_, index) => ({
      id: `task-${idAt(blueprint, 21 + index)}`,
      text: `work-${idAt(blueprint, 21 + index)} tends the beds`,
      split: restSplitAt(index),
      dimensions: {},
    })),
  ]
  const taskAt = pickOf(tasks, firstTask)

  const extraPlans = blueprint.kind === 'unwitnessed-pair'
    ? []
    : blueprint.extraEntries.slice(0, blueprint.dense ? 4 : 2)
  const usedKeys = new Set([`${firstPack.id}${firstTask.id}`])
  const extraRoutingLabels: ReadonlyArray<WorldRoutingEntry> = extraPlans.flatMap(
    (plan): ReadonlyArray<WorldRoutingEntry> => {
      const pack = packAt(plan.packIndex)
      const taskId = taskAt(plan.taskIndex).id
      const key = `${pack.id}${taskId}`
      if (usedKeys.has(key)) return []
      usedKeys.add(key)
      return [{
        taskId,
        packId: pack.id,
        governing: stemsOfMask(stemsOfPack(pack), plan.governingMask),
        deferred: stemsOfMask(stemsOfPack(pack), plan.deferredMask),
      }]
    },
  )
  const [firstRuleA, firstRuleB] = ascendingPairOf(`rule-${idAt(blueprint, 2)}`, `rule-${idAt(blueprint, 3)}`)
  const routingLabels: ReadonlyArray<WorldRoutingEntry> = [
    {
      taskId: firstTask.id,
      packId: firstPack.id,
      governing: [firstRuleA, firstRuleB],
      deferred: [],
    },
    ...extraRoutingLabels,
  ]

  const selectorReplies: ReadonlyArray<WorldSelectorReply> = tasks.flatMap((task) =>
    packs.map((pack, cellIndex) => ({
      kind: 'selected' as const,
      taskId: task.id,
      packId: pack.id,
      stems: stemsOfMask(stemsOfPack(pack), maskAt(blueprint.loadedMasks, cellIndex)),
      servedModel: servedPlannerModel,
    }))
  )

  const judgeReplies: ReadonlyArray<WorldJudgeReply> = tasks.flatMap((task, taskIndex) =>
    packs.flatMap((pack) =>
      stemPairsOf(pack).map(([ruleA, ruleB], pairIndex) => ({
        kind: 'judged' as const,
        question: { packId: pack.id, taskId: task.id, ruleA, ruleB, plantedBody: undefined },
        verdict: verdictAt(blueprint.verdicts, taskIndex + pairIndex),
        critique: `note-${idAt(blueprint, 26 + ((taskIndex + pairIndex) % 4))}`,
        servedModel: servedJudgeModel,
      }))
    )
  )

  return {
    packs,
    firstPack,
    tasks,
    firstTask,
    routingLabels,
    selectorReplies,
    judgeReplies,
  }
}

const entryGovernsBoth = (
  entries: ReadonlyArray<WorldRoutingEntry>,
  packId: string,
  taskId: string,
  ruleA: string,
  ruleB: string,
): boolean =>
  entries.some((entry) =>
    entry.packId === packId && entry.taskId === taskId &&
    entry.governing.includes(ruleA) && entry.governing.includes(ruleB)
  )

const witnessedTriplesOf = (parts: WorldParts): ReadonlyArray<WitnessTriple> =>
  parts.packs.flatMap((pack) =>
    stemPairsOf(pack).flatMap(([ruleA, ruleB]) =>
      parts.tasks
        .filter((task) => entryGovernsBoth(parts.routingLabels, pack.id, task.id, ruleA, ruleB))
        .map((task) => ({ packId: pack.id, taskId: task.id, ruleA, ruleB }))
    )
  )

const sameTripleOf = (left: WitnessTriple, right: WitnessTriple): boolean =>
  left.packId === right.packId &&
  left.taskId === right.taskId &&
  left.ruleA === right.ruleA &&
  left.ruleB === right.ruleB

interface DraftWorld {
  readonly base: World
  readonly kind: RefusalKind
}

const draftWorldOf = (blueprint: WorldBlueprint): DraftWorld => {
  const parts = buildParts(blueprint)

  const [firstRuleA, firstRuleB] = ascendingPairOf(`rule-${idAt(blueprint, 2)}`, `rule-${idAt(blueprint, 3)}`)
  const forcedTriple: WitnessTriple = {
    packId: parts.firstPack.id,
    taskId: parts.firstTask.id,
    ruleA: firstRuleA,
    ruleB: firstRuleB,
  }
  const firstLabel: WorldPairLabel = {
    id: `pair-${idAt(blueprint, 30)}`,
    taskId: forcedTriple.taskId,
    packId: forcedTriple.packId,
    ruleA: forcedTriple.ruleA,
    ruleB: forcedTriple.ruleB,
    split: 'test',
    verdict: verdictAt(blueprint.verdicts, 0),
    origin: 'observed',
    notes: `note-${idAt(blueprint, 26)}`,
  }
  const otherTriples = witnessedTriplesOf(parts).filter((triple) => sameTripleOf(triple, forcedTriple) === false)
  const extraLabels: ReadonlyArray<WorldPairLabel> = otherTriples
    .slice(0, Math.min(blueprint.extraPairLabels, otherTriples.length))
    .map((triple, index): WorldPairLabel => ({
      id: `pair-${idAt(blueprint, 31 + (index % 2))}`,
      taskId: triple.taskId,
      packId: triple.packId,
      ruleA: triple.ruleA,
      ruleB: triple.ruleB,
      split: splitAt(blueprint.pairSplits, index),
      verdict: verdictAt(blueprint.verdicts, index + 1),
      origin: 'observed',
      notes: `note-${idAt(blueprint, 27 + (index % 3))}`,
    }))
  const pairLabels: ReadonlyArray<WorldPairLabel> = [firstLabel, ...extraLabels]
  const trainPairIds = pairLabels.filter((label) => label.split === 'train').slice(0, 1).map((label) => label.id)
  const judgePrompt: WorldJudgePrompt = {
    ...greenhouseJudgePrompt,
    fewShotPairIds: blueprint.fewShotCount === 1 ? trainPairIds : [],
  }
  const questionKeyOf = (question: WorldJudgeQuestion): string =>
    `${question.packId}${question.taskId}${question.ruleA}${question.ruleB}`
  const distinctQuestionsOf = (
    questions: ReadonlyArray<WorldJudgeQuestion>,
  ): ReadonlyArray<WorldJudgeQuestion> =>
    questions.filter((question, index) =>
      questions.findIndex((other) => questionKeyOf(other) === questionKeyOf(question)) === index
    )
  const targetQuestions: ReadonlyArray<WorldJudgeQuestion> = distinctQuestionsOf([
    ...pairLabels
      .filter((label) => label.split === 'test')
      .map((label) => ({
        packId: label.packId,
        taskId: label.taskId,
        ruleA: label.ruleA,
        ruleB: label.ruleB,
        plantedBody: undefined,
      })),
    ...witnessedTriplesOf(parts).map((triple) => ({
      packId: triple.packId,
      taskId: triple.taskId,
      ruleA: triple.ruleA,
      ruleB: triple.ruleB,
      plantedBody: undefined,
    })),
  ])
  const targetKeys = new Set(targetQuestions.map(questionKeyOf))
  const unscriptedQuestions: ReadonlyArray<WorldJudgeQuestion> = parts.judgeReplies
    .map((reply) => reply.question)
    .filter((question) => targetKeys.has(questionKeyOf(question)) === false)
  const labelByKey = new Map(
    pairLabels.map((label) => [`${label.packId}${label.taskId}${label.ruleA}${label.ruleB}`, label] as const),
  )
  const judgeAnswers: ReadonlyArray<WorldJudgeReply> = [
    ...targetQuestions,
    ...unscriptedQuestions,
  ].map((question, index) => {
    const existing = parts.judgeReplies.find((reply) =>
      reply.question.packId === question.packId &&
      reply.question.taskId === question.taskId &&
      reply.question.ruleA === question.ruleA &&
      reply.question.ruleB === question.ruleB
    )
    const label = labelByKey.get(questionKeyOf(question))
    if (
      existing !== undefined && existing.kind === 'judged' &&
      (label === undefined || existing.verdict === label.verdict)
    ) {
      return existing
    }
    return {
      kind: 'judged' as const,
      question,
      verdict: label?.verdict ?? verdictAt(blueprint.verdicts, index),
      critique: label?.notes ?? `note-${idAt(blueprint, 26 + (index % 4))}`,
      servedModel: servedJudgeModel,
    }
  })
  return {
    kind: blueprint.kind,
    base: {
      intended: blueprint.kind,
      packs: parts.packs,
      instruction: greenhouseInstruction,
      tasks: parts.tasks,
      routingLabels: parts.routingLabels,
      pairLabels,
      judgePrompt,
      dimensions: undefined,
      candidates: [],
      traces: [],
      checkout: { codeFiles: [], lockfileText: '', outsideFiles: [] },
      answers: {
        selector: parts.selectorReplies,
        judge: judgeAnswers,
        generator: { kind: 'proposed', proposedTuples: [], writtenTasks: [] },
      },
    },
  }
}

const buildWorld = (draft: DraftWorld): World => {
  switch (draft.kind) {
    case 'admissible':
      return draft.base
    case 'renamed-rule':
      return withRenamedRule({ ...draft.base, pairLabels: [], judgePrompt: undefined }, {})
    case 'missing-rule-label':
      return withLabelNamingMissingRule({ ...draft.base, pairLabels: [], judgePrompt: undefined }, {})
    case 'malformed-rule':
      return withMalformedRule(draft.base, {})
    case 'provider-refusal':
      return withProviderRefusal(draft.base, { role: 'selector' })
    case 'missing-judge-prompt':
      return withoutJudgePrompt(draft.base)
    case 'unwitnessed-pair':
      return withUnwitnessedPair(draft.base)
  }
}
/** The world generator: admissible worlds and every refusal kind, by construction. */
export const worldArbitrary: fc.Arbitrary<World> = blueprintArbitrary.map(draftWorldOf).map(buildWorld)

/** The frozen seed behind every deterministic sample, so R3's report repeats. */
export const worldSampleSeed = 20_260_924

/** Draw `count` worlds, always the same ones for the same count. */
export const sampleWorlds = (count: number): ReadonlyArray<World> =>
  fc.sample(worldArbitrary, { numRuns: count, seed: worldSampleSeed })

/** How the drawn population spreads across refusal kinds, label sparsity, and pair counts. */
export interface WorldDistribution {
  readonly total: number
  readonly byRefusalKind: Readonly<Record<RefusalKind, number>>
  readonly minLabelDensity: number
  readonly worldsUnderOneFifthLabelDensity: number
  readonly packsWithAtMostOneWitnessedPair: number
  readonly maxWitnessedPairsPerPack: number
}

/** The R3 distribution report over a drawn population. */
export const worldDistributionOf = (worlds: ReadonlyArray<World>): WorldDistribution => {
  const ofKind = (kind: RefusalKind): number => worlds.filter((world) => world.intended === kind).length
  const densities = worlds.map(routingLabelDensityOf)
  const witnessedPerPack = worlds.flatMap((world) =>
    world.packs.map((pack) => witnessedPairsOf(world).filter((pair) => pair.packId === pack.id).length)
  )
  return {
    total: worlds.length,
    byRefusalKind: {
      admissible: ofKind('admissible'),
      'renamed-rule': ofKind('renamed-rule'),
      'malformed-rule': ofKind('malformed-rule'),
      'missing-rule-label': ofKind('missing-rule-label'),
      'provider-refusal': ofKind('provider-refusal'),
      'missing-judge-prompt': ofKind('missing-judge-prompt'),
      'unwitnessed-pair': ofKind('unwitnessed-pair'),
    },
    minLabelDensity: densities.reduce((lowest, density) => Math.min(lowest, density), 1),
    worldsUnderOneFifthLabelDensity: densities.filter((density) => density < 0.2).length,
    packsWithAtMostOneWitnessedPair: witnessedPerPack.filter((count) => count <= 1).length,
    maxWitnessedPairsPerPack: witnessedPerPack.reduce((highest, count) => Math.max(highest, count), 0),
  }
}
