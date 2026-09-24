import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { World } from './pack-eval-world.fixture.js'

type DatasetWriteEffect = Effect.Effect<
  void,
  PackEval.DatasetFileRefusal,
  FileSystem.FileSystem | Path.Path
>

interface DatasetFileEntry {
  readonly relativePath: string
  readonly write: DatasetWriteEffect
}

const jsonFileOf = (
  paths: Path.Path,
  datasetDir: string,
  relativePath: string,
  write: (path: string) => DatasetWriteEffect,
): DatasetFileEntry => ({ relativePath, write: write(paths.join(datasetDir, relativePath)) })

const selectorInstructionOf = (world: World): PackEval.SelectorInstruction | undefined => {
  const instruction = world.instruction
  return instruction === undefined
    ? undefined
    : new PackEval.SelectorInstruction({
      text: instruction.text,
      provenance: new PackEval.SelectorProvenance({
        consumer: instruction.consumer,
        pluginVersion: instruction.pluginVersion,
        sourcePath: instruction.sourcePath,
      }),
    })
}

const judgePromptOf = (world: World): PackEval.JudgePrompt | undefined => {
  const prompt = world.judgePrompt
  return prompt === undefined
    ? undefined
    : new PackEval.JudgePrompt({
      criterion: prompt.criterion,
      passDefinition: prompt.passDefinition,
      failDefinition: prompt.failDefinition,
      fewShotPairIds: prompt.fewShotPairIds,
    })
}

const taskSetOf = (world: World): PackEval.TaskSet =>
  new PackEval.TaskSet({
    version: 1,
    tasks: world.tasks.map((task) =>
      new PackEval.Task({ id: task.id, text: task.text, split: task.split, dimensions: task.dimensions })
    ),
  })

const routingLabelsOf = (world: World): PackEval.RoutingLabels =>
  new PackEval.RoutingLabels({
    version: 1,
    entries: world.routingLabels.map((entry) =>
      new PackEval.RoutingLabelEntry({
        taskId: entry.taskId,
        packId: entry.packId,
        governing: entry.governing,
        deferred: entry.deferred,
      })
    ),
  })

const pairLabelsOf = (world: World): PackEval.PairLabels =>
  new PackEval.PairLabels({
    version: 1,
    entries: world.pairLabels.map((label) =>
      new PackEval.PairLabel({
        id: label.id,
        taskId: label.taskId,
        packId: label.packId,
        ruleA: label.ruleA,
        ruleB: label.ruleB,
        split: label.split,
        verdict: label.verdict,
        origin: label.origin,
        notes: label.notes,
        ...(label.plantedBody === undefined ? {} : { plantedBody: label.plantedBody }),
      })
    ),
  })

const datasetFilesOf = (
  world: World,
  paths: Path.Path,
  datasetDir: string,
): ReadonlyArray<DatasetFileEntry> => {
  const instruction = selectorInstructionOf(world)
  const judgePrompt = judgePromptOf(world)
  return [
    ...(instruction === undefined
      ? []
      : [
        jsonFileOf(
          paths,
          datasetDir,
          'selector-instruction.json',
          (path) => PackEval.DatasetFiles.writeJson(path, PackEval.SelectorInstruction, instruction),
        ),
      ]),
    jsonFileOf(
      paths,
      datasetDir,
      'tasks.json',
      (path) => PackEval.DatasetFiles.writeJson(path, PackEval.TaskSet, taskSetOf(world)),
    ),
    jsonFileOf(
      paths,
      datasetDir,
      'routing-labels.json',
      (path) => PackEval.DatasetFiles.writeJson(path, PackEval.RoutingLabels, routingLabelsOf(world)),
    ),
    jsonFileOf(
      paths,
      datasetDir,
      'pair-labels.json',
      (path) => PackEval.DatasetFiles.writeJson(path, PackEval.PairLabels, pairLabelsOf(world)),
    ),
    ...(judgePrompt === undefined
      ? []
      : [
        jsonFileOf(
          paths,
          datasetDir,
          'judge-prompt.json',
          (path) => PackEval.DatasetFiles.writeJson(path, PackEval.JudgePrompt, judgePrompt),
        ),
      ]),
  ]
}

export const writeDatasetFilesOf = (options: {
  readonly world: World
  readonly datasetDir: string
}): DatasetWriteEffect =>
  Effect.flatMap(
    Path.Path,
    (paths) =>
      Effect.forEach(
        datasetFilesOf(options.world, paths, options.datasetDir),
        (file) => file.write,
        { discard: true },
      ),
  )
