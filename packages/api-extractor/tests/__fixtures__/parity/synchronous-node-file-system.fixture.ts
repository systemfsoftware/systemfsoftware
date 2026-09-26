import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import * as ByteSize from 'effect/ByteSize'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as PlatformError from 'effect/PlatformError'
import * as fs from 'node:fs'
import * as nodePath from 'node:path'

type ReasonTag = 'NotFound' | 'PermissionDenied' | 'AlreadyExists' | 'BadResource' | 'Busy' | 'Unknown'

const reasonOf = (code: string): ReasonTag =>
  Match.value(code).pipe(
    Match.when('ENOENT', (): ReasonTag => 'NotFound'),
    Match.when('EACCES', (): ReasonTag => 'PermissionDenied'),
    Match.when('EEXIST', (): ReasonTag => 'AlreadyExists'),
    Match.when('EISDIR', (): ReasonTag => 'BadResource'),
    Match.when('ENOTDIR', (): ReasonTag => 'BadResource'),
    Match.when('ELOOP', (): ReasonTag => 'BadResource'),
    Match.when('EBUSY', (): ReasonTag => 'Busy'),
    Match.orElse((): ReasonTag => 'Unknown'),
  )

const fieldOf = (source: unknown, key: string): string =>
  typeof source === 'object' && source !== null && key in source ? String(Reflect.get(source, key)) : ''

const platformErrorOf = (method: string, cause: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: reasonOf(fieldOf(cause, 'code')),
    module: 'FileSystem',
    method,
    description: `${method} failed`,
    pathOrDescriptor: fieldOf(cause, 'path'),
    syscall: fieldOf(cause, 'syscall'),
    cause,
  })

const synced = <A>(method: string, act: () => A): Effect.Effect<A, PlatformError.PlatformError> =>
  Effect.try({ try: act, catch: (cause) => platformErrorOf(method, cause) })

const typeOf = (stat: fs.Stats): FileSystem.File.Type =>
  stat.isFile()
    ? 'File'
    : stat.isDirectory()
    ? 'Directory'
    : stat.isSymbolicLink()
    ? 'SymbolicLink'
    : stat.isBlockDevice()
    ? 'BlockDevice'
    : stat.isCharacterDevice()
    ? 'CharacterDevice'
    : stat.isFIFO()
    ? 'FIFO'
    : stat.isSocket()
    ? 'Socket'
    : 'Unknown'

const infoOf = (stat: fs.Stats): FileSystem.File.Info => ({
  type: typeOf(stat),
  mtime: Option.fromNullishOr(stat.mtime),
  atime: Option.fromNullishOr(stat.atime),
  birthtime: Option.fromNullishOr(stat.birthtime),
  dev: stat.dev,
  ino: Option.fromNullishOr(stat.ino),
  mode: stat.mode,
  nlink: Option.fromNullishOr(stat.nlink),
  uid: Option.fromNullishOr(stat.uid),
  gid: Option.fromNullishOr(stat.gid),
  rdev: Option.fromNullishOr(stat.rdev),
  size: ByteSize.bytes(stat.size),
  blksize: stat.blksize === undefined ? Option.none() : Option.some(ByteSize.bytes(stat.blksize)),
  blocks: Option.fromNullishOr(stat.blocks),
})

const accessModeOf = (options?: {
  readonly readable?: boolean | undefined
  readonly writable?: boolean | undefined
}): number => {
  const readable = options?.readable === true ? fs.constants.R_OK : 0
  const writable = options?.writable === true ? fs.constants.W_OK : 0
  return fs.constants.F_OK | readable | writable
}

const directoryEntries = (directory: string, recursive: boolean): Array<string> => {
  const found: Array<string> = []
  const descend = (base: string, prefix: string): void => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      found.push(relative)
      if (recursive && entry.isDirectory()) descend(nodePath.join(base, entry.name), relative)
    }
  }
  descend(directory, '')
  return found
}

const readFile: FileSystem.FileSystem['readFile'] = (path) => synced('readFile', () => fs.readFileSync(path))

const writeFile: FileSystem.FileSystem['writeFile'] = (path, data, options) =>
  synced('writeFile', () => fs.writeFileSync(path, data, { flag: options?.flag, mode: options?.mode }))

const writeFileString: FileSystem.FileSystem['writeFileString'] = (path, data, options) =>
  Effect.flatMap(Effect.sync(() => new TextEncoder().encode(data)), (bytes) => writeFile(path, bytes, options))

const readFileString: FileSystem.FileSystem['readFileString'] = (path, encoding) =>
  Effect.flatMap(readFile(path), (bytes) =>
    Effect.try({
      try: () => new TextDecoder(encoding).decode(bytes),
      catch: (cause) =>
        PlatformError.badArgument({
          module: 'FileSystem',
          method: 'readFileString',
          description: 'invalid encoding',
          cause,
        }),
    }))

const overrides = {
  access: (path, options) => synced('access', () => fs.accessSync(path, accessModeOf(options))),
  exists: (path) => Effect.sync(() => fs.existsSync(path)),
  makeDirectory: (path, options) =>
    synced('makeDirectory', () => fs.mkdirSync(path, { recursive: options?.recursive ?? false, mode: options?.mode })),
  readDirectory: (path, options) =>
    synced('readDirectory', () => directoryEntries(path, options?.recursive === true)),
  readFile,
  readFileString,
  stat: (path) => Effect.map(synced('stat', () => fs.statSync(path)), infoOf),
  writeFile,
  writeFileString,
} satisfies Pick<
  FileSystem.FileSystem,
  | 'access'
  | 'exists'
  | 'makeDirectory'
  | 'readDirectory'
  | 'readFile'
  | 'readFileString'
  | 'stat'
  | 'writeFile'
  | 'writeFileString'
>

export const layer: Layer.Layer<FileSystem.FileSystem> = Layer.effect(
  FileSystem.FileSystem,
  FileSystem.FileSystem.useSync((base): FileSystem.FileSystem => ({ ...base, ...overrides })),
).pipe(Layer.provide(nodeFileSystemLayer))
