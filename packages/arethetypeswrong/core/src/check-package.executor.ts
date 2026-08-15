import { Context, Effect, Layer, Schema } from 'effect'

import { type CheckResult, CheckResultSchema } from './analysis.schema.js'
import { checkPackage, type CheckPackageOptions } from './checkPackage.js'
import { createPackageFromTarballData } from './createPackage.js'
import { PackageStoreAdapter } from './package-store.adapter.js'
import type { ResolutionKind, ResolutionOption } from './problem.schema.js'

export interface CheckPackageService {
  readonly execute: (
    pkgSpec: string,
    options?: CheckPackageOptions,
  ) => Effect.Effect<CheckResult, Error, PackageStoreAdapter>
}

export class CheckPackage
  extends Context.Tag('@systemfsoftware/arethetypeswrong-core/check-package.executor/CheckPackage')<
    CheckPackage,
    CheckPackageService
  >()
{}

export const CheckPackageLive: Layer.Layer<
  CheckPackage,
  never,
  PackageStoreAdapter
> = Layer.effect(
  CheckPackage,
  Effect.gen(function*() {
    const store = yield* PackageStoreAdapter

    return CheckPackage.of({
      execute: (pkgSpec, options) =>
        Effect.gen(function*() {
          const ref = yield* store.resolveTarballRef([
            { name: pkgSpec, versionKind: 'tag', version: 'latest' },
          ])
          const bytes = yield* store.fetchTarball(ref.tarballUrl)
          const result = yield* Effect.tryPromise({
            try: () => checkPackage(createPackageFromTarballData(bytes), options),
            catch: (e) => new Error(`Analysis failed: ${String(e)}`),
          })
          return Schema.decodeUnknownSync(CheckResultSchema)(result)
        }),
    })
  }),
)

export const _resolutionKindsUsed: readonly ResolutionKind[] = ['node10', 'node16-cjs', 'node16-esm', 'bundler']
export const _resolutionOptionsUsed: readonly ResolutionOption[] = ['node10', 'node16', 'bundler']
