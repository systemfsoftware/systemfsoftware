import { ensureTrailingDirectorySeparator, posixJoin } from './Path.js'
import { extractTarball } from './Tarball.js'
declare const Buffer: {
  from(data: Uint8Array): Uint8Array
}

function assert(condition: boolean, message: string): asserts condition {
  if (condition) return
  throw new Error(message)
}

export const TypeId: unique symbol = Symbol.for('@systemfsoftware/npm-package/Package')
export type TypeId = typeof TypeId

export const filesMap = new WeakMap<Package, Record<string, string | Uint8Array>>()

export interface Package {
  readonly [TypeId]: TypeId
  readonly packageName: string
  readonly packageVersion: string
  readonly resolvedUrl: string | undefined
  tryReadBytes(path: string): string | Uint8Array | undefined
  tryReadFile(path: string): string | undefined
  readFile(path: string): string
  fileExists(path: string): boolean
  directoryExists(path: string): boolean
  listFiles(directory?: string): string[]
  withOverlay(other: Package): Package
}
function decodeStored(
  store: Record<string, string | Uint8Array>,
  path: string,
  file: string | Uint8Array | undefined,
): string | undefined {
  if (file === undefined) return undefined
  return decodeStoredFile(store, path, file)
}

function readStoreFile(
  store: Record<string, string | Uint8Array> | undefined,
  path: string,
): string | undefined {
  if (store === undefined) return undefined
  return decodeStored(store, path, store[path])
}

const PackageProto: Package = {
  [TypeId]: TypeId,
  packageName: '',
  packageVersion: '',
  resolvedUrl: undefined,
  tryReadBytes(this: Package, path: string): string | Uint8Array | undefined {
    return filesMap.get(this)?.[path]
  },
  tryReadFile(this: Package, path: string): string | undefined {
    return readStoreFile(filesMap.get(this), path)
  },
  readFile(this: Package, path: string): string {
    const content = this.tryReadFile(path)
    if (content === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  },
  fileExists(this: Package, path: string): boolean {
    const store = filesMap.get(this)
    return store !== undefined && path in store
  },
  directoryExists(this: Package, path: string): boolean {
    const store = filesMap.get(this)
    if (store === undefined) return false
    const prefix = ensureTrailingDirectorySeparator(path)
    return Object.keys(store).some((file) => file.startsWith(prefix))
  },
  listFiles(this: Package, directory?: string): string[] {
    const store = filesMap.get(this)
    if (store === undefined) return []
    return listPackageFiles(store, directory)
  },
  withOverlay(this: Package, other: Package): Package {
    const combined = Object.assign({}, filesMap.get(this), filesMap.get(other))
    return makePackage(combined, this.packageName, this.packageVersion, this.resolvedUrl)
  },
}

function decodeStoredFile(
  files: Record<string, string | Uint8Array>,
  path: string,
  file: string | Uint8Array,
): string {
  if (typeof file === 'string') {
    return file
  }
  const content = new TextDecoder().decode(file)
  files[path] = content
  return content
}

export function makePackage(
  files: Record<string, string | Uint8Array>,
  packageName: string,
  packageVersion: string,
  resolvedUrl?: string,
): Package {
  const pkg: Package = {
    [TypeId]: TypeId,
    packageName,
    packageVersion,
    resolvedUrl,
    tryReadBytes(p: string) {
      return PackageProto.tryReadBytes.call(this, p)
    },
    tryReadFile(p: string) {
      return PackageProto.tryReadFile.call(this, p)
    },
    readFile(p: string) {
      return PackageProto.readFile.call(this, p)
    },
    fileExists(p: string) {
      return PackageProto.fileExists.call(this, p)
    },
    directoryExists(p: string) {
      return PackageProto.directoryExists.call(this, p)
    },
    listFiles(dir?: string) {
      return PackageProto.listFiles.call(this, dir)
    },
    withOverlay(other: Package) {
      return PackageProto.withOverlay.call(this, other)
    },
  }
  filesMap.set(pkg, { ...files })
  return pkg
}

export const Package = {
  make: makePackage,
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
  const pkg = makePackage(packageFiles, packageName, packageVersion)
  assert(pkg.fileExists(`${prefix}package.json`), 'Must contain package.json')
  return pkg
}

/**
 * Build a {@link (Package:interface)} from an authored file tree without a tarball.
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
  return makePackage(files, packageName, packageVersion)
}
