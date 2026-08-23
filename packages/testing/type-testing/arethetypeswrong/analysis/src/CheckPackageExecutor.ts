import { Context, Effect, Layer, Schema } from 'effect'

import { createPackageFromTarballData } from '@systemfsoftware/npm-package'
import { type CheckResult, CheckResultSchema } from './Analysis.schema.js'
import { checkPackage, type CheckPackageOptions } from './CheckPackage.js'
import { PackageStore } from './PackageStoreAdapter.js'
import type { ResolutionKind, ResolutionOption } from './Problem.schema.js'

export interface CheckPackageService {
  readonly execute: (
    pkgSpec: string,
    options?: CheckPackageOptions,
  ) => Effect.Effect<CheckResult, Error, PackageStore>
}

export class CheckPackage extends Context.Service<CheckPackage, CheckPackageService>()(
  '@systemfsoftware/arethetypeswrong/check-package.executor/CheckPackage',
  {
    make: Effect.gen(function*() {
      const store = yield* PackageStore

      return {
        execute: (pkgSpec, options) =>
          Effect.gen(function*() {
            const ref = yield* store.resolveTarballRef([
              { name: pkgSpec, versionKind: 'tag', version: 'latest' },
            ])
            const bytes = yield* store.fetchTarball(ref.tarballUrl)
            const result = yield* checkPackage(createPackageFromTarballData(bytes), options).pipe(
              Effect.catchDefect((cause: unknown) => Effect.fail(new Error('Analysis failed', { cause }))),
            )
            return yield* Schema.decodeUnknownEffect(CheckResultSchema)(result)
          }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}

export const CheckPackageLive: Layer.Layer<CheckPackage, never, PackageStore> = CheckPackage.layer

export const _resolutionKindsUsed: readonly ResolutionKind[] = ['node10', 'node16-cjs', 'node16-esm', 'bundler']
export const _resolutionOptionsUsed: readonly ResolutionOption[] = ['node10', 'node16', 'bundler']
