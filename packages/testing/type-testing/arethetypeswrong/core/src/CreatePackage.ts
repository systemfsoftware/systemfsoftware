import { untar } from '@andrewbranch/untar.js'
import { Option, Schema } from 'effect'
import { type FlateError, FlateErrorCode, Gunzip } from 'fflate'
import ts from 'typescript'
import { TarballPackageJsonSchema } from './NpmRegistry.schema.js'
declare const Buffer: {
  from(data: Uint8Array): Uint8Array
}

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
    this.#files = { ...files }
    this.packageName = packageName
    this.packageVersion = packageVersion
    this.resolvedUrl = resolvedUrl
    this.typesPackage = typesPackage
  }

  tryReadBytes(path: string): string | Uint8Array | undefined {
    return this.#files[path]
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function posixJoin(base: string, relative: string): string {
  return relative.startsWith('/') ? relative : `${base}/${relative}`
}

/**
 * Build a {@link Package} from an authored file tree without a tarball.
 *
 * Tree contract (minor-version stable):
 * - Relative keys are prefixed with `/node_modules/<packageName>/`.
 * - Absolute keys must already use that prefix; scoped names use
 *   `/node_modules/@scope/name/`.
 * - File bodies may be `string` or `Uint8Array`.
 * - A tree with no `package.json` at `/node_modules/<packageName>/package.json`
 *   is refused (throws).
 * - If `package.json` content disagrees with the constructor arguments,
 *   the constructor arguments win: the returned `Package` keeps
 *   `packageName`/`packageVersion` as given, and the file tree's
 *   `package.json` text is left as authored.
 */
export function createPackage(
  files: Record<string, string | Uint8Array>,
  packageName = 'test',
  packageVersion = '1.0.0',
): Package {
  const prefix = `/node_modules/${packageName}/`
  const packageFiles: Record<string, string | Uint8Array> = {}
  for (const [name, content] of Object.entries(files)) {
    if (name.startsWith('/')) {
      assert(name.startsWith(prefix), `Unexpected absolute fixture path: ${name}`)
      packageFiles[name] = content
    } else {
      packageFiles[posixJoin(`/node_modules/${packageName}`, name)] = content
    }
  }

  const pkg = new Package(packageFiles, packageName, packageVersion)
  assert(pkg.fileExists(`${prefix}package.json`), 'Must contain package.json')
  return pkg
}

export type DirectoryJSON = Record<string, string | Uint8Array | null>

/**
 * Project an authored package tree to a memfs {@link DirectoryJSON} that
 * {@link MemoryFileSystem.make} accepts.
 *
 * Keys are kept as `/node_modules/<packageName>/…` (the same prefix
 * `createPackage` uses). Relative keys are prefixed; absolute keys must
 * already use that prefix. Bodies are preserved: `string` stays a string,
 * `Uint8Array` is converted to a `Buffer` so `memfs` treats it as file
 * content rather than a directory entry.
 *
 * Core does not depend on `@systemfsoftware/effect-memfs` — this returns a
 * plain record that is structurally compatible with `Contents`.
 */
export function toDirectoryJSON(
  files: Record<string, string | Uint8Array>,
  packageName = 'test',
): DirectoryJSON {
  const prefix = `/node_modules/${packageName}/`
  const out: DirectoryJSON = {}
  for (const [name, content] of Object.entries(files)) {
    const key = name.startsWith('/') ? name : posixJoin(`/node_modules/${packageName}`, name)
    if (name.startsWith('/')) {
      assert(name.startsWith(prefix), `Unexpected absolute fixture path: ${name}`)
    }
    if (typeof content === 'string') {
      out[key] = content
    } else {
      // memfs `fromJSON` only treats `string | Buffer` as file content;
      // a plain Uint8Array would be misinterpreted as a directory.
      out[key] = Buffer.from(content)
    }
  }
  return out
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
