import { ensureTrailingDirectorySeparator, posixJoin } from './Path.js'
import { extractTarball } from './Tarball.js'
declare const Buffer: {
  from(data: Uint8Array): Uint8Array
}

function assert(condition: boolean, message: string): asserts condition {
  if (condition) return
  throw new Error(message)
}

export class Package {
  #files: Record<string, string | Uint8Array> = {}
  readonly packageName: string
  readonly packageVersion: string
  readonly resolvedUrl: string | undefined

  constructor(
    files: Record<string, string | Uint8Array>,
    packageName: string,
    packageVersion: string,
    resolvedUrl?: string,
  ) {
    this.#files = { ...files }
    this.packageName = packageName
    this.packageVersion = packageVersion
    this.resolvedUrl = resolvedUrl
  }

  tryReadBytes(path: string): string | Uint8Array | undefined {
    return this.#files[path]
  }

  tryReadFile(path: string): string | undefined {
    const file = this.#files[path]
    if (file === undefined) {
      return undefined
    }
    return this.decodeStoredFile(path, file)
  }

  private decodeStoredFile(path: string, file: string | Uint8Array): string {
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
    const prefix = ensureTrailingDirectorySeparator(path)
    return Object.keys(this.#files).some((file) => file.startsWith(prefix))
  }

  listFiles(directory?: string): string[] {
    return listPackageFiles(this.#files, directory)
  }

  /**
   * Merge `other`'s files over this package's, returning a new package and
   * mutating neither. The result keeps THIS package's name, version and
   * resolved URL, so when `other` carries its own `package.json` the returned
   * package's `packageName` need not match the name inside its own bytes.
   */
  withOverlay(other: Package): Package {
    const files = { ...this.#files, ...other.#files }
    return new Package(files, this.packageName, this.packageVersion, this.resolvedUrl)
  }
}

function directoryWithRoot(directory: string | undefined): string {
  if (directory === undefined) return '/'
  return directory
}

function listFilesWithPrefix(
  files: Record<string, string | Uint8Array>,
  prefix: string,
): string[] {
  if (prefix === '/') return Object.keys(files)
  return Object.keys(files).filter((f) => f.startsWith(prefix))
}

function listPackageFiles(
  files: Record<string, string | Uint8Array>,
  directory: string | undefined,
): string[] {
  return listFilesWithPrefix(files, ensureTrailingDirectorySeparator(directoryWithRoot(directory)))
}

function defaultPackageName(packageName: string | undefined): string {
  if (packageName === undefined) return 'test'
  return packageName
}

function defaultPackageVersion(packageVersion: string | undefined): string {
  if (packageVersion === undefined) return '1.0.0'
  return packageVersion
}

function collectPackageFiles(
  files: Record<string, string | Uint8Array>,
  packageName: string,
): Record<string, string | Uint8Array> {
  const prefix = `/node_modules/${packageName}/`
  const packageFiles: Record<string, string | Uint8Array> = {}
  for (const [name, content] of Object.entries(files)) {
    assignPackageFile(packageFiles, prefix, packageName, name, content)
  }
  return packageFiles
}

function collectDirectoryJSON(
  files: Record<string, string | Uint8Array>,
  packageName: string,
): DirectoryJSON {
  const prefix = `/node_modules/${packageName}/`
  const out: DirectoryJSON = {}
  for (const [name, content] of Object.entries(files)) {
    out[directoryKey(name, packageName, prefix)] = directoryValue(content)
  }
  return out
}

function assignPackageFile(
  packageFiles: Record<string, string | Uint8Array>,
  prefix: string,
  packageName: string,
  name: string,
  content: string | Uint8Array,
): void {
  if (!name.startsWith('/')) {
    packageFiles[posixJoin(`/node_modules/${packageName}`, name)] = content
    return
  }
  assert(name.startsWith(prefix), `Unexpected absolute fixture path: ${name}`)
  packageFiles[name] = content
}

function packageWithJson(
  packageFiles: Record<string, string | Uint8Array>,
  packageName: string,
  packageVersion: string,
  prefix: string,
): Package {
  const pkg = new Package(packageFiles, packageName, packageVersion)
  assert(pkg.fileExists(`${prefix}package.json`), 'Must contain package.json')
  return pkg
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
  packageName?: string,
  packageVersion?: string,
): Package {
  const name = defaultPackageName(packageName)
  return packageWithJson(
    collectPackageFiles(files, name),
    name,
    defaultPackageVersion(packageVersion),
    `/node_modules/${name}/`,
  )
}

export type DirectoryJSON = Record<string, string | Uint8Array | null>

function directoryKey(name: string, packageName: string, prefix: string): string {
  if (!name.startsWith('/')) {
    return posixJoin(`/node_modules/${packageName}`, name)
  }
  assert(name.startsWith(prefix), `Unexpected absolute fixture path: ${name}`)
  return name
}

function directoryValue(content: string | Uint8Array): string | Uint8Array {
  if (typeof content === 'string') return content
  // memfs `fromJSON` only treats `string | Buffer` as file content;
  // a plain Uint8Array would be misinterpreted as a directory.
  return Buffer.from(content)
}

/**
 * Project an authored package tree to a memfs {@link DirectoryJSON} that
 * `MemoryFileSystem.make` accepts.
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
  packageName?: string,
): DirectoryJSON {
  return collectDirectoryJSON(files, defaultPackageName(packageName))
}

export function createPackageFromTarballData(tarball: Uint8Array): Package {
  const { files, packageName, packageVersion } = extractTarball(tarball)
  return new Package(files, packageName, packageVersion)
}
