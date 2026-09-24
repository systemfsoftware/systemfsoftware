import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Option, Result, Schema } from 'effect'
import { JudgeVerdict as JudgeVerdictSchema } from './contradiction-verdict.schema.js'
import { JudgePrompt } from './judge-prompt.schema.js'
import type { PairLabel } from './labels.schema.js'
import { PairLabels } from './labels.schema.js'
import { Pack } from './pack-rule.schema.js'
import type { PackRule } from './pack-rule.schema.js'
import { TaskSet } from './task-set.schema.js'
import type { Task } from './task-set.schema.js'

const BuildJudgeRequestsTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/BuildJudgeRequests')
type BuildJudgeRequestsTypeId = typeof BuildJudgeRequestsTypeId

export class JudgeTarget extends Schema.Class<JudgeTarget>('JudgeTarget')({
  id: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  ruleA: Schema.NonEmptyString,
  ruleB: Schema.NonEmptyString,
  plantedBody: Schema.optional(Schema.NonEmptyString),
}) {}

export class JudgeRule extends Schema.Class<JudgeRule>('JudgeRule')({
  stem: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  body: Schema.NonEmptyString,
}) {}

export class JudgeExample extends Schema.Class<JudgeExample>('JudgeExample')({
  taskText: Schema.NonEmptyString,
  ruleABody: Schema.NonEmptyString,
  ruleBBody: Schema.NonEmptyString,
  verdict: JudgeVerdictSchema,
  critique: Schema.NonEmptyString,
}) {}

export class JudgeRequest extends Schema.Class<JudgeRequest>('JudgeRequest')({
  packId: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
  taskText: Schema.NonEmptyString,
  ruleA: JudgeRule,
  ruleB: JudgeRule,
  prompt: JudgePrompt,
  fewShot: Schema.Array(JudgeExample),
}) {}

export class JudgeRequestEntry extends Schema.Class<JudgeRequestEntry>('JudgeRequestEntry')({
  id: Schema.NonEmptyString,
  request: JudgeRequest,
}) {}

export class JudgeRequestsBuilt extends Schema.TaggedClass<JudgeRequestsBuilt>()('JudgeRequestsBuilt', {
  requests: Schema.Array(JudgeRequestEntry),
}) {
  readonly [BuildJudgeRequestsTypeId] = BuildJudgeRequestsTypeId
}

export const JudgeRequestsDecision = Schema.Union([JudgeRequestsBuilt])
export type JudgeRequestsDecision = typeof JudgeRequestsDecision.Type

export class JudgeUnknownTask extends Schema.TaggedError<JudgeUnknownTask>()('JudgeUnknownTask', {
  id: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
}) {}

export class JudgeUnknownStem extends Schema.TaggedError<JudgeUnknownStem>()('JudgeUnknownStem', {
  id: Schema.NonEmptyString,
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
}) {}

export class JudgeEmptyTaskText extends Schema.TaggedError<JudgeEmptyTaskText>()('JudgeEmptyTaskText', {
  id: Schema.NonEmptyString,
  taskId: Schema.NonEmptyString,
}) {}

export class JudgeFewShotPairUnknown extends Schema.TaggedError<JudgeFewShotPairUnknown>()(
  'JudgeFewShotPairUnknown',
  {
    pairId: Schema.NonEmptyString,
  },
) {}

export class JudgeFewShotPairNotInTrain extends Schema.TaggedError<JudgeFewShotPairNotInTrain>()(
  'JudgeFewShotPairNotInTrain',
  {
    pairId: Schema.NonEmptyString,
  },
) {}

export class JudgeFewShotNotesEmpty extends Schema.TaggedError<JudgeFewShotNotesEmpty>()('JudgeFewShotNotesEmpty', {
  pairId: Schema.NonEmptyString,
}) {}

export const BuildJudgeRequestsError = Schema.Union([
  JudgeUnknownTask,
  JudgeUnknownStem,
  JudgeEmptyTaskText,
  JudgeFewShotPairUnknown,
  JudgeFewShotPairNotInTrain,
  JudgeFewShotNotesEmpty,
])
export type BuildJudgeRequestsError = typeof BuildJudgeRequestsError.Type

export class BuildJudgeRequestsCommand extends Schema.Class<BuildJudgeRequestsCommand>('BuildJudgeRequestsCommand')({
  packs: Schema.Array(Pack),
  tasks: TaskSet,
  prompt: JudgePrompt,
  pairLabels: PairLabels,
  targets: Schema.Array(JudgeTarget),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
interface PairNaming {
  readonly packId: string
  readonly taskId: string
  readonly ruleA: string
  readonly ruleB: string
  readonly plantedBody: string | undefined
}

interface ResolvedPair {
  readonly taskText: string
  readonly ruleABody: string
  readonly ruleBBody: string
  readonly ruleATitle: string
  readonly ruleBTitle: string
  readonly ruleAStem: string
  readonly ruleBStem: string
}
const namingOf = (naming: PairLabel | JudgeTarget): PairNaming => ({
  packId: naming.packId,
  taskId: naming.taskId,
  ruleA: naming.ruleA,
  ruleB: naming.ruleB,
  plantedBody: naming.plantedBody,
})

const packOf = (packs: ReadonlyArray<Pack>, packId: string): Option.Option<Pack> =>
  Arr.findFirst(packs, (pack) => pack.id === packId)

const ruleOf = (pack: Pack, stem: string): Option.Option<PackRule> =>
  Arr.findFirst(pack.rules, (rule) => rule.stem === stem)

const taskOf = (tasks: TaskSet, taskId: string): Option.Option<Task> =>
  Arr.findFirst(tasks.tasks, (task) => task.id === taskId)

const labelOf = (labels: PairLabels, pairId: string): Option.Option<PairLabel> =>
  Arr.findFirst(labels.entries, (label) => label.id === pairId)

const bodyBOf = (plantedBody: string | undefined, ruleB: PackRule): string =>
  Option.getOrElse(Option.fromUndefinedOr(plantedBody), () => ruleB.body)

const resolveRulesOf = (
  packs: ReadonlyArray<Pack>,
  id: string,
  naming: PairNaming,
): Result.Result<readonly [PackRule, PackRule], BuildJudgeRequestsError> =>
  Result.gen(function*() {
    const pack = yield* Result.fromOption(
      packOf(packs, naming.packId),
      () => new JudgeUnknownStem({ id, packId: naming.packId, stem: naming.ruleA }),
    )
    const ruleA = yield* Result.fromOption(
      ruleOf(pack, naming.ruleA),
      () => new JudgeUnknownStem({ id, packId: naming.packId, stem: naming.ruleA }),
    )
    const ruleB = yield* Result.fromOption(
      ruleOf(pack, naming.ruleB),
      () => new JudgeUnknownStem({ id, packId: naming.packId, stem: naming.ruleB }),
    )
    return [ruleA, ruleB] as const
  })

const resolvePairOf = (
  packs: ReadonlyArray<Pack>,
  tasks: TaskSet,
  id: string,
  naming: PairNaming,
): Result.Result<ResolvedPair, BuildJudgeRequestsError> =>
  Result.gen(function*() {
    const [ruleA, ruleB] = yield* resolveRulesOf(packs, id, naming)
    const task = yield* Result.fromOption(
      taskOf(tasks, naming.taskId),
      () => new JudgeUnknownTask({ id, taskId: naming.taskId }),
    )
    yield* Match.value(task.text === '').pipe(
      Match.when(true, () => Result.fail(new JudgeEmptyTaskText({ id, taskId: task.id }))),
      Match.when(false, () => Result.succeed(undefined)),
      Match.exhaustive,
    )
    return {
      taskText: task.text,
      ruleABody: ruleA.body,
      ruleBBody: bodyBOf(naming.plantedBody, ruleB),
      ruleATitle: ruleA.title,
      ruleBTitle: ruleB.title,
      ruleAStem: ruleA.stem,
      ruleBStem: ruleB.stem,
    }
  })

const exampleOf = (resolved: ResolvedPair, label: PairLabel): JudgeExample =>
  new JudgeExample({
    taskText: resolved.taskText,
    ruleABody: resolved.ruleABody,
    ruleBBody: resolved.ruleBBody,
    verdict: label.verdict,
    critique: label.notes,
  })
const exampleFor = (
  packs: ReadonlyArray<Pack>,
  tasks: TaskSet,
  pairLabels: PairLabels,
  pairId: string,
): Result.Result<JudgeExample, BuildJudgeRequestsError> =>
  Result.gen(function*() {
    const label = yield* Result.fromOption(
      labelOf(pairLabels, pairId),
      () => new JudgeFewShotPairUnknown({ pairId }),
    )
    yield* Match.value(label.split === 'train').pipe(
      Match.when(true, () => Result.succeed(undefined)),
      Match.when(false, () => Result.fail(new JudgeFewShotPairNotInTrain({ pairId }))),
      Match.exhaustive,
    )
    yield* Match.value(label.notes === '').pipe(
      Match.when(true, () => Result.fail(new JudgeFewShotNotesEmpty({ pairId }))),
      Match.when(false, () => Result.succeed(undefined)),
      Match.exhaustive,
    )
    return exampleOf(yield* resolvePairOf(packs, tasks, pairId, namingOf(label)), label)
  })

const fewShotOf = (
  command: BuildJudgeRequestsCommand,
): Result.Result<ReadonlyArray<JudgeExample>, BuildJudgeRequestsError> =>
  Result.all(
    Arr.map(command.prompt.fewShotPairIds, (fewShotPairId) =>
      exampleFor(command.packs, command.tasks, command.pairLabels, fewShotPairId)),
  )

const requestOf = (
  command: BuildJudgeRequestsCommand,
  target: JudgeTarget,
  resolved: ResolvedPair,
  fewShot: ReadonlyArray<JudgeExample>,
): JudgeRequestEntry =>
  new JudgeRequestEntry({
    id: target.id,
    request: new JudgeRequest({
      packId: target.packId,
      taskId: target.taskId,
      taskText: resolved.taskText,
      ruleA: new JudgeRule({ stem: resolved.ruleAStem, title: resolved.ruleATitle, body: resolved.ruleABody }),
      ruleB: new JudgeRule({ stem: resolved.ruleBStem, title: resolved.ruleBTitle, body: resolved.ruleBBody }),
      prompt: command.prompt,
      fewShot,
    }),
  })

const requestsOf = (
  command: BuildJudgeRequestsCommand,
  fewShot: ReadonlyArray<JudgeExample>,
): Result.Result<ReadonlyArray<JudgeRequestEntry>, BuildJudgeRequestsError> =>
  Result.all(
    Arr.map(command.targets, (target) =>
      Result.map(
        resolvePairOf(command.packs, command.tasks, target.id, namingOf(target)),
        (resolved) => requestOf(command, target, resolved, fewShot),
      )),
  )

const decide = (
  command: BuildJudgeRequestsCommand,
): Result.Result<JudgeRequestsBuilt, BuildJudgeRequestsError> =>
  Result.gen(function*() {
    const fewShot = yield* fewShotOf(command)
    return new JudgeRequestsBuilt({ requests: yield* requestsOf(command, fewShot) })
  })

export const buildJudgeRequests = Workflow.make({
  command: BuildJudgeRequestsCommand,
  decision: JudgeRequestsDecision,
  error: BuildJudgeRequestsError,
  decide,
})
