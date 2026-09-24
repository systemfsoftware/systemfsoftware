import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import {
  AdmitDataset,
  admitDataset,
  DatasetAdmitted,
  FewShotPairNotInTrain,
  PairNotWitnessed,
  UnknownRuleStem,
} from '../admit-dataset.workflow.js'
import type { AdmitDatasetError } from '../admit-dataset.workflow.js'
import { JudgePrompt } from '../judge-prompt.schema.js'
import { PairLabel, PairLabels, RoutingLabelEntry, RoutingLabels } from '../labels.schema.js'
import { Pack, PackRule } from '../pack-rule.schema.js'
import { Task, TaskSet } from '../task-set.schema.js'

interface Dataset {
  readonly packs: ReadonlyArray<Pack>
  readonly taskSet: TaskSet
  readonly routingLabels: RoutingLabels
  readonly pairLabels: PairLabels
  readonly judgePrompt: JudgePrompt
}

interface Scenario {
  readonly dataset: Dataset
  readonly packId: string
  readonly taskId: string
  readonly ruleStem: string
  readonly devPairId: string
}

const isUnknownRuleStem = (error: AdmitDatasetError): error is UnknownRuleStem => Schema.is(UnknownRuleStem)(error)

const isFewShotPairNotInTrain = (error: AdmitDatasetError): error is FewShotPairNotInTrain =>
  Schema.is(FewShotPairNotInTrain)(error)

const isPairNotWitnessed = (error: AdmitDatasetError): error is PairNotWitnessed => Schema.is(PairNotWitnessed)(error)

const admit = (dataset: Dataset): Result.Result<DatasetAdmitted, AdmitDatasetError> =>
  admitDataset(new AdmitDataset(dataset))

const ruleAt = (packIndex: number, ruleIndex: number): PackRule =>
  new PackRule({
    packId: `pack-${packIndex}`,
    stem: `rule-${packIndex}-${ruleIndex}`,
    title: `Rule ${packIndex}.${ruleIndex}`,
    appliesWhen: ['always'],
    tags: ['example'],
    body: 'a body',
  })

const packAt = (packIndex: number, ruleCount: number): Pack =>
  new Pack({
    id: `pack-${packIndex}`,
    rules: Array.from({ length: ruleCount }, (_, ruleIndex) => ruleAt(packIndex, ruleIndex)),
  })

const taskAt = (taskIndex: number): Task =>
  new Task({
    id: `task-${taskIndex}`,
    text: `task ${taskIndex}`,
    split: taskIndex % 2 === 0 ? 'dev' : 'test',
    dimensions: { size: 'small' },
  })

const labelEntriesFor = (
  packs: ReadonlyArray<Pack>,
  tasks: ReadonlyArray<Task>,
): ReadonlyArray<RoutingLabelEntry> =>
  packs.flatMap((pack) =>
    tasks.map((task) =>
      new RoutingLabelEntry({
        taskId: task.id,
        packId: pack.id,
        governing: pack.rules.map((rule) => rule.stem),
        deferred: [],
      })
    )
  )

const scenarioOf = (
  packCount: number,
  ruleCount: number,
  taskCount: number,
  pairCount: number,
): Scenario => {
  const firstPack = packAt(0, ruleCount)
  const firstTask = taskAt(0)
  const packs = [firstPack, ...Array.from({ length: packCount - 1 }, (_, index) => packAt(index + 1, ruleCount))]
  const tasks = [firstTask, ...Array.from({ length: taskCount - 1 }, (_, index) => taskAt(index + 1))]
  const pairs = Array.from({ length: pairCount }, (_, index) =>
    new PairLabel({
      id: `pair-${index}`,
      taskId: firstTask.id,
      packId: firstPack.id,
      ruleA: ruleAt(0, 0).stem,
      ruleB: ruleAt(0, 1).stem,
      split: index === 0 ? 'train' : 'dev',
      verdict: index % 2 === 0 ? 'Pass' : 'Fail',
      origin: 'observed',
      notes: '',
    }))
  const dataset: Dataset = {
    packs,
    taskSet: new TaskSet({ version: 1, tasks }),
    routingLabels: new RoutingLabels({ version: 1, entries: labelEntriesFor(packs, tasks) }),
    pairLabels: new PairLabels({ version: 1, entries: pairs }),
    judgePrompt: new JudgePrompt({
      criterion: 'can one change satisfy both rules on this task?',
      passDefinition: 'one change satisfies both rules',
      failDefinition: 'no single change satisfies both rules',
      fewShotPairIds: pairs.filter((pair) => pair.split === 'train').map((pair) => pair.id),
    }),
  }
  return {
    dataset,
    packId: firstPack.id,
    taskId: firstTask.id,
    ruleStem: ruleAt(0, 0).stem,
    devPairId: 'pair-1',
  }
}

const scenarioFrom = (
  packDraw: number,
  ruleDraw: number,
  taskDraw: number,
  pairDraw: number,
): Scenario =>
  scenarioOf(
    1 + (Math.abs(packDraw) % 3),
    2 + (Math.abs(ruleDraw) % 2),
    1 + (Math.abs(taskDraw) % 3),
    2 + (Math.abs(pairDraw) % 2),
  )

it.prop(
  '∀s_labelNamingAnAbsentStem_≡RefusedNamingTaskAndStem',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioFrom(packDraw, ruleDraw, taskDraw, pairDraw)
    const absentStem = 'absent-stem'
    const broken = new RoutingLabels({
      version: 1,
      entries: [
        ...scenario.dataset.routingLabels.entries,
        new RoutingLabelEntry({
          taskId: scenario.taskId,
          packId: scenario.packId,
          governing: [absentStem],
          deferred: [],
        }),
      ],
    })
    const outcome = admit({ ...scenario.dataset, routingLabels: broken })
    return Result.isFailure(outcome) &&
      isUnknownRuleStem(outcome.failure) &&
      outcome.failure.taskId === scenario.taskId &&
      outcome.failure.packId === scenario.packId &&
      outcome.failure.stem === absentStem
  },
)

it.prop(
  '∀s_fewShotIdFromDevPair_≡RefusedAsLeakage',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioFrom(packDraw, ruleDraw, taskDraw, pairDraw)
    const prompt = scenario.dataset.judgePrompt
    const leaky = new JudgePrompt({
      criterion: prompt.criterion,
      passDefinition: prompt.passDefinition,
      failDefinition: prompt.failDefinition,
      fewShotPairIds: [scenario.devPairId],
    })
    const outcome = admit({ ...scenario.dataset, judgePrompt: leaky })
    return Result.isFailure(outcome) &&
      isFewShotPairNotInTrain(outcome.failure) &&
      outcome.failure.pairId === scenario.devPairId
  },
)

it.prop(
  '∀s_pairWithoutDualGoverningLabel_≡RefusedAsUnwitnessed',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioFrom(packDraw, ruleDraw, taskDraw, pairDraw)
    const narrowed = new RoutingLabels({
      version: 1,
      entries: scenario.dataset.routingLabels.entries.map((entry) =>
        new RoutingLabelEntry({
          taskId: entry.taskId,
          packId: entry.packId,
          governing: [scenario.ruleStem],
          deferred: [],
        })
      ),
    })
    const outcome = admit({ ...scenario.dataset, routingLabels: narrowed })
    return Result.isFailure(outcome) &&
      isPairNotWitnessed(outcome.failure) &&
      outcome.failure.pairId === 'pair-0' &&
      outcome.failure.taskId === scenario.taskId &&
      outcome.failure.packId === scenario.packId
  },
)

it.prop(
  '∀s_wellFormedDataset_≡AdmittedUnchanged',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioFrom(packDraw, ruleDraw, taskDraw, pairDraw)
    const outcome = admitDataset(new AdmitDataset(scenario.dataset))
    const admitted = Result.getOrThrow(outcome)
    return Equal.equals(admitted.packs, scenario.dataset.packs) &&
      Equal.equals(admitted.taskSet, scenario.dataset.taskSet) &&
      Equal.equals(admitted.routingLabels, scenario.dataset.routingLabels) &&
      Equal.equals(admitted.pairLabels, scenario.dataset.pairLabels) &&
      Equal.equals(admitted.judgePrompt, scenario.dataset.judgePrompt)
  },
)

it.prop(
  '∀s_datasetWithoutOptionalEvidence_≡AdmittedLeavingItAbsent',
  [Schema.Int, Schema.Int, Schema.Int, Schema.Int],
  ([packDraw, ruleDraw, taskDraw, pairDraw]) => {
    const scenario = scenarioFrom(packDraw, ruleDraw, taskDraw, pairDraw)
    const outcome = admitDataset(
      new AdmitDataset({
        packs: scenario.dataset.packs,
        taskSet: scenario.dataset.taskSet,
        routingLabels: scenario.dataset.routingLabels,
      }),
    )
    const admitted = Result.getOrThrow(outcome)
    return Equal.equals(admitted.packs, scenario.dataset.packs) &&
      admitted.pairLabels === undefined &&
      admitted.judgePrompt === undefined
  },
)
