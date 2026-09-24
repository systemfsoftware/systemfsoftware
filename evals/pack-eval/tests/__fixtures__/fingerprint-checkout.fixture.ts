import { PackEval } from '@systemfsoftware/pack-eval'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { writeDatasetFilesOf } from './pack-eval-dataset.fixture.js'
import type { World } from './pack-eval-world.fixture.js'
import { ruleTextOf } from './pack-eval-world.fixture.js'

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
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* writeDatasetFilesOf({ world: input.world, datasetDir })
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
