import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import {
  type AdmitTaskCandidates,
  admitTaskCandidates,
  NoNewCandidates,
  TaskCandidatesAdmitted,
} from './admit-task-candidates.workflow.js'
import { DatasetFileRefusal } from './dataset-file.schema.js'
import { readJson, writeJson } from './drivers/dataset-files.js'
import type { DimensionTuple, TaskGenerationError } from './selection-trace.schema.js'
import { CandidateTask, CandidateTasks, TaskDimensions } from './task-discovery.schema.js'
import { TaskGenerator, type TaskGeneratorShape } from './task-generator.service.js'
import { TaskSet } from './task-set.schema.js'

export interface GenerateTasksInput {
  readonly datasetDir: string
  readonly workDir: string
}

export interface GeneratedCandidates {
  readonly candidatesPath: string
  readonly admittedIds: ReadonlyArray<string>
  readonly candidateCount: number
}

type GenerateTasksRead = (typeof AdmitTaskCandidates)['Encoded'] & {
  readonly dimensions: TaskDimensions
}

type AdmittedOutcome = (typeof TaskCandidatesAdmitted)['Encoded']
type NothingOutcome = (typeof NoNewCandidates)['Encoded']

const emptyTaskSet = new TaskSet({ version: 1, tasks: [] })
const emptyCandidates = new CandidateTasks({ version: 1, candidates: [] })

const readOptionalJson = <S extends Schema.Constraint>(
  path: string,
  schema: S,
  empty: S['Type'],
): Effect.Effect<S['Type'], DatasetFileRefusal, FileSystem.FileSystem | Path.Path | S['DecodingServices']> =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const present = yield* fileSystem
      .exists(path)
      .pipe(Effect.mapError((error) => new DatasetFileRefusal({ path, reason: error.message })))
    return yield* present ? readJson(path, schema) : Effect.succeed(empty)
  })

const readGenerateTasks = (
  input: GenerateTasksInput,
): Effect.Effect<
  GenerateTasksRead,
  DatasetFileRefusal | TaskGenerationError,
  FileSystem.FileSystem | Path.Path | TaskGenerator
> =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    const dimensions = yield* readJson(paths.join(input.datasetDir, 'dimensions.json'), TaskDimensions)
    const tasks = yield* readOptionalJson(paths.join(input.datasetDir, 'tasks.json'), TaskSet, emptyTaskSet)
    const candidates = yield* readOptionalJson(
      paths.join(input.workDir, 'candidates.json'),
      CandidateTasks,
      emptyCandidates,
    )
    const generator = yield* TaskGenerator
    const proposed = yield* generator.proposeTuples({
      application: dimensions.application,
      dimensions: dimensions.dimensions,
      seeds: dimensions.seeds,
    })
    return {
      _tag: 'AdmitTaskCandidates',
      datasetDir: input.datasetDir,
      workDir: input.workDir,
      tasks,
      candidates,
      proposed,
      dimensions,
    }
  })

const candidatesPathOf = (read: GenerateTasksRead): Effect.Effect<string, never, Path.Path> =>
  Effect.map(Path.Path, (paths) => paths.join(read.workDir, 'candidates.json'))

const draftTaskOf = (
  id: string,
  dimensions: TaskDimensions,
  tuple: DimensionTuple,
  generator: TaskGeneratorShape,
): Effect.Effect<CandidateTask, TaskGenerationError> =>
  Effect.gen(function*() {
    const draft = yield* generator.writeTask({
      application: dimensions.application,
      dimensions: dimensions.dimensions,
      tuple,
      example: '',
    })
    return new CandidateTask({ id, text: draft.text, dimensions: tuple })
  })

const writeAdmitted = (
  admitted: AdmittedOutcome,
  read: GenerateTasksRead,
): Effect.Effect<
  GeneratedCandidates,
  DatasetFileRefusal | TaskGenerationError,
  FileSystem.FileSystem | Path.Path | TaskGenerator
> =>
  Effect.gen(function*() {
    const candidatesPath = yield* candidatesPathOf(read)
    const generator = yield* TaskGenerator
    const generated = yield* Effect.forEach(admitted.admitted, (draft) =>
      draftTaskOf(draft.id, read.dimensions, draft.dimensions, generator))
    const merged = new CandidateTasks({ version: 1, candidates: [...read.candidates.candidates, ...generated] })
    yield* writeJson(candidatesPath, CandidateTasks, merged)
    return {
      candidatesPath,
      admittedIds: generated.map((candidate) =>
        candidate.id
      ),
      candidateCount: merged.candidates.length,
    } satisfies GeneratedCandidates
  })

const writeNothingNew = (
  _nothing: NothingOutcome,
  read: GenerateTasksRead,
): Effect.Effect<GeneratedCandidates, never, Path.Path> =>
  Effect.map(candidatesPathOf(read), (candidatesPath) => ({
    candidatesPath,
    admittedIds: [],
    candidateCount: read.candidates.candidates.length,
  }))

export const generateTasks = Sandwich.named('pack-eval.generate-tasks')(readGenerateTasks)
  .decide(admitTaskCandidates)
  .write({
    TaskCandidatesAdmitted: writeAdmitted,
    NoNewCandidates: writeNothingNew,
    CommandRejected: (rejected) =>
      Effect.die(new Error(`the generate-tasks read failed its own command schema: ${rejected.issue}`)),
  })
