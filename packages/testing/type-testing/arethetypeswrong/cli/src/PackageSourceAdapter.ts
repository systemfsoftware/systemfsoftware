import { Context, Effect, Layer } from 'effect'

import { PackageSourceError } from './PackageSource.schema.js'

export interface PackageSourceService {
  readonly fromLocalPath: (
    path: string,
  ) => Effect.Effect<{ kind: 'directory'; path: string }, PackageSourceError>
  readonly fromTarball: (
    bytes: Uint8Array,
  ) => Effect.Effect<{ kind: 'tarball'; bytes: Uint8Array }, PackageSourceError>
  readonly fromNpm: (
    name: string,
    version: string,
  ) => Effect.Effect<{ kind: 'npm'; name: string; version: string }, PackageSourceError>
}

export class PackageSource extends Context.Service<PackageSource, PackageSourceService>()(
  '@systemfsoftware/arethetypeswrong-cli/package-source.adapter/PackageSource',
) {}

export const PackageSourceLive: Layer.Layer<PackageSource, never, never> = Layer.succeed(
  PackageSource,
  {
    fromLocalPath: (path) => Effect.succeed({ kind: 'directory' as const, path }),
    fromTarball: (bytes) => Effect.succeed({ kind: 'tarball' as const, bytes }),
    fromNpm: (name, version) => Effect.succeed({ kind: 'npm' as const, name, version }),
  },
)
