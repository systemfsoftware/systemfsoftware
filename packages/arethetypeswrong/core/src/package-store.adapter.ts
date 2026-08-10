import { Context, Effect, Layer } from 'effect'
import { maxSatisfying } from 'semver'

import type { ParsedPackageSpec } from './package-spec.schema.js'

export interface PackageStoreTarballRef {
  readonly packageName: string
  readonly packageVersion: string
  readonly tarballUrl: string
}

export class PackageNotFoundError extends Error {
  readonly _tag = 'PackageNotFoundError'
  constructor(readonly specs: ReadonlyArray<ParsedPackageSpec>) {
    super(`Failed to find a matching version for ${specs[0].name}`)
  }
}

export class PackageStoreError extends Error {
  readonly _tag = 'PackageStoreError'
}

export interface PackageStoreOptions {
  readonly before?: Date
  readonly allowDeprecated?: boolean
  readonly registryBaseUrl?: string
}

export interface PackageStoreAdapterService {
  readonly resolveTarballRef: (
    specs: ReadonlyArray<ParsedPackageSpec>,
    options?: PackageStoreOptions,
  ) => Effect.Effect<PackageStoreTarballRef, PackageNotFoundError | PackageStoreError>
  readonly fetchTarball: (tarballUrl: string) => Effect.Effect<Uint8Array, PackageStoreError>
}

export class PackageStoreAdapter extends Context.Tag(
  '@systemfsoftware/arethetypeswrong-core/PackageStoreAdapter',
)<PackageStoreAdapter, PackageStoreAdapterService>() {}

export const PackageStoreAdapterLive: Layer.Layer<PackageStoreAdapter, never, never> = Layer.succeed(
  PackageStoreAdapter,
  {
    resolveTarballRef: (specs, options) =>
      Effect.tryPromise({
        try: () => resolveTarballRef(specs, options),
        catch: (e): PackageNotFoundError | PackageStoreError =>
          e instanceof PackageNotFoundError
            ? e
            : new PackageStoreError(`Failed to resolve ${specs[0].name}: ${String(e)}`),
      }),
    fetchTarball: (tarballUrl) =>
      Effect.tryPromise({
        try: () => fetchTarball(tarballUrl),
        catch: (e) => new PackageStoreError(`Failed to fetch ${tarballUrl}: ${String(e)}`),
      }),
  },
)

export const PackageStoreAdapterStub = (
  ref: PackageStoreTarballRef,
  tarball: Uint8Array,
): Layer.Layer<PackageStoreAdapter, never, never> =>
  Layer.succeed(PackageStoreAdapter, {
    resolveTarballRef: () => Effect.succeed(ref),
    fetchTarball: () => Effect.succeed(tarball),
  })

async function resolveTarballRef(
  packageSpecs: ReadonlyArray<ParsedPackageSpec>,
  { before, allowDeprecated, registryBaseUrl }: PackageStoreOptions = {},
): Promise<PackageStoreTarballRef> {
  const baseUrl = registryBaseUrl ?? 'https://registry.npmjs.org'
  const fetchPackument = packageSpecs.some(
    (spec) => spec.versionKind === 'range' || (spec.versionKind === 'tag' && spec.version !== 'latest'),
  )
  const packumentUrl = `${baseUrl}/${packageSpecs[0].name}`
  const includeTimes = before !== undefined && packageSpecs.some((spec) => spec.versionKind !== 'exact')
  const accept = includeTimes ? 'application/json' : 'application/vnd.npm.install-v1+json'
  const packument = fetchPackument
    ? await fetch(packumentUrl, { headers: { accept } }).then((r) => r.json() as unknown)
    : undefined

  for (const packageSpec of packageSpecs) {
    const manifestUrl = `${baseUrl}/${packageSpec.name}/${packageSpec.version || 'latest'}`
    const doc = (packument ?? (await fetch(manifestUrl).then((r) => r.json() as unknown))) as
      | Record<string, unknown>
      | undefined
    if (typeof doc !== 'object' || doc === null) continue
    const error = (doc as { error?: unknown }).error
    if (error && error !== 'Not found') {
      throw new PackageStoreError(`Unexpected response from ${manifestUrl}: ${JSON.stringify(doc)}`)
    }
    const isManifest = typeof (doc as { version?: unknown }).version === 'string'
    let tarballUrl: string | undefined
    let packageVersion: string | undefined
    if (packageSpec.versionKind === 'range') {
      const versions = (doc as {
        versions?: Record<string, { dist: { tarball: string }; deprecated?: string }>
      }).versions
      if (versions) {
        const satisfying = maxSatisfying(
          Object.keys(versions).filter(
            (v) => (allowDeprecated || !versions[v]?.deprecated) && (!before || true),
          ),
          packageSpec.version,
        )
        packageVersion = satisfying ?? undefined
      }
      if (!versions) continue
      if (!packageVersion) continue
      const versionObj = versions[packageVersion]
      tarballUrl = versionObj.dist.tarball
    } else if (packageSpec.versionKind === 'tag' && packageSpec.version !== 'latest') {
      if (!packageVersion) continue
      if (before) {
        const time = (doc as { time?: Record<string, string> }).time?.[packageVersion]
        if (time && new Date(time) > before) continue
      }
      const versionsMap = (doc as { versions: Record<string, { dist: { tarball: string } }> }).versions
      tarballUrl = versionsMap[packageVersion].dist.tarball
    } else if (isManifest) {
      packageVersion = (doc as { version: string }).version
      tarballUrl = (doc as { dist?: { tarball?: string } }).dist?.tarball
    } else {
      const distTags = (doc as { 'dist-tags'?: { latest?: string } })['dist-tags']
      packageVersion = distTags?.latest
      const versions = (doc as { versions?: Record<string, { dist: { tarball: string } }> }).versions
      if (packageVersion && versions && versions[packageVersion]) {
        tarballUrl = versions[packageVersion].dist.tarball
      }
    }

    if (packageVersion && tarballUrl) {
      return { packageName: packageSpec.name, packageVersion, tarballUrl }
    }
  }
  throw new PackageNotFoundError(packageSpecs)
}

async function fetchTarball(tarballUrl: string): Promise<Uint8Array> {
  const buffer = await fetch(tarballUrl).then((r) => r.arrayBuffer())
  return new Uint8Array(buffer)
}
