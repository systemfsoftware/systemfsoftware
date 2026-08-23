import { ensureTrailingDirectorySeparator, posixJoin } from './Path.js'
import { extractTarball } from './Tarball.js'
declare const Buffer: {
  from(data: Uint8Array): Uint8Array
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
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
    path = ensureTrailingDirectorySeparator(path)
    for (const file in this.#files) {
      if (file.startsWith(path)) {
        return true
      }
    }
    return false
  }

  listFiles(directory = '/'): string[] {
    directory = ensureTrailingDirectorySeparator(directory)
    return directory === '/'
      ? Object.keys(this.#files)
      : Object.keys(this.#files).filter((f) => f.startsWith(directory))
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
