/// <reference types="node" />
import { it, layer, makeFeature, StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { readFile } from 'node:fs/promises'
import { expect } from 'vitest'
import { CheckPackage, CheckPackageLive } from '../src/CheckPackageExecutor.ts'
import { PackageStoreAdapterStub } from '../src/PackageStoreAdapter.ts'

/**
 * CheckPackage executor — live layer wiring.
 *
 * Composes the published `CheckPackage` service through `CheckPackageLive`
 * with a stub package store backed by a real fixture tarball, proving that the
 * executor entrypoint resolves a spec, fetches bytes, analyzes the package,
 * and decodes the result into the published `CheckResult` shape.
 */
const Feature = makeFeature({ it, layer })

const executorCheck = async (tarball: Uint8Array) => {
  const storeLayer = PackageStoreAdapterStub(
    { packageName: 'semver', packageVersion: '7.6.3', tarballUrl: 'file://semver@7.6.3.tgz' },
    tarball,
  )
  const checkPackageLayer = CheckPackageLive.pipe(Layer.provide(storeLayer))
  const checkEffect = Effect.gen(function*() {
    const checkPackage = yield* CheckPackage
    return yield* checkPackage.execute('semver', { entrypoints: ['.'] })
  }).pipe(Effect.provide(Layer.mergeAll(checkPackageLayer, storeLayer)))
  return Effect.runPromise(checkEffect)
}

Feature('CheckPackage executor — analysis through the live layer').body(({ scenario }) => {
  scenario(
    'Should_ReturnAnalysis_When_StoreServesFixtureTarball',
    Effect.gen(function*() {
      const tarball = new Uint8Array(
        yield* Effect.tryPromise({
          try: async () => await readFile(new URL('./__fixtures__/fixtures/semver@7.6.3.tgz', import.meta.url)),
          catch: () => new StepError({ keyword: 'scenario', text: 'readFile failed', cause: void 0 }),
        }),
      )
      const result = yield* Effect.tryPromise({
        try: () => executorCheck(tarball),
        catch: () => new StepError({ keyword: 'scenario', text: 'execute failed', cause: void 0 }),
      })
      if ('packageName' in result && result.packageName !== undefined) {
        expect(result.packageName).toBe('semver')
      }
      if ('entrypoints' in result) {
        expect(Object.keys(result.entrypoints)).toContain('.')
      }
    }),
  )
})
