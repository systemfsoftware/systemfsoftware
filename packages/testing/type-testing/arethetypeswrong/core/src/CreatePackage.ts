import { untar } from '@andrewbranch/untar.js'
import { Option, Schema } from 'effect'
import { type FlateError, FlateErrorCode, Gunzip } from 'fflate'
import { major, maxSatisfying, minor, valid, validRange } from 'semver'
import ts from 'typescript'
import { type NpmRegistryDoc, NpmRegistryDocSchema, TarballPackageJsonSchema } from './NpmRegistry.schema.js'
import { type ParsedPackageSpec, parsePackageSpec } from './Utils.js'

export class Package {
  #files: Record<string, string | Uint8Array> = {}
  readonly packageName: string
  readonly packageVersion: string
  readonly resolvedUrl?: string
  readonly typesPackage?: {
    packageName: string
    packageVersion: string
    resolvedUrl?: string
  }

  constructor(
    files: Record<string, string | Uint8Array>,
    packageName: string,
    packageVersion: string,
    resolvedUrl?: string,
    typesPackage?: Package['typesPackage'],
  ) {
    this.#files = files
    this.packageName = packageName
    this.packageVersion = packageVersion
    this.resolvedUrl = resolvedUrl
    this.typesPackage = typesPackage
  }

  tryReadFile(path: string): string | undefined {
    const file = this.#files[path]
    if (file === undefined) {
      return undefined
    }
    if (typeof file === 'string') {
      return file
    }
    const content = new TextDecoder().decode(file)
    this.#files[path] = content
    return content
  }

  readFile(path: string): string {
    const content = this.tryReadFile(path)
    if (content === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  }

  fileExists(path: string): boolean {
    return path in this.#files
  }

  directoryExists(path: string): boolean {
    path = ts.ensureTrailingDirectorySeparator(path)
    for (const file in this.#files) {
      if (file.startsWith(path)) {
        return true
      }
    }
    return false
  }

  containsTypes(directory = '/'): boolean {
    return this.listFiles(directory).some(ts.hasTSFileExtension)
  }

  listFiles(directory = '/'): string[] {
    directory = ts.ensureTrailingDirectorySeparator(directory)
    return directory === '/'
      ? Object.keys(this.#files)
      : Object.keys(this.#files).filter((f) => f.startsWith(directory))
  }

  mergedWithTypes(typesPackage: Package): Package {
    const files = { ...this.#files, ...typesPackage.#files }
    return new Package(files, this.packageName, this.packageVersion, this.resolvedUrl, {
      packageName: typesPackage.packageName,
      packageVersion: typesPackage.packageVersion,
      resolvedUrl: typesPackage.resolvedUrl,
    })
  }
}

export interface CreatePackageFromNpmOptions {
  /**
   * Controls inclusion of a corresponding `@types` package. Ignored if the implementation
   * package contains TypeScript files. The value is the version or SemVer range of the
   * `@types` package to include, `true` to infer the version from the implementation
   * package version, or `false` to prevent inclusion of a `@types` package.
   * @default true
   */
  definitelyTyped?: string | boolean
  before?: Date
  allowDeprecated?: boolean
}

export async function createPackageFromNpm(
  packageSpec: string,
  { definitelyTyped = true, ...options }: CreatePackageFromNpmOptions = {},
): Promise<Package> {
  const parsed = parsePackageSpec(packageSpec)
  if (parsed.status === 'error') {
    throw new Error(parsed.error)
  }
  const packageName = parsed.data.name
  const typesPackageName = ts.getTypesPackageName(packageName)
  const { tarballUrl, packageVersion } = parsed.data.versionKind === 'none' && typeof definitelyTyped === 'string'
    ? await resolveImplementationPackageForTypesPackage(typesPackageName, definitelyTyped, options)
    : await getNpmTarballUrl([parsed.data], options)
  const pkg = await createPackageFromTarballUrl(tarballUrl)
  if (!definitelyTyped || pkg.containsTypes()) {
    return pkg
  }

  let typesPackageData
  if (definitelyTyped === true) {
    typesPackageData = await resolveTypesPackageForPackage(packageName, packageVersion, options)
  } else {
    typesPackageData = await getNpmTarballUrl(
      [
        {
          name: typesPackageName,
          versionKind: valid(definitelyTyped) ? 'exact' : validRange(definitelyTyped) ? 'range' : 'tag',
          version: definitelyTyped,
        },
      ],
      options,
    )
  }

  if (typesPackageData) {
    return pkg.mergedWithTypes(await createPackageFromTarballUrl(typesPackageData.tarballUrl))
  }
  return pkg
}

export async function resolveImplementationPackageForTypesPackage(
  typesPackageName: string,
  typesPackageVersion: string,
  options?: Omit<CreatePackageFromNpmOptions, 'definitelyTyped'>,
): Promise<ResolvedPackageId> {
  if (!typesPackageName.startsWith('@types/')) {
    throw new Error(`'resolveImplementationPackageForTypesPackage' expects an @types package name and version`)
  }
  const packageName = ts.unmangleScopedPackageName(typesPackageName.slice('@types/'.length))
  const version = valid(typesPackageVersion)
  if (version) {
    return getNpmTarballUrl(
      [
        { name: packageName, versionKind: 'range', version: `${major(version)}.${minor(version)}` },
        { name: packageName, versionKind: 'range', version: `${major(version)}` },
        { name: packageName, versionKind: 'tag', version: 'latest' },
      ],
      options,
    )
  }

  const range = validRange(typesPackageVersion)
  if (range) {
    return getNpmTarballUrl(
      [
        { name: packageName, versionKind: 'range', version: range },
        { name: packageName, versionKind: 'tag', version: 'latest' },
      ],
      options,
    )
  }

  throw new Error(`'resolveImplementationPackageForTypesPackage' expects a valid SemVer version or range`)
}

export async function resolveTypesPackageForPackage(
  packageName: string,
  packageVersion: string,
  options?: Omit<CreatePackageFromNpmOptions, 'definitelyTyped'>,
): Promise<ResolvedPackageId | undefined> {
  const typesPackageName = ts.getTypesPackageName(packageName)
  try {
    return await getNpmTarballUrl(
      [
        {
          name: typesPackageName,
          versionKind: 'range',
          version: `${major(packageVersion)}.${minor(packageVersion)}`,
        },
        {
          name: typesPackageName,
          versionKind: 'range',
          version: `${major(packageVersion)}`,
        },
        {
          name: typesPackageName,
          versionKind: 'tag',
          version: 'latest',
        },
      ],
      options,
    )
  } catch {}
}

export interface ResolvedPackageId {
  packageName: string
  packageVersion: string
  tarballUrl: string
}

type RegistryRequestOptions = Omit<CreatePackageFromNpmOptions, 'definitelyTyped'>

interface ResolvedTarball {
  packageVersion: string
  tarballUrl: string
}

async function getNpmTarballUrl(
  packageSpecs: readonly ParsedPackageSpec[],
  { before, allowDeprecated }: RegistryRequestOptions = {},
): Promise<ResolvedPackageId> {
  const accept = registryAcceptHeader(packageSpecs, before)
  const packumentUrl = `https://registry.npmjs.org/${packageSpecs[0].name}`
  const rawPackument = shouldFetchPackument(packageSpecs)
    ? await fetchRegistryJson(packumentUrl, accept)
    : undefined

  for (const packageSpec of packageSpecs) {
    const docUrl = `https://registry.npmjs.org/${packageSpec.name}/${packageSpec.version || 'latest'}`
    const rawDoc = rawPackument || (await fetchRegistryJson(docUrl, accept))
    const doc = decodeRegistryDoc(rawDoc, docUrl)
    if (doc.error && doc.error !== 'Not found') {
      throw new Error(`Unexpected response from ${docUrl}: ${JSON.stringify(rawDoc)}`)
    }
    const resolved = resolveTarballUrl(doc, packageSpec, { before, allowDeprecated })
    if (resolved !== undefined) {
      return { packageName: packageSpec.name, ...resolved }
    }
  }
  throw new Npm404Error(packageSpecs)
}

function shouldFetchPackument(packageSpecs: readonly ParsedPackageSpec[]): boolean {
  return packageSpecs.some(
    (spec) => spec.versionKind === 'range' || (spec.versionKind === 'tag' && spec.version !== 'latest'),
  )
}

function registryAcceptHeader(packageSpecs: readonly ParsedPackageSpec[], before: Date | undefined): string {
  const includeTimes = before !== undefined && packageSpecs.some((spec) => spec.versionKind !== 'exact')
  return includeTimes ? 'application/json' : 'application/vnd.npm.install-v1+json'
}

async function fetchRegistryJson(url: string, accept: string): Promise<unknown> {
  return fetch(url, { headers: { Accept: accept } }).then((response) => response.json())
}

function decodeRegistryDoc(payload: unknown, docUrl: string): NpmRegistryDoc {
  const decoded = Schema.decodeUnknownOption(NpmRegistryDocSchema)(payload)
  if (Option.isNone(decoded)) {
    throw new Error(`Unexpected response from ${docUrl}: ${JSON.stringify(payload)}`)
  }
  return decoded.value
}

function resolveTarballUrl(
  doc: NpmRegistryDoc,
  packageSpec: ParsedPackageSpec,
  options: RegistryRequestOptions,
): ResolvedTarball | undefined {
  if (packageSpec.versionKind === 'range') {
    const packageVersion = resolveRangeVersion(doc, packageSpec.version, options)
    if (packageVersion === undefined) {
      return undefined
    }
    const tarballUrl = doc.versions?.[packageVersion]?.dist.tarball
    if (tarballUrl === undefined) {
      return undefined
    }
    return { packageVersion, tarballUrl }
  }
  if (packageSpec.versionKind === 'tag' && packageSpec.version !== 'latest') {
    const packageVersion = resolveTagVersion(doc, packageSpec.version, options.before)
    if (packageVersion === undefined) {
      return undefined
    }
    const tarballUrl = doc.versions?.[packageVersion]?.dist.tarball
    if (tarballUrl === undefined) {
      return undefined
    }
    return { packageVersion, tarballUrl }
  }
  if (doc.version !== undefined) {
    return resolveManifestTarball(doc)
  }
  return resolvePackumentLatestTarball(doc)
}

function resolveRangeVersion(
  doc: NpmRegistryDoc,
  range: string,
  options: RegistryRequestOptions,
): string | undefined {
  if (doc.versions === undefined) {
    return undefined
  }
  const versions = Object.keys(doc.versions).filter((version) => isUsableVersion(doc, version, options))
  return maxSatisfying(versions, range) ?? undefined
}

function isUsableVersion(doc: NpmRegistryDoc, version: string, options: RegistryRequestOptions): boolean {
  if (!options.allowDeprecated && doc.versions?.[version]?.deprecated) {
    return false
  }
  const publishedAt = doc.time?.[version]
  if (options.before !== undefined && publishedAt !== undefined && new Date(publishedAt) > options.before) {
    return false
  }
  return true
}

function resolveTagVersion(doc: NpmRegistryDoc, tag: string, before: Date | undefined): string | undefined {
  const packageVersion = doc['dist-tags']?.[tag]
  if (packageVersion === undefined) {
    return undefined
  }
  const publishedAt = doc.time?.[packageVersion]
  if (before !== undefined && publishedAt !== undefined && new Date(publishedAt) > before) {
    return undefined
  }
  return packageVersion
}

function resolveManifestTarball(doc: NpmRegistryDoc): ResolvedTarball | undefined {
  if (doc.version === undefined) {
    return undefined
  }
  const tarballUrl = doc.dist?.tarball
  if (tarballUrl === undefined) {
    return undefined
  }
  return { packageVersion: doc.version, tarballUrl }
}

function resolvePackumentLatestTarball(doc: NpmRegistryDoc): ResolvedTarball | undefined {
  const packageVersion = doc['dist-tags']?.['latest']
  if (packageVersion === undefined) {
    return undefined
  }
  const tarballUrl = doc.versions?.[packageVersion]?.dist.tarball
  if (tarballUrl === undefined) {
    return undefined
  }
  return { packageVersion, tarballUrl }
}

export class Npm404Error extends Error {
  kind = 'Npm404Error'
  constructor(public packageSpecs: readonly ParsedPackageSpec[]) {
    super(`Failed to find a matching version for ${packageSpecs[0].name}`)
  }
}

export async function createPackageFromTarballUrl(tarballUrl: string): Promise<Package> {
  const tarball = await fetchTarball(tarballUrl)
  const { files, packageName, packageVersion } = extractTarball(tarball)
  return new Package(files, packageName, packageVersion, tarballUrl)
}

async function fetchTarball(tarballUrl: string) {
  return new Uint8Array((await fetch(tarballUrl).then((r) => r.arrayBuffer())) satisfies ArrayBuffer)
}

export function createPackageFromTarballData(tarball: Uint8Array): Package {
  const { files, packageName, packageVersion } = extractTarball(tarball)
  return new Package(files, packageName, packageVersion)
}

interface ExtractedTarball {
  files: Record<string, Uint8Array>
  packageName: string
  packageVersion: string
}

function isInvalidHeaderError(error: unknown): error is FlateError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === FlateErrorCode.InvalidHeader
}

function extractTarball(tarball: Uint8Array): ExtractedTarball {
  // Use streaming API to work around https://github.com/101arrowz/fflate/issues/207
  const chunks: Uint8Array[] = []
  try {
    new Gunzip((chunk) => chunks.push(chunk)).push(tarball, /*final*/ true)
  } catch (err) {
    // this happens for zero-padded tarballs; can safely ignore
    if (!isInvalidHeaderError(err)) {
      throw err
    }
  }
  const unzipped = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    unzipped.set(chunk, offset)
    offset += chunk.length
  }
  const data = untar(unzipped.buffer)
  const prefix = data[0].filename.substring(0, data[0].filename.indexOf('/') + 1)
  const packageJsonFile = data.find((f) => f.filename === `${prefix}package.json`)
  if (packageJsonFile === undefined) {
    throw new Error(`Package tarball does not contain ${prefix}package.json`)
  }
  const packageJsonText = new TextDecoder().decode(packageJsonFile.fileData)
  const decoded = Schema.decodeUnknownOption(TarballPackageJsonSchema)(JSON.parse(packageJsonText))
  if (Option.isNone(decoded)) {
    throw new Error(`Invalid package.json in ${prefix}package.json: ${packageJsonText}`)
  }
  const { name: packageName, version: packageVersion } = decoded.value
  const files = data.reduce((acc: Record<string, Uint8Array>, file) => {
    acc[ts.combinePaths('/node_modules/' + packageName, file.filename.substring(prefix.length))] = file.fileData
    return acc
  }, {})
  return { files, packageName, packageVersion }
}
