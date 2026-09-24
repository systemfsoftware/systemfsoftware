import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { expect } from 'vitest'
import {
  type FingerprintCheckout,
  fingerprintRequest,
  writeFingerprintCheckout,
} from './__fixtures__/fingerprint-checkout.fixture.js'

const Feature = makeFeature({ it, layer })

const fileLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

interface FingerprintCell {
  readonly run: (
    input: ReturnType<typeof fingerprintRequest>,
  ) => Effect.Effect<number, PackEval.DatasetFileRefusal, FileSystem.FileSystem | Path.Path>
}

const fingerprintCell: FingerprintCell = PackEval.ComputeFingerprint.run

const linesLayerOf = (lines: Array<string>) =>
  Effect.provideService(
    Console.Console,
    Object.assign(Object.create(console), {
      log: (message: string) => {
        lines.push(message)
      },
    }),
  )

const digestRunOf = (checkout: FingerprintCheckout, lines: Array<string>) =>
  fingerprintCell.run(fingerprintRequest({ checkout })).pipe(linesLayerOf(lines))

interface VarianceWorld {
  readonly base: FingerprintCheckout
  readonly ruleByte: FingerprintCheckout
  readonly labelByte: FingerprintCheckout
  readonly instructionByte: FingerprintCheckout
  readonly judgePromptByte: FingerprintCheckout
  readonly pairLabelByte: FingerprintCheckout
  readonly outsideFile: FingerprintCheckout
  readonly elsewhere: FingerprintCheckout
}

const varianceWorld = (labelled: FingerprintCheckout) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const fresh = (mutation?: {
      readonly ruleByte?: boolean
      readonly labelByte?: boolean
      readonly instructionByte?: boolean
      readonly judgePromptByte?: boolean
      readonly pairLabelByte?: boolean
      readonly outsideFile?: boolean
    }) =>
      Effect.flatMap(
        fileSystem.makeTempDirectoryScoped(),
        (dir) => writeFingerprintCheckout({ baseDir: dir, mutation }),
      )
    return {
      base: labelled,
      ruleByte: yield* fresh({ ruleByte: true }),
      labelByte: yield* fresh({ labelByte: true }),
      instructionByte: yield* fresh({ instructionByte: true }),
      judgePromptByte: yield* fresh({ judgePromptByte: true }),
      pairLabelByte: yield* fresh({ pairLabelByte: true }),
      outsideFile: yield* fresh({ outsideFile: true }),
      elsewhere: yield* fresh(),
    } satisfies VarianceWorld
  })

Feature('Fingerprinting the evaluation inputs')
  .body(({ scenario }) => {
    scenario(
      'The same inputs digested twice, in two places, read the same',
      Gherkin.Do.pipe(
        Given('two scratch checkouts holding the same pack, dataset, code, and lockfile')(
          'dirs',
          () =>
            Effect.gen(function*() {
              const fileSystem = yield* FileSystem.FileSystem
              const first = yield* fileSystem.makeTempDirectoryScoped()
              const second = yield* fileSystem.makeTempDirectoryScoped()
              const firstCheckout = yield* writeFingerprintCheckout({ baseDir: first })
              const secondCheckout = yield* writeFingerprintCheckout({ baseDir: second })
              return { firstCheckout, secondCheckout }
            }).pipe(Effect.provide(fileLayer)),
        ),
        When('each checkout is fingerprinted, the first one twice')('digests', (s) =>
          Effect.gen(function*() {
            const lines: Array<string> = []
            const first = yield* digestRunOf(s.dirs.firstCheckout, lines)
            const again = yield* digestRunOf(s.dirs.firstCheckout, lines)
            const second = yield* digestRunOf(s.dirs.secondCheckout, lines)
            return { first, again, second, lines }
          }).pipe(Effect.provide(fileLayer))),
        Then('every run exits covered, and all three digests agree')((s) => {
          expect(s.digests.first).toBe(0)
          expect(s.digests.again).toBe(0)
          expect(s.digests.second).toBe(0)
          expect(s.digests.lines).toHaveLength(3)
          expect(new Set(s.digests.lines).size).toBe(1)
          expect(s.digests.lines[0]).toMatch(/^[0-9a-f]{64}$/)
        }),
      ),
    )

    scenario(
      'A changed input moves the digest, and a file outside the inputs leaves it alone',
      Gherkin.Do.pipe(
        Given('one checkout per input change, plus an untouched twin')(
          'world',
          () =>
            Effect.gen(function*() {
              const fileSystem = yield* FileSystem.FileSystem
              const base = yield* writeFingerprintCheckout({
                baseDir: yield* fileSystem.makeTempDirectoryScoped(),
              })
              return yield* varianceWorld(base)
            }).pipe(Effect.provide(fileLayer)),
        ),
        When('every checkout is fingerprinted')('digests', (s) =>
          Effect.gen(function*() {
            const lines: Array<string> = []
            const base = yield* digestRunOf(s.world.base, lines)
            const ruleByte = yield* digestRunOf(s.world.ruleByte, lines)
            const labelByte = yield* digestRunOf(s.world.labelByte, lines)
            const instructionByte = yield* digestRunOf(s.world.instructionByte, lines)
            const judgePromptByte = yield* digestRunOf(s.world.judgePromptByte, lines)
            const pairLabelByte = yield* digestRunOf(s.world.pairLabelByte, lines)
            const outsideFile = yield* digestRunOf(s.world.outsideFile, lines)
            const elsewhere = yield* digestRunOf(s.world.elsewhere, lines)
            return {
              base,
              ruleByte,
              labelByte,
              instructionByte,
              judgePromptByte,
              pairLabelByte,
              outsideFile,
              elsewhere,
              lines,
            }
          }).pipe(Effect.provide(fileLayer))),
        Then('covered runs exit zero, and each named change moves the digest')((s) => {
          const digestOf = (index: number): string => s.digests.lines[index] ?? ''
          expect(s.digests.base).toBe(0)
          expect(s.digests.ruleByte).toBe(0)
          expect(s.digests.labelByte).toBe(0)
          expect(s.digests.instructionByte).toBe(0)
          expect(s.digests.judgePromptByte).toBe(0)
          expect(s.digests.pairLabelByte).toBe(0)
          expect(s.digests.outsideFile).toBe(0)
          expect(s.digests.elsewhere).toBe(0)
          expect(digestOf(1)).not.toBe(digestOf(0))
          expect(digestOf(2)).not.toBe(digestOf(0))
          expect(digestOf(3)).not.toBe(digestOf(0))
          expect(digestOf(4)).not.toBe(digestOf(0))
          expect(digestOf(5)).not.toBe(digestOf(0))
          expect(digestOf(6)).toBe(digestOf(0))
          expect(digestOf(7)).toBe(digestOf(0))
        }),
      ),
    )

    scenario(
      'A different model or seed is a different evaluation',
      Gherkin.Do.pipe(
        Given('one scratch checkout with the pack, dataset, code, and lockfile')(
          'checkout',
          () =>
            Effect.gen(function*() {
              const fileSystem = yield* FileSystem.FileSystem
              return yield* writeFingerprintCheckout({
                baseDir: yield* fileSystem.makeTempDirectoryScoped(),
              })
            }).pipe(Effect.provide(fileLayer)),
        ),
        When('it is fingerprinted with changed model, seed, and judge choices')(
          'digests',
          (s) =>
            Effect.gen(function*() {
              const lines: Array<string> = []
              const base = yield* digestRunOf(s.checkout, lines)
              const model = yield* fingerprintCell
                .run(fingerprintRequest({ checkout: s.checkout, selectorModel: 'acme/planner-small' }))
                .pipe(linesLayerOf(lines))
              const seed = yield* fingerprintCell
                .run(fingerprintRequest({ checkout: s.checkout, seed: 8 }))
                .pipe(linesLayerOf(lines))
              const judge = yield* fingerprintCell
                .run(fingerprintRequest({ checkout: s.checkout, judgeModel: 'acme/judge-mini' }))
                .pipe(linesLayerOf(lines))
              const minimum = yield* fingerprintCell
                .run(fingerprintRequest({ checkout: s.checkout, judgeMinimum: 0.9 }))
                .pipe(linesLayerOf(lines))
              return { base, model, seed, judge, minimum, lines }
            }).pipe(Effect.provide(fileLayer)),
        ),
        Then('the parameter changes each move the digest')((s) => {
          const digestOf = (index: number): string => s.digests.lines[index] ?? ''
          expect(s.digests.base).toBe(0)
          expect(s.digests.model).toBe(0)
          expect(s.digests.seed).toBe(0)
          expect(s.digests.judge).toBe(0)
          expect(s.digests.minimum).toBe(0)
          expect(digestOf(1)).not.toBe(digestOf(0))
          expect(digestOf(2)).not.toBe(digestOf(0))
          expect(digestOf(3)).not.toBe(digestOf(0))
          expect(digestOf(4)).not.toBe(digestOf(0))
        }),
      ),
    )
  })
