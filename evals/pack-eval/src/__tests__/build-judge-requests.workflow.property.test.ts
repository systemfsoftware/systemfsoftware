import { it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import type { BuildJudgeRequestsError } from '../build-judge-requests.workflow.js'
import {
  buildJudgeRequests,
  BuildJudgeRequestsCommand,
  JudgeEmptyTaskText,
  JudgeFewShotNotesEmpty,
  JudgeFewShotPairNotInTrain,
  JudgeFewShotPairUnknown,
  JudgeRequestsBuilt,
  JudgeTarget,
  JudgeUnknownStem,
  JudgeUnknownTask,
} from '../build-judge-requests.workflow.js'
import { JudgePrompt } from '../judge-prompt.schema.js'
import { PairLabel, PairLabels } from '../labels.schema.js'
import { Pack, PackRule } from '../pack-rule.schema.js'
import { Task, TaskSet } from '../task-set.schema.js'

const TRAIN_PAIR_COUNT = 2

const PLANTED_BODY = 'sealed-and-vented-in-one-pass'

const stemAt = (packIndex: number, ruleIndex: number): string => `rule-${packIndex}-${ruleIndex}`

const bodyAt = (packIndex: number, ruleIndex: number): string => `body-${packIndex}-${ruleIndex}`

const titleAt = (packIndex: number, ruleIndex: number): string => `Rule ${packIndex}.${ruleIndex}`

const taskIdAt = (taskIndex: number): string => `task-${taskIndex}`

const taskTextAt = (taskIndex: number): string => `work item ${taskIndex}`

const pairIdAt = (pairIndex: number): string => `pair-${pairIndex}`

const noteAt = (pairIndex: number): string => `note ${pairIndex}`

const ruleKeyOf = (packId: string, stem: string): string => `${packId}\u0000${stem}`

interface RuleFact {
  readonly title: string
  readonly body: string
}

interface Scenario {
  readonly command: BuildJudgeRequestsCommand
  readonly plantedTargetId: string
  readonly trainIds: ReadonlyArray<string>
  readonly rules: Readonly<Record<string, RuleFact>>
  readonly taskTexts: Readonly<Record<string, string>>
}

const splitAt = (pairIndex: number): 'train' | 'dev' | 'test' =>
  pairIndex < TRAIN_PAIR_COUNT ? 'train' : pairIndex % 2 === 0 ? 'test' : 'dev'

const ruleAt = (packIndex: number, ruleIndex: number): PackRule =>
  new PackRule({
    packId: `pack-${packIndex}`,
    stem: stemAt(packIndex, ruleIndex),
    title: titleAt(packIndex, ruleIndex),
    appliesWhen: ['always'],
    tags: ['example'],
    body: bodyAt(packIndex, ruleIndex),
  })

const packAt = (packIndex: number, ruleCount: number): Pack =>
  new Pack({
    id: `pack-${packIndex}`,
    rules: Array.from({ length: ruleCount }, (_, ruleIndex) => ruleAt(packIndex, ruleIndex)),
  })

const taskAt = (taskIndex: number): Task =>
  new Task({
    id: taskIdAt(taskIndex),
    text: taskTextAt(taskIndex),
    split: taskIndex % 2 === 0 ? 'dev' : 'test',
    dimensions: {},
  })

const pairLabelAt = (pairIndex: number, taskCount: number): PairLabel =>
  new PairLabel({
    id: pairIdAt(pairIndex),
    taskId: taskIdAt(pairIndex % taskCount),
    packId: 'pack-0',
    ruleA: stemAt(0, 0),
    ruleB: stemAt(0, 1),
    split: splitAt(pairIndex),
    verdict: pairIndex % 2 === 0 ? 'Pass' : 'Fail',
    origin: pairIndex === 1 ? 'planted' : 'observed',
    notes: splitAt(pairIndex) === 'train' ? noteAt(pairIndex) : '',
    ...(pairIndex === 1 ? { plantedBody: PLANTED_BODY } : {}),
  })

const targetOf = (label: PairLabel): JudgeTarget =>
  new JudgeTarget({
    id: label.id,
    packId: label.packId,
    taskId: label.taskId,
    ruleA: label.ruleA,
    ruleB: label.ruleB,
    plantedBody: label.plantedBody,
  })

const judgePromptWith = (fewShotPairIds: ReadonlyArray<string>): JudgePrompt =>
  new JudgePrompt({
    criterion: 'can one change satisfy both rules on this task?',
    passDefinition: 'one change satisfies both rules',
    failDefinition: 'no single change satisfies both rules',
    fewShotPairIds,
  })

const rulesOf = (packs: ReadonlyArray<Pack>): Record<string, RuleFact> =>
  Object.fromEntries(
    packs.flatMap((pack) =>
      pack.rules.map((rule) => [ruleKeyOf(pack.id, rule.stem), { title: rule.title, body: rule.body }])
    ),
  )

const taskTextsOf = (tasks: ReadonlyArray<Task>): Record<string, string> =>
  Object.fromEntries(tasks.map((task) => [task.id, task.text]))

const scenarioOf = (packDraw: number, ruleDraw: number, taskDraw: number, pairDraw: number): Scenario => {
  const packCount = 1 + (Math.abs(packDraw) % 2)
  const ruleCount = 2 + (Math.abs(ruleDraw) % 2)
  const taskCount = 2 + (Math.abs(taskDraw) % 2)
  const pairCount = 3 + (Math.abs(pairDraw) % 2)
  const packs = Array.from({ length: packCount }, (_, packIndex) => packAt(packIndex, ruleCount))
  const tasks = Array.from({ length: taskCount }, (_, taskIndex) => taskAt(taskIndex))
  const labels = Array.from({ length: pairCount }, (_, pairIndex) => pairLabelAt(pairIndex, taskCount))
  const trainIds = labels.filter((label) => label.split === 'train').map((label) => label.id)
  return {
    rules: rulesOf(packs),
    command: new BuildJudgeRequestsCommand({
      packs,
      tasks: new TaskSet({ version: 1, tasks }),
      prompt: judgePromptWith(trainIds),
      pairLabels: new PairLabels({ version: 1, entries: labels }),
      targets: labels.map(targetOf),
    }),
    plantedTargetId: pairIdAt(1),
    trainIds,
    taskTexts: taskTextsOf(tasks),
  }
}

const builtOf = (command: BuildJudgeRequestsCommand): JudgeRequestsBuilt =>
  Result.getOrThrow(buildJudgeRequests(command))

const refusalOf = (command: BuildJudgeRequestsCommand): BuildJudgeRequestsError =>
  Result.getOrThrow(Result.flip(buildJudgeRequests(command)))

const commandWith = (
  scenario: Scenario,
  change: Partial<{
    readonly tasks: TaskSet
    readonly prompt: JudgePrompt
    readonly pairLabels: PairLabels
    readonly targets: ReadonlyArray<JudgeTarget>
  }>,
): BuildJudgeRequestsCommand =>
  new BuildJudgeRequestsCommand({
    packs: scenario.command.packs,
    tasks: change.tasks ?? scenario.command.tasks,
    prompt: change.prompt ?? scenario.command.prompt,
    pairLabels: change.pairLabels ?? scenario.command.pairLabels,
    targets: change.targets ?? scenario.command.targets,
  })

const targetWith = (
  target: JudgeTarget,
  change: Partial<{ readonly taskId: string; readonly ruleA: string; readonly ruleB: string }>,
): JudgeTarget =>
  new JudgeTarget({
    id: target.id,
    packId: target.packId,
    taskId: change.taskId ?? target.taskId,
    ruleA: change.ruleA ?? target.ruleA,
    ruleB: change.ruleB ?? target.ruleB,
    plantedBody: target.plantedBody,
  })

const targetsWith = (
  scenario: Scenario,
  change: Partial<{ readonly taskId: string; readonly ruleA: string; readonly ruleB: string }>,
): ReadonlyArray<JudgeTarget> =>
  scenario.command.targets.map((target, index) => (index === 0 ? targetWith(target, change) : target))

const tasksWithEmptyTextOf = (scenario: Scenario, taskId: string): TaskSet =>
  new TaskSet({
    version: 1,
    tasks: scenario.command.tasks.tasks.map((task) =>
      task.id === taskId ? new Task({ id: task.id, text: '', split: task.split, dimensions: task.dimensions }) : task
    ),
  })

const pairLabelsWithNotesOf = (labels: PairLabels, pairId: string): PairLabels =>
  new PairLabels({
    version: 1,
    entries: labels.entries.map((label) =>
      label.id === pairId
        ? new PairLabel({
          id: label.id,
          taskId: label.taskId,
          packId: label.packId,
          ruleA: label.ruleA,
          ruleB: label.ruleB,
          split: label.split,
          verdict: label.verdict,
          origin: label.origin,
          notes: '',
          plantedBody: label.plantedBody,
        })
        : label
    ),
  })

it.prop(
  '∀s_Targets_≡OrderedRequestsCarryingPackContent',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const requests = builtOf(scenario.command).requests
    const targets = scenario.command.targets
    return requests.length === targets.length &&
      targets.every((target, index) => {
        const entry = requests[index]
        const ruleA = scenario.rules[ruleKeyOf(target.packId, target.ruleA)]
        const ruleB = scenario.rules[ruleKeyOf(target.packId, target.ruleB)]
        return entry !== undefined &&
          ruleA !== undefined &&
          ruleB !== undefined &&
          entry.id === target.id &&
          entry.request.taskText === scenario.taskTexts[target.taskId] &&
          entry.request.ruleA.title === ruleA.title &&
          entry.request.ruleA.body === ruleA.body &&
          entry.request.ruleB.title === ruleB.title &&
          entry.request.ruleB.body === (target.plantedBody ?? ruleB.body)
      })
  },
)

it.prop(
  '∀s_PlantedTarget_≡SubstitutesRuleBBodyAlone',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const requests = builtOf(scenario.command).requests
    const planted = requests.filter((entry) => entry.id === scenario.plantedTargetId)
    const untouched = requests.filter((entry) => entry.id !== scenario.plantedTargetId)
    const realBodyB = scenario.rules[ruleKeyOf('pack-0', stemAt(0, 1))]?.body
    return planted.length === 1 &&
      planted.every((entry) =>
        entry.request.ruleB.body === PLANTED_BODY &&
        entry.request.ruleA.body === scenario.rules[ruleKeyOf('pack-0', stemAt(0, 0))]?.body
      ) &&
      untouched.every((entry) => entry.request.ruleB.body === realBodyB && entry.request.ruleB.body !== PLANTED_BODY)
  },
)

it.prop(
  '∀s_FewShotIds_≡TrainExamplesCarryingTheirOwnBodiesAndNotes',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const built = builtOf(scenario.command)
    const examples = built.requests[0]?.request.fewShot ?? []
    const labels = scenario.command.pairLabels.entries
    const trainLabels = labels.filter((label) => label.split === 'train')
    const outsiders = labels.filter((label) => label.split !== 'train')
    return examples.length === scenario.trainIds.length &&
      scenario.trainIds.every((pairId, index) => {
        const label = trainLabels.find((entry) => entry.id === pairId)
        const example = examples[index]
        return label !== undefined && example !== undefined &&
          example.taskText === scenario.taskTexts[label.taskId] &&
          example.ruleABody === scenario.rules[ruleKeyOf(label.packId, label.ruleA)]?.body &&
          example.ruleBBody === (label.plantedBody ?? scenario.rules[ruleKeyOf(label.packId, label.ruleB)]?.body) &&
          example.verdict === label.verdict &&
          example.critique === label.notes
      }) &&
      examples.every((example) => trainLabels.some((label) => label.notes === example.critique)) &&
      outsiders.every((label) => examples.every((example) => example.critique !== label.notes))
  },
)

it.prop(
  '∀s_TargetNamingAnAbsentTask_≡RefusedNamingTargetAndTask',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const first = scenario.command.targets[0]
    if (first === undefined) return false
    const refusal = refusalOf(commandWith(scenario, { targets: targetsWith(scenario, { taskId: 'absent-task' }) }))
    return Schema.is(JudgeUnknownTask)(refusal) && refusal.id === first.id && refusal.taskId === 'absent-task'
  },
)

it.prop(
  '∀s_TargetNamingAnAbsentRuleAStem_≡RefusedNamingTargetAndStem',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const first = scenario.command.targets[0]
    if (first === undefined) return false
    const refusal = refusalOf(commandWith(scenario, { targets: targetsWith(scenario, { ruleA: 'absent-stem-a' }) }))
    return Schema.is(JudgeUnknownStem)(refusal) &&
      refusal.id === first.id &&
      refusal.packId === first.packId &&
      refusal.stem === 'absent-stem-a'
  },
)

it.prop(
  '∀s_TargetNamingAnAbsentRuleBStem_≡RefusedNamingTargetAndStem',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const first = scenario.command.targets[0]
    if (first === undefined) return false
    const refusal = refusalOf(commandWith(scenario, { targets: targetsWith(scenario, { ruleB: 'absent-stem-b' }) }))
    return Schema.is(JudgeUnknownStem)(refusal) &&
      refusal.id === first.id &&
      refusal.packId === first.packId &&
      refusal.stem === 'absent-stem-b'
  },
)

it.prop(
  '∀s_TargetWhoseTaskTextIsEmpty_≡RefusedNamingTargetAndTask',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const first = scenario.command.targets[0]
    if (first === undefined) return false
    const refusal = refusalOf(commandWith(scenario, { tasks: tasksWithEmptyTextOf(scenario, first.taskId) }))
    return Schema.is(JudgeEmptyTaskText)(refusal) && refusal.id === first.id && refusal.taskId === first.taskId
  },
)

it.prop(
  '∀s_FewShotIdNoPairHolds_≡RefusedNamingThePair',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const prompt = judgePromptWith([...scenario.command.prompt.fewShotPairIds, 'absent-pair'])
    const refusal = refusalOf(commandWith(scenario, { prompt }))
    return Schema.is(JudgeFewShotPairUnknown)(refusal) && refusal.pairId === 'absent-pair'
  },
)

it.prop(
  '∀s_FewShotIdOutsideTrain_≡RefusedNamingThePair',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const outsider = scenario.command.pairLabels.entries.find((label) => label.split !== 'train')
    if (outsider === undefined) return false
    const prompt = judgePromptWith([outsider.id])
    const refusal = refusalOf(commandWith(scenario, { prompt }))
    return Schema.is(JudgeFewShotPairNotInTrain)(refusal) && refusal.pairId === outsider.id
  },
)

it.prop(
  '∀s_FewShotPairWithoutNotes_≡RefusedNamingThePair',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioOf(packDraw, ruleDraw, taskDraw, pairDraw)
    const trainPairId = scenario.command.prompt.fewShotPairIds[0]
    if (trainPairId === undefined) return false
    const pairLabels = pairLabelsWithNotesOf(scenario.command.pairLabels, trainPairId)
    const refusal = refusalOf(commandWith(scenario, { pairLabels }))
    return Schema.is(JudgeFewShotNotesEmpty)(refusal) && refusal.pairId === trainPairId
  },
)
