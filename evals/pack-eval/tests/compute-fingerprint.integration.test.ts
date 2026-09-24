import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Console, Effect, Layer } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'
import {
  type FingerprintCheckout,
  fingerprintCheckoutOf,
  type FingerprintParameters,
  fingerprintRequestOf,
} from './__fixtures__/fingerprint-checkout.fixture.js'
import { type FingerprintMutation, fingerprintWorld } from './__fixtures__/pack-eval-world.fixture.js'
import { recordingConsoleOf } from './__fixtures__/recording-console.fixture.js'

const Feature = makeFeature({ it, layer })

const fileLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

const digestOf = (checkout: FingerprintCheckout, lines: Array<string>, parameters?: FingerprintParameters) =>
  PackEval.ComputeFingerprint.run.run(fingerprintRequestOf({ checkout, parameters })).pipe(
    Effect.provideService(Console.Console, recordingConsoleOf(lines)),
  )

interface DigestedPair {
  readonly baseExit: number
  readonly variantExit: number
  readonly baseDigest: string
  readonly variantDigest: string
}

const hexDigest = /^[0-9a-f]{64}$/

const movingInputs = [
  { input: 'rule body', mutation: { ruleBody: true }, parameters: undefined },
  { input: 'routing labels', mutation: { routingLabels: true }, parameters: undefined },
  { input: 'selector instruction', mutation: { instruction: true }, parameters: undefined },
  { input: 'judge prompt', mutation: { judgePrompt: true }, parameters: undefined },
  { input: 'pair label', mutation: { pairLabel: true }, parameters: undefined },
  { input: 'selector model', mutation: undefined, parameters: { selectorModel: 'acme/planner-small' } },
  { input: 'seed', mutation: undefined, parameters: { seed: 8 } },
  { input: 'judge model', mutation: undefined, parameters: { judgeModel: 'acme/judge-mini' } },
  { input: 'judge minimum', mutation: undefined, parameters: { judgeMinimum: 0.9 } },
] as const

type MovingInput = {
  readonly input: string
  readonly mutation: FingerprintMutation | undefined
  readonly parameters: FingerprintParameters | undefined
}

const movingRowOf = (row: (typeof movingInputs)[number]): MovingInput => ({
  input: row.input,
  mutation: row.mutation,
  parameters: row.parameters,
})

const steadyInputs = [
  { unchanged: 'file written outside the inputs', outsideFile: true, reread: false },
  { unchanged: 'second checkout holding the same world', outsideFile: false, reread: false },
  { unchanged: 'second read of the same checkout', outsideFile: false, reread: true },
] as const

Feature('Fingerprinting the evaluation inputs')
  .withLayer(fileLayer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Changing the <input> moves the digest',
      movingInputs,
      (row) =>
        Gherkin.Do.pipe(
          Given('a world and a twin written to scratch checkouts, differing in one named input')(
            'checkouts',
            () =>
              Effect.gen(function*() {
                const fileSystem = yield* FileSystem.FileSystem
                const { input: _input, mutation, parameters: _parameters } = movingRowOf(row)
                const baseDir = yield* fileSystem.makeTempDirectoryScoped()
                const variantDir = yield* fileSystem.makeTempDirectoryScoped()
                const base = yield* fingerprintCheckoutOf({ world: fingerprintWorld(), baseDir })
                const variant = yield* fingerprintCheckoutOf({
                  world: fingerprintWorld({ mutation }),
                  baseDir: variantDir,
                })
                return { base, variant }
              }),
          ),
          When('each checkout is fingerprinted')('digests', (s) =>
            Effect.gen(function*() {
              const { parameters } = movingRowOf(row)
              const baseLines: Array<string> = []
              const variantLines: Array<string> = []
              const baseExit = yield* digestOf(s.checkouts.base, baseLines)
              const variantExit = yield* digestOf(s.checkouts.variant, variantLines, parameters)
              const digests: DigestedPair = {
                baseExit,
                variantExit,
                baseDigest: baseLines[0] ?? '',
                variantDigest: variantLines[0] ?? '',
              }
              return digests
            })),
          Then('each run exits covered with a sixty-four-digit digest, and the digests differ')((s) => {
            expect(s.digests.baseExit).toBe(0)
            expect(s.digests.variantExit).toBe(0)
            expect(s.digests.baseDigest).toMatch(hexDigest)
            expect(s.digests.variantDigest).toMatch(hexDigest)
            expect(s.digests.variantDigest).not.toBe(s.digests.baseDigest)
          }),
        ),
    )

    scenarioOutline(
      'A <unchanged> leaves the digest unchanged',
      steadyInputs,
      (row) =>
        Gherkin.Do.pipe(
          Given('a world written to scratch, beside its comparison')('checkouts', () =>
            Effect.gen(function*() {
              const fileSystem = yield* FileSystem.FileSystem
              const baseDir = yield* fileSystem.makeTempDirectoryScoped()
              const comparisonDir = yield* fileSystem.makeTempDirectoryScoped()
              const base = yield* fingerprintCheckoutOf({ world: fingerprintWorld(), baseDir })
              const comparison = row.reread
                ? base
                : yield* fingerprintCheckoutOf({
                  world: fingerprintWorld(
                    row.outsideFile ? { mutation: { outsideFile: true } } : {},
                  ),
                  baseDir: comparisonDir,
                })
              return { base, comparison }
            })),
          When('both sides are fingerprinted')('digests', (s) =>
            Effect.gen(function*() {
              const baseLines: Array<string> = []
              const comparisonLines: Array<string> = []
              const baseExit = yield* digestOf(s.checkouts.base, baseLines)
              const comparisonExit = yield* digestOf(s.checkouts.comparison, comparisonLines)
              const digests: DigestedPair = {
                baseExit,
                variantExit: comparisonExit,
                baseDigest: baseLines[0] ?? '',
                variantDigest: comparisonLines[row.reread ? 1 : 0] ?? comparisonLines[0] ?? '',
              }
              return digests
            })),
          Then('each run exits covered with a sixty-four-digit digest, and the digests agree')((s) => {
            expect(s.digests.baseExit).toBe(0)
            expect(s.digests.variantExit).toBe(0)
            expect(s.digests.baseDigest).toMatch(hexDigest)
            expect(s.digests.variantDigest).toMatch(hexDigest)
            expect(s.digests.variantDigest).toBe(s.digests.baseDigest)
          }),
        ),
    )
  })
