import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema } from 'effect'
import { DimensionTuple, ProposedTuples } from './selection-trace.schema.js'
import { CandidateTasks } from './task-discovery.schema.js'
import { TaskSet } from './task-set.schema.js'

const TaskCandidatesTypeId: unique symbol = Symbol.for('@systemfsoftware/pack-eval/TaskCandidates')
type TaskCandidatesTypeId = typeof TaskCandidatesTypeId

export class AdmittedCandidate extends Schema.Class<AdmittedCandidate>('AdmittedCandidate')({
  id: Schema.NonEmptyString,
  dimensions: DimensionTuple,
}) {}

export class TaskCandidatesAdmitted extends Schema.TaggedClass<TaskCandidatesAdmitted>()('TaskCandidatesAdmitted', {
  admitted: Schema.Array(AdmittedCandidate),
}) {
  readonly [TaskCandidatesTypeId] = TaskCandidatesTypeId
}

export class NoNewCandidates extends Schema.TaggedClass<NoNewCandidates>()('NoNewCandidates', {
  proposed: Schema.Int,
}) {
  readonly [TaskCandidatesTypeId] = TaskCandidatesTypeId
}

export const AdmitTaskCandidatesDecision = Schema.Union([TaskCandidatesAdmitted, NoNewCandidates])
export type AdmitTaskCandidatesDecision = typeof AdmitTaskCandidatesDecision.Type

export class AdmitTaskCandidates extends Schema.TaggedClass<AdmitTaskCandidates>()('AdmitTaskCandidates', {
  datasetDir: Schema.NonEmptyString,
  workDir: Schema.NonEmptyString,
  tasks: TaskSet,
  candidates: CandidateTasks,
  proposed: ProposedTuples,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    datasetDir: 'app.pack-eval.dataset-dir',
    workDir: 'app.pack-eval.work-dir',
  } as const
}

const escapeTokenOf = (text: string): string =>
  text.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll('=', '\\=')

const tupleIdOf = (tuple: DimensionTuple): string =>
  Object.keys(tuple)
    .toSorted()
    .map((name) => `${escapeTokenOf(name)}=${escapeTokenOf(String(tuple[name]))}`)
    .join(';')

const knownIdsOf = (tasks: TaskSet, candidates: CandidateTasks): ReadonlyArray<string> => [
  ...tasks.tasks.map((task) => task.id),
  ...tasks.tasks.map((task) => tupleIdOf(task.dimensions)),
  ...candidates.candidates.map((candidate) => candidate.id),
  ...candidates.candidates.map((candidate) => tupleIdOf(candidate.dimensions)),
]

const draftsOf = (proposed: ProposedTuples): ReadonlyArray<AdmittedCandidate> =>
  proposed.tuples.map((tuple) => new AdmittedCandidate({ id: tupleIdOf(tuple), dimensions: tuple }))

const unseenOf = (
  drafts: ReadonlyArray<AdmittedCandidate>,
  known: ReadonlyArray<string>,
): ReadonlyArray<AdmittedCandidate> => drafts.filter((draft) => !known.includes(draft.id))

const firstOfEachId = (drafts: ReadonlyArray<AdmittedCandidate>): ReadonlyArray<AdmittedCandidate> =>
  drafts.filter((draft, index) => drafts.findIndex((other) => other.id === draft.id) === index)

const admittedOf = (command: AdmitTaskCandidates): ReadonlyArray<AdmittedCandidate> =>
  firstOfEachId(unseenOf(draftsOf(command.proposed), knownIdsOf(command.tasks, command.candidates)))

const decisionOf = (
  command: AdmitTaskCandidates,
  admitted: ReadonlyArray<AdmittedCandidate>,
): AdmitTaskCandidatesDecision =>
  Match.value(admitted.length === 0).pipe(
    Match.when(true, () => new NoNewCandidates({ proposed: command.proposed.tuples.length })),
    Match.when(false, () => new TaskCandidatesAdmitted({ admitted })),
    Match.exhaustive,
  )

const decide = (command: AdmitTaskCandidates): Result.Result<AdmitTaskCandidatesDecision, never> =>
  Result.succeed(decisionOf(command, admittedOf(command)))

export const admitTaskCandidates = Workflow.make({
  command: AdmitTaskCandidates,
  decision: AdmitTaskCandidatesDecision,
  error: Schema.Never,
  decide,
})
