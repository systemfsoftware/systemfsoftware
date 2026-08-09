import * as PlatformHttp from '@effect/platform/HttpClient'
import { Context, Effect, Layer, Schema } from 'effect'
import { Schema as S } from 'effect'

export class NpmNotFoundError extends Schema.TaggedError<NpmNotFoundError>()('NpmNotFoundError', {
  name: Schema.String,
}) {}

export class NpmRegistryError extends Schema.TaggedError<NpmRegistryError>()('NpmRegistryError', {
  message: Schema.String,
}) {}

const RegistryResponseSchema = S.Struct({
  name: S.String,
  version: S.String,
  dist: S.Struct({ tarball: S.String }),
})

export interface PackageManifest {
  readonly name: string
  readonly version: string
  readonly tarballUrl: string
}

export interface NpmRegistryService {
  readonly fetchTarballUrl: (
    name: string,
    version: string,
  ) => Effect.Effect<PackageManifest, NpmRegistryError | NpmNotFoundError>
  readonly fetchTarballBytes: (tarballUrl: string) => Effect.Effect<Uint8Array, NpmRegistryError>
}

export class NpmRegistry extends Context.Tag('@systemfsoftware/arethetypeswrong-cli/npm-registry.adapter/NpmRegistry')<
  NpmRegistry,
  NpmRegistryService
>() {}

const fromHttp = (http: PlatformHttp.HttpClient): NpmRegistryService => ({
  fetchTarballUrl: (name, version) =>
    Effect.gen(function*() {
      const response = yield* http.get(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`).pipe(
        Effect.mapError((e) => new NpmRegistryError({ message: `Failed to fetch registry: ${String(e)}` })),
      )
      if (response.status === 404) {
        return yield* Effect.fail(new NpmNotFoundError({ name }))
      }
      if (response.status >= 400) {
        return yield* Effect.fail(
          new NpmRegistryError({ message: `Registry returned ${response.status} for ${name}@${version}` }),
        )
      }
      const raw = yield* response.json.pipe(
        Effect.mapError((e) => new NpmRegistryError({ message: `Failed to parse registry JSON: ${String(e)}` })),
      )
      const decoded = yield* S.decodeUnknown(RegistryResponseSchema)(raw).pipe(
        Effect.mapError((e) => new NpmRegistryError({ message: `Malformed registry response: ${String(e)}` })),
      )
      return {
        name: decoded.name,
        version: decoded.version,
        tarballUrl: decoded.dist.tarball,
      }
    }),
  fetchTarballBytes: (tarballUrl) =>
    Effect.gen(function*() {
      const response = yield* http.get(tarballUrl).pipe(
        Effect.mapError((e) => new NpmRegistryError({ message: `Failed to fetch tarball: ${String(e)}` })),
      )
      if (response.status >= 400) {
        return yield* Effect.fail(
          new NpmRegistryError({ message: `Tarball fetch returned ${response.status}` }),
        )
      }
      const buffer = yield* response.arrayBuffer.pipe(
        Effect.mapError((e) => new NpmRegistryError({ message: `Failed to read tarball bytes: ${String(e)}` })),
      )
      return new Uint8Array(buffer)
    }),
})

export const NpmRegistryLive: Layer.Layer<NpmRegistry, never, PlatformHttp.HttpClient> = Layer.effect(
  NpmRegistry,
  Effect.gen(function*() {
    const http = yield* PlatformHttp.HttpClient
    return fromHttp(http)
  }),
)
