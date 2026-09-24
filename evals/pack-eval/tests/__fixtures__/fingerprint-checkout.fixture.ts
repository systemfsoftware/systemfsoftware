import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { World, WorldRuleFile } from './pack-eval-world.fixture.js'

/**
 * The fingerprint area's interpreter: a world's checkout written to a scratch
 * base directory, and the fingerprint request the command reads it with. Both
 * the rule text and the request come from the world, so a row changes only the
 * input it names.
 */

export interface FingerprintCheckout {
  readonly packDir: string
  readonly datasetDir: string
  readonly codeRoot: string
  readonly lockfilePath: string
}

export interface FingerprintParameters {
  readonly selectorModel?: string | undefined
  readonly judgeModel?: string | undefined
  readonly judgeMinimum?: number | undefined
  readonly seed?: number | undefined
}

const fingerprintSelectorModel = 'acme/planner-large'
const fingerprintSeed = 7
const fingerprintIterations = 200
const fingerprintConfidence = 0.95
const fingerprintJudgeMinimum = 0.8

const ruleTextOf = (rule: WorldRuleFile): string =>
  [
    '---',
    `title: ${rule.title}`,
    `applies_when: [${rule.appliesWhen.join(', ')}]`,
    `tags: [${rule.tags.join(', ')}]`,
    '---',
    '',
    rule.body,
    '',
  ].join('\n')

const writePacks = (world: World, fileSystem: FileSystem.FileSystem, paths: Path.Path, baseDir: string) =>
  Effect.gen(function*() {
    const packDir = paths.join(baseDir, 'packs', world.packs[0]?.id ?? 'pack')
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    yield* Effect.forEach(
      world.packs,
      (pack) =>
        Effect.forEach(
          pack.rules,
          (rule) => fileSystem.writeFileString(paths.join(packDir, `${rule.stem}.md`), ruleTextOf(rule)),
          { discard: true },
        ),
      { discard: true },
    )
    return packDir
  })

const writeDataset = (world: World, fileSystem: FileSystem.FileSystem, paths: Path.Path, datasetDir: string) =>
  Effect.gen(function*() {
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    const instruction = world.instruction
    if (instruction !== undefined) {
      yield* PackEval.DatasetFiles.writeJson(
        paths.join(datasetDir, 'selector-instruction.json'),
        PackEval.SelectorInstruction,
        new PackEval.SelectorInstruction({
          text: instruction.text,
          provenance: new PackEval.SelectorProvenance({
            consumer: instruction.consumer,
            pluginVersion: instruction.pluginVersion,
            sourcePath: instruction.sourcePath,
          }),
        }),
      )
    }
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'tasks.json'),
      PackEval.TaskSet,
      new PackEval.TaskSet({
        version: 1,
        tasks: world.tasks.map((task) =>
          new PackEval.Task({ id: task.id, text: task.text, split: task.split, dimensions: task.dimensions })
        ),
      }),
    )
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
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
      }),
    )
    if (world.pairLabels.length > 0) {
      yield* PackEval.DatasetFiles.writeJson(
        paths.join(datasetDir, 'pair-labels.json'),
        PackEval.PairLabels,
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
        }),
      )
    }
    const prompt = world.judgePrompt
    if (prompt !== undefined) {
      yield* PackEval.DatasetFiles.writeJson(
        paths.join(datasetDir, 'judge-prompt.json'),
        PackEval.JudgePrompt,
        new PackEval.JudgePrompt({
          criterion: prompt.criterion,
          passDefinition: prompt.passDefinition,
          failDefinition: prompt.failDefinition,
          fewShotPairIds: prompt.fewShotPairIds,
        }),
      )
    }
  })

interface FingerprintCheckoutInput {
  readonly world: World
  readonly baseDir: string
}

export const fingerprintCheckoutOf = (input: FingerprintCheckoutInput) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const datasetDir = paths.join(input.baseDir, 'dataset')
    const codeRoot = paths.join(input.baseDir, 'code')
    const packDir = yield* writePacks(input.world, fileSystem, paths, input.baseDir)
    yield* writeDataset(input.world, fileSystem, paths, datasetDir)
    const lockfilePath = paths.join(input.baseDir, 'pnpm-lock.yaml')
    yield* fileSystem.makeDirectory(paths.join(codeRoot, 'src'), { recursive: true })
    yield* Effect.forEach(
      input.world.checkout.codeFiles,
      (file) =>
        Effect.flatMap(
          fileSystem.makeDirectory(paths.join(input.baseDir, paths.dirname(file.path)), { recursive: true }),
          () => fileSystem.writeFileString(paths.join(input.baseDir, file.path), file.content),
        ),
      { discard: true },
    )
    yield* Effect.forEach(
      input.world.checkout.outsideFiles,
      (file) =>
        Effect.flatMap(
          fileSystem.makeDirectory(paths.join(input.baseDir, paths.dirname(file.path)), { recursive: true }),
          () => fileSystem.writeFileString(paths.join(input.baseDir, file.path), file.content),
        ),
      { discard: true },
    )
    yield* fileSystem.writeFileString(lockfilePath, input.world.checkout.lockfileText)
    return { packDir, datasetDir, codeRoot, lockfilePath } satisfies FingerprintCheckout
  })

interface FingerprintRequestInput {
  readonly checkout: FingerprintCheckout
  readonly parameters?: FingerprintParameters | undefined
}

export const fingerprintRequestOf = (
  input: FingerprintRequestInput,
): PackEval.ComputeFingerprint.FingerprintRequest => ({
  packDirs: [input.checkout.packDir],
  datasetDir: input.checkout.datasetDir,
  codeRoot: input.checkout.codeRoot,
  lockfilePath: input.checkout.lockfilePath,
  selectorModel: input.parameters?.selectorModel ?? fingerprintSelectorModel,
  judgeModel: input.parameters?.judgeModel,
  judgeMinimum: input.parameters?.judgeMinimum ?? fingerprintJudgeMinimum,
  seed: input.parameters?.seed ?? fingerprintSeed,
  iterations: fingerprintIterations,
  confidence: fingerprintConfidence,
  evidenceFloor: new PackEval.EvidenceFloor({ positives: 1, negatives: 1 }),
})
