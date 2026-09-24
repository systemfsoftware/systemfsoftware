import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { DatasetFileRefusal } from './dataset-file.schema.js'
import {
  type DeriveTraceTargets,
  deriveTraceTargets,
  DuplicateTraceTarget,
  NothingToTrace,
  TraceTargetsDerived,
} from './derive-trace-targets.workflow.js'
import { readJson, readPack, writeJson } from './drivers/dataset-files.js'
import type { Pack, RuleFileRefusal } from './pack-rule.schema.js'
import { RuleSelector } from './rule-selector.service.js'
import type { SelectionError, SelectionTrace } from './selection-trace.schema.js'
import { SelectionTrace as SelectionTraceSchema } from './selection-trace.schema.js'
import { SelectorInstruction } from './selector-instruction.schema.js'
import { Task, TaskSet } from './task-set.schema.js'

export interface TraceSelectionInput {
  readonly datasetDir: string
  readonly workDir: string
  readonly packDirs: ReadonlyArray<string>
}

export interface TracedSelection {
  readonly tracePaths: ReadonlyArray<string>
}

type TraceSelectionRead = (typeof DeriveTraceTargets)['Encoded'] & {
  readonly datasetDir: string
  readonly workDir: string
  readonly instruction: SelectorInstruction
}

type DerivedOutcome = (typeof TraceTargetsDerived)['Encoded']
type NothingOutcome = (typeof NothingToTrace)['Encoded']
type DuplicateOutcome = (typeof DuplicateTraceTarget)['Encoded']

const readTraceSelection = (
  input: TraceSelectionInput,
): Effect.Effect<
  TraceSelectionRead,
  DatasetFileRefusal | RuleFileRefusal,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    const tasks = yield* readJson(paths.join(input.datasetDir, 'tasks.json'), TaskSet)
    const instruction = yield* readJson(paths.join(input.datasetDir, 'selector-instruction.json'), SelectorInstruction)
    const packs = yield* Effect.forEach(input.packDirs, (dir) => readPack(dir))
    return {
      _tag: 'DeriveTraceTargets',
      tasks,
      packs,
      datasetDir: input.datasetDir,
      workDir: input.workDir,
      instruction,
    }
  })

const packById = (packs: ReadonlyArray<Pack>, packId: string): Effect.Effect<Pack> =>
  Effect.suspend(() => {
    const pack = packs.find((candidate) => candidate.id === packId)
    return pack === undefined
      ? Effect.die(new Error(`the traced pairs named pack ${packId}, which this run did not read`))
      : Effect.succeed(pack)
  })

const taskById = (tasks: TaskSet, taskId: string): Effect.Effect<Task> =>
  Effect.suspend(() => {
    const task = tasks.tasks.find((candidate) => candidate.id === taskId)
    return task === undefined
      ? Effect.die(new Error(`the traced pairs named task ${taskId}, which this run did not read`))
      : Effect.succeed(task)
  })

const traceTarget = (
  pack: Pack,
  task: Task,
  instruction: SelectorInstruction,
  tracePath: string,
): Effect.Effect<string, DatasetFileRefusal | SelectionError, FileSystem.FileSystem | Path.Path | RuleSelector> =>
  Effect.gen(function*() {
    const selector = yield* RuleSelector
    const trace: SelectionTrace = yield* selector.select({ pack, task, instruction })
    yield* writeJson(tracePath, SelectionTraceSchema, trace)
    return tracePath
  })

const writeTraces = (
  derived: DerivedOutcome,
  read: TraceSelectionRead,
): Effect.Effect<
  TracedSelection,
  DatasetFileRefusal | RuleFileRefusal | SelectionError | DuplicateTraceTarget,
  FileSystem.FileSystem | Path.Path | RuleSelector
> =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    const tracePaths = yield* Effect.forEach(derived.targets, (target) =>
      Effect.gen(function*() {
        const pack = yield* packById(read.packs, target.packId)
        const task = yield* taskById(read.tasks, target.taskId)
        const tracePath = paths.join(read.workDir, 'traces', target.relativePath)
        return yield* traceTarget(pack, task, read.instruction, tracePath)
      }))
    return { tracePaths } satisfies TracedSelection
  })

const writeNoTraces = (_nothing: NothingOutcome, _read: TraceSelectionRead): Effect.Effect<TracedSelection> =>
  Effect.succeed({ tracePaths: [] })

const refuseDuplicate = (duplicate: DuplicateOutcome): Effect.Effect<never, DuplicateTraceTarget> =>
  Effect.fail(new DuplicateTraceTarget({ packId: duplicate.packId, taskId: duplicate.taskId }))

export const traceSelection = Sandwich.named('pack-eval.trace-selection')(readTraceSelection)
  .decide(deriveTraceTargets)
  .write({
    TraceTargetsDerived: writeTraces,
    NothingToTrace: writeNoTraces,
    DuplicateTraceTarget: refuseDuplicate,
    CommandRejected: (rejected) =>
      Effect.die(new Error(`the trace-selection read failed its own command schema: ${rejected.issue}`)),
  })
