import { Context, Effect, Layer, Option, Schema } from 'effect'
import { maxSatisfying } from 'semver'

import { type NpmRegistryDoc, NpmRegistryDocSchema } from './NpmRegistry.schema.js'
import type { ParsedPackageSpec } from './PackageSpec.schema.js'
import { PackageNotFoundError, PackageStoreError } from './PackageStore.schema.js'

export interface PackageStoreTarballRef {
  readonly packageName: string
  readonly packageVersion: string
  readonly tarballUrl: string
}

export { PackageNotFoundError, PackageStoreError }

export interface PackageStoreOptions {
  readonly before?: Date
  readonly allowDeprecated?: boolean
  readonly registryBaseUrl?: string
}

export interface PackageStoreService {
  readonly resolveTarballRef: (
    specs: readonly ParsedPackageSpec[],
    options?: PackageStoreOptions,
  ) => Effect.Effect<PackageStoreTarballRef, PackageNotFoundError | PackageStoreError>
  readonly fetchTarball: (tarballUrl: string) => Effect.Effect<Uint8Array, PackageStoreError>
}

export class PackageStore extends Context.Service<PackageStore, PackageStoreService>()(
  '@systemfsoftware/arethetypeswrong/PackageStore',
) {}

export const PackageStoreLive: Layer.Layer<PackageStore, never, never> = Layer.succeed(
  PackageStore,
  {
    resolveTarballRef: (specs, options) =>
      Effect.tryPromise({
        try: () => resolveTarballRef(specs, options),
        catch: (e): PackageNotFoundError | PackageStoreError =>
          e instanceof PackageNotFoundError
            ? e
            : new PackageStoreError({ message: `Failed to resolve ${nameOf(specs)}`, cause: e }),
      }),
    fetchTarball: (tarballUrl) =>
      Effect.tryPromise({
        try: () => fetchTarball(tarballUrl),
        catch: (e) => new PackageStoreError({ message: `Failed to fetch ${tarballUrl}`, cause: e }),
      }),
  },
)

export const PackageStoreStub = (
  ref: PackageStoreTarballRef,
  tarball: Uint8Array,
): Layer.Layer<PackageStore, never, never> =>
  Layer.succeed(PackageStore, {
    resolveTarballRef: () => Effect.succeed(ref),
    fetchTarball: () => Effect.succeed(tarball),
  })

const nameOf = (specs: readonly ParsedPackageSpec[]): string => specs[0]?.name ?? '<no spec>'

const decodeRegistryDoc = Schema.decodeUnknownOption(NpmRegistryDocSchema)

/** The tarball URL a spec resolves to inside one registry document, if any. */
const tarballFor = (
  doc: NpmRegistryDoc,
  spec: ParsedPackageSpec,
  options: PackageStoreOptions,
): PackageStoreTarballRef | undefined => {
  const versions = doc.versions
  if (spec.versionKind === 'range') {
    if (versions === undefined) return undefined
    const candidates = Object.keys(versions).filter(
      (version) => options.allowDeprecated === true || versions[version]?.deprecated === undefined,
    )
    const packageVersion = maxSatisfying(candidates, spec.version)
    if (packageVersion === null) return undefined
    const tarballUrl = versions[packageVersion]?.dist.tarball
    return tarballUrl === undefined
      ? undefined
      : { packageName: spec.name, packageVersion, tarballUrl }
  }
  if (spec.versionKind === 'tag' && spec.version !== 'latest') {
    // A named tag names no version in the packument's `versions` map, so the
    // tag has to be looked up in `dist-tags` before a tarball exists for it.
    const packageVersion = doc['dist-tags']?.[spec.version]
    if (packageVersion === undefined) return undefined
    const publishedAt = doc.time?.[packageVersion]
    if (options.before !== undefined && publishedAt !== undefined && new Date(publishedAt) > options.before) {
      return undefined
    }
    const tarballUrl = versions?.[packageVersion]?.dist.tarball
    return tarballUrl === undefined
      ? undefined
      : { packageName: spec.name, packageVersion, tarballUrl }
  }
  if (doc.version !== undefined) {
    const tarballUrl = doc.dist?.tarball
    return tarballUrl === undefined
      ? undefined
      : { packageName: spec.name, packageVersion: doc.version, tarballUrl }
  }
  const packageVersion = doc['dist-tags']?.['latest']
  if (packageVersion === undefined) return undefined
  const tarballUrl = versions?.[packageVersion]?.dist.tarball
  return tarballUrl === undefined
    ? undefined
    : { packageName: spec.name, packageVersion, tarballUrl }
}

async function resolveTarballRef(
  packageSpecs: readonly ParsedPackageSpec[],
  options: PackageStoreOptions = {},
): Promise<PackageStoreTarballRef> {
  const baseUrl = options.registryBaseUrl ?? 'https://registry.npmjs.org'
  const fetchPackument = packageSpecs.some(
    (spec) => spec.versionKind === 'range' || (spec.versionKind === 'tag' && spec.version !== 'latest'),
  )
  // The install-v1 abbreviated document omits `time`, so publish dates are only
  // requested when a `before` cutoff actually needs them.
  const includeTimes = options.before !== undefined && packageSpecs.some((spec) => spec.versionKind !== 'exact')
  const accept = includeTimes ? 'application/json' : 'application/vnd.npm.install-v1+json'
  const packument: unknown = fetchPackument
    ? await fetch(`${baseUrl}/${nameOf(packageSpecs)}`, { headers: { accept } }).then((r) => r.json())
    : undefined

  for (const packageSpec of packageSpecs) {
    const manifestUrl = `${baseUrl}/${packageSpec.name}/${packageSpec.version || 'latest'}`
    const payload: unknown = packument ?? await fetch(manifestUrl).then((r) => r.json())
    const decoded = decodeRegistryDoc(payload)
    if (Option.isNone(decoded)) {
      throw new PackageStoreError({ message: `Unexpected response from ${manifestUrl}` })
    }
    const doc = decoded.value
    // `Not found` is how the registry reports a miss for one spec; every other
    // error document means the request itself was wrong and must not be retried
    // against the remaining specs.
    if (doc.error !== undefined && doc.error !== 'Not found') {
      throw new PackageStoreError({ message: `Unexpected response from ${manifestUrl}: ${doc.error}` })
    }
    const ref = tarballFor(doc, packageSpec, options)
    if (ref !== undefined) return ref
  }
  throw new PackageNotFoundError({ packageName: nameOf(packageSpecs) })
}

async function fetchTarball(tarballUrl: string): Promise<Uint8Array> {
  const buffer = await fetch(tarballUrl).then((r) => r.arrayBuffer())
  return new Uint8Array(buffer)
}
