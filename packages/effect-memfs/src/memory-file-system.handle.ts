import { Effect, Match, Option, Predicate, Queue, Stream } from 'effect'
import * as Arr from 'effect/Array'
import * as ByteSize from 'effect/ByteSize'
import * as FileSystem from 'effect/FileSystem'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import * as Error from 'effect/PlatformError'
import * as Random from 'effect/Random'
import * as Result from 'effect/Result'
import * as memfs from 'memfs'
import {
  decodeWatchEvent,
  DriverWatchEvent,
  type DriverWatchEventType,
  type WatchEventDecision,
} from './decode-watch-event.workflow.js'
import { ShapeRefusal } from './MemoryFileSystemError.schema.js'
import type { MemoryFileSystemSpec } from './MemoryFileSystemSpec.schema.js'
import * as OpenFile from './open-file.handle.js'

export const TypeId = Symbol.for('~systemfsoftware/memfs/MemoryFileSystem')
export type TypeId = typeof TypeId

const DriverId: unique symbol = Symbol.for('~systemfsoftware/memfs/MemoryFileSystem/driver')

export interface MemoryFileSystem extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly [DriverId]: memfs.IFs
  readonly cwd: string
}

export const isMemoryFileSystem = (u: unknown): u is MemoryFileSystem => Predicate.hasProperty(u, TypeId)

export const make = (spec: MemoryFileSystemSpec): MemoryFileSystem => ({
  [TypeId]: TypeId,
  [DriverId]: memfs.createFsFromVolume(memfs.Volume.fromJSON(spec.contents, spec.cwd)),
  cwd: spec.cwd,
  ...Prototype,
})

// ---------------------------------------------------------------------------
// The driver's failures, named in the domain's vocabulary
// ---------------------------------------------------------------------------

const REASON_BY_ERRNO: Readonly<Record<string, Error.SystemErrorTag>> = {
  EACCES: 'PermissionDenied',
  EBUSY: 'Busy',
  EEXIST: 'AlreadyExists',
  EISDIR: 'BadResource',
  ELOOP: 'BadResource',
  ENOENT: 'NotFound',
  ENOTDIR: 'BadResource',
  EINVAL: 'InvalidData',
  EPERM: 'PermissionDenied',
  ENOTEMPTY: 'BadResource',
  EBADF: 'BadResource',
  EAGAIN: 'WouldBlock',
}

const stringOrEmpty = <V = unknown>(value: V): string => (typeof value === 'string' ? value : '')

const stringFieldOf = <E = unknown>(error: E, property: string): string => {
  if (!Predicate.hasProperty(error, property)) {
    return ''
  }
  return stringOrEmpty(error[property])
}

const tagOf = (code: string): Error.SystemErrorTag => REASON_BY_ERRNO[code] ?? 'Unknown'

const failureOf = (method: string) => <E = unknown>(error: E): Error.PlatformError =>
  Error.systemError({
    _tag: tagOf(stringFieldOf(error, 'code')),
    module: 'FileSystem',
    method,
    description: `${method} failed`,
    pathOrDescriptor: stringFieldOf(error, 'path'),
    syscall: stringFieldOf(error, 'syscall'),
    cause: error,
  })

const shapeFailure = (shape: string) => (cause: ShapeRefusal): Error.PlatformError =>
  Error.systemError({
    _tag: 'BadResource',
    module: 'FileSystem',
    method: cause.method,
    description: `${cause.method} failed: the driver returned a value that is not a ${shape}`,
    cause,
  })

// ---------------------------------------------------------------------------
// What the port asks for, translated into what the driver takes
// ---------------------------------------------------------------------------

interface AccessConstants {
  readonly F_OK: number
  readonly R_OK: number
  readonly W_OK: number
}

interface AccessOptions {
  readonly ok?: boolean | undefined
  readonly readable?: boolean | undefined
  readonly writable?: boolean | undefined
}

interface MakeDirectoryOptions {
  readonly recursive?: boolean | undefined
  readonly mode?: number | undefined
}

interface CopyOptions {
  readonly overwrite?: boolean | undefined
  readonly preserveTimestamps?: boolean | undefined
}

interface RemoveOptions {
  readonly recursive?: boolean | undefined
  readonly force?: boolean | undefined
}

interface OpenOptions {
  readonly flag?: FileSystem.OpenFlag | undefined
  readonly mode?: number | undefined
}

interface WriteFileOptions {
  readonly flag?: FileSystem.OpenFlag | undefined
  readonly mode?: number | undefined
}

interface GlobOptions {
  readonly root?: string | undefined
  readonly exclude?: ReadonlyArray<string> | undefined
}

interface TempOptions {
  readonly directory?: string | undefined
  readonly prefix?: string | undefined
  readonly suffix?: string | undefined
}

const withReadable = (mode: number, constants: AccessConstants, options: AccessOptions): number => {
  if (options.readable === true) {
    return mode | constants.R_OK
  }
  return mode
}

const withWritable = (mode: number, constants: AccessConstants, options: AccessOptions): number => {
  if (options.writable === true) {
    return mode | constants.W_OK
  }
  return mode
}

const accessModeFromOptions = (constants: AccessConstants, options: AccessOptions): number =>
  withWritable(withReadable(constants.F_OK, constants, options), constants, options)

const accessModeOf = (constants: AccessConstants, options?: AccessOptions): number => {
  if (options === undefined) {
    return constants.F_OK
  }
  return accessModeFromOptions(constants, options)
}

const isRecursive = (options?: { readonly recursive?: boolean | undefined }): boolean =>
  options !== undefined && options.recursive === true

const modeOrDefault = (mode: number | undefined): number => {
  if (mode === undefined) {
    return 0o755
  }
  return mode
}

const makeDirectoryMode = (options?: MakeDirectoryOptions): number => {
  if (options === undefined) {
    return 0o755
  }
  return modeOrDefault(options.mode)
}

const makeDirectoryArgsOf = (
  options?: MakeDirectoryOptions,
): { readonly recursive: boolean; readonly mode: number } => ({
  recursive: isRecursive(options),
  mode: makeDirectoryMode(options),
})

const isOverwrite = (options?: CopyOptions): boolean => options !== undefined && options.overwrite === true

const isPreserveTimestamps = (options?: CopyOptions): boolean =>
  options !== undefined && options.preserveTimestamps === true

const copyArgsOf = (
  options?: CopyOptions,
): { readonly force: boolean; readonly preserveTimestamps: boolean; readonly recursive: true } => ({
  force: isOverwrite(options),
  preserveTimestamps: isPreserveTimestamps(options),
  recursive: true,
})

const isForce = (options?: RemoveOptions): boolean => options !== undefined && options.force === true

const removeArgsOf = (options?: RemoveOptions): { readonly recursive: boolean; readonly force: boolean } => ({
  recursive: isRecursive(options),
  force: isForce(options),
})

const flagOrDefault = (flag: FileSystem.OpenFlag | undefined): FileSystem.OpenFlag => {
  if (flag === undefined) {
    return 'r'
  }
  return flag
}

const openFlagOf = (options?: OpenOptions): FileSystem.OpenFlag => {
  if (options === undefined) {
    return 'r'
  }
  return flagOrDefault(options.flag)
}

const withWriteFileMode = (
  args: { readonly flag?: FileSystem.OpenFlag },
  mode: number | undefined,
): { readonly flag?: FileSystem.OpenFlag; readonly mode?: number } => {
  if (mode === undefined) {
    return args
  }
  return { ...args, mode }
}

const writeFileBaseArgs = (flag: FileSystem.OpenFlag | undefined): { readonly flag?: FileSystem.OpenFlag } => {
  if (flag === undefined) {
    return {}
  }
  return { flag }
}

const writeFileArgsOf = (
  options?: WriteFileOptions,
): { readonly flag?: FileSystem.OpenFlag; readonly mode?: number } => {
  if (options === undefined) {
    return {}
  }
  return withWriteFileMode(writeFileBaseArgs(options.flag), options.mode)
}

const withGlobExclude = (
  args: { readonly cwd?: string },
  exclude: ReadonlyArray<string> | undefined,
): { readonly cwd?: string; readonly exclude?: Array<string> } => {
  if (exclude === undefined) {
    return args
  }
  return { ...args, exclude: [...exclude] }
}

const globBaseArgs = (root: string | undefined): { readonly cwd?: string } => {
  if (root === undefined) {
    return {}
  }
  return { cwd: root }
}

const globArgsOf = (options?: GlobOptions): { readonly cwd?: string; readonly exclude?: Array<string> } => {
  if (options === undefined) {
    return {}
  }
  return withGlobExclude(globBaseArgs(options.root), options.exclude)
}

const truncateLengthOf = (length?: number): number => length ?? 0

// ---------------------------------------------------------------------------
// Temporary entries: one parent, one prefix, one entropy suffix
// ---------------------------------------------------------------------------

const directoryOrDefault = (directory: string | undefined): string => {
  if (directory === undefined) {
    return '/tmp'
  }
  return directory
}

const tempDirectory = (options?: TempOptions): string => {
  if (options === undefined) {
    return '/tmp'
  }
  return directoryOrDefault(options.directory)
}

const tempPrefix = (options?: TempOptions): string => {
  if (options === undefined) {
    return ''
  }
  return stringOrEmpty(options.prefix)
}

const tempSuffix = (options?: TempOptions): string => {
  if (options === undefined) {
    return ''
  }
  return stringOrEmpty(options.suffix)
}

const tempParentOf = (options?: TempOptions): string => `${tempDirectory(options)}/.`

const tempDirectoryOf = (options?: TempOptions): string => tempParentOf(options) + tempPrefix(options)

const tempFileOf = (entropy: string, options?: TempOptions): string =>
  tempParentOf(options) + tempPrefix(options) + entropy + tempSuffix(options)

// ---------------------------------------------------------------------------
// What the driver returned, decoded into the domain
// ---------------------------------------------------------------------------

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null

const isFunctionProperty = (value: object, property: string): boolean => {
  if (!Predicate.hasProperty(value, property)) {
    return false
  }
  return typeof value[property] === 'function'
}

const isStatRecord = (value: object): value is OpenFile.Stat =>
  isFunctionProperty(value, 'isFile') && isFunctionProperty(value, 'isDirectory')

const isReadWrite = (value: object): boolean => isFunctionProperty(value, 'read') && isFunctionProperty(value, 'write')

const isDriverRecord = (value: object): value is OpenFile.Driver =>
  isFunctionProperty(value, 'close') && isReadWrite(value)

const isStat = (value: unknown): value is OpenFile.Stat => isObject(value) && isStatRecord(value)

const isDriver = (value: unknown): value is OpenFile.Driver => isObject(value) && isDriverRecord(value)

const statOf = <S = unknown>(value: S): Result.Result<OpenFile.Stat, ShapeRefusal> => {
  if (isStat(value)) {
    return Result.succeed(value)
  }
  return Result.fail(new ShapeRefusal({ method: 'stat', cause: value }))
}

const driverOf = <H = unknown>(value: H): Result.Result<OpenFile.Driver, ShapeRefusal> => {
  if (isDriver(value)) {
    return Result.succeed(value)
  }
  return Result.fail(new ShapeRefusal({ method: 'open', cause: value }))
}

const isZeroOrNaN = (value: number): boolean => value === 0 || Number.isNaN(value)

const numberOptionOf = (value: number): Option.Option<number> => {
  if (isZeroOrNaN(value)) {
    return Option.none()
  }
  return Option.some(value)
}

const sizeOptionOf = (value: number): Option.Option<ByteSize.ByteSize> =>
  Option.map(numberOptionOf(value), (n) => ByteSize.bytes(n))

const kindAssociations = (stat: OpenFile.Stat): ReadonlyArray<readonly [boolean, FileSystem.File.Type]> => [
  [stat.isFile(), 'File'],
  [stat.isDirectory(), 'Directory'],
  [stat.isSymbolicLink(), 'SymbolicLink'],
  [stat.isBlockDevice(), 'BlockDevice'],
  [stat.isCharacterDevice(), 'CharacterDevice'],
  [stat.isFIFO(), 'FIFO'],
  [stat.isSocket(), 'Socket'],
]

const kindOf = (stat: OpenFile.Stat): FileSystem.File.Type =>
  Option.match(Arr.findFirst(kindAssociations(stat), ([matches]) => matches), {
    onNone: () => 'Unknown',
    onSome: ([, type]) => type,
  })

const infoOf = (stat: OpenFile.Stat): FileSystem.File.Info => ({
  type: kindOf(stat),
  mtime: Option.fromNullishOr(stat.mtime),
  atime: Option.fromNullishOr(stat.atime),
  birthtime: Option.fromNullishOr(stat.birthtime),
  dev: Number(stat.dev),
  rdev: numberOptionOf(stat.rdev),
  ino: numberOptionOf(stat.ino),
  mode: stat.mode,
  nlink: numberOptionOf(stat.nlink),
  uid: numberOptionOf(stat.uid),
  gid: numberOptionOf(stat.gid),
  size: ByteSize.bytes(Number(stat.size)),
  blksize: sizeOptionOf(stat.blksize),
  blocks: numberOptionOf(stat.blocks),
})

const textOf = (value: string | Uint8Array): string =>
  typeof value === 'string' ? value : new TextDecoder().decode(value)

const bytesOf = (contents: string | Uint8Array): Uint8Array =>
  typeof contents === 'string' ? new TextEncoder().encode(contents) : contents

const isNamed = (entry: unknown): entry is { readonly name: string | Uint8Array } =>
  isObject(entry) && Predicate.hasProperty(entry, 'name')

const entryPathOf = (entry: string | Uint8Array | { readonly name: string | Uint8Array }): string =>
  isNamed(entry) ? textOf(entry.name) : textOf(entry)

const eventTypeOf = (eventType: string): DriverWatchEventType => (eventType === 'rename' ? 'rename' : 'change')

const eventOf = (decision: WatchEventDecision): FileSystem.WatchEvent =>
  Match.value(decision).pipe(
    Match.tag('WatchCreate', (created): FileSystem.WatchEvent => ({ _tag: 'Create', path: created.path })),
    Match.tag('WatchUpdate', (updated): FileSystem.WatchEvent => ({ _tag: 'Update', path: updated.path })),
    Match.tag('WatchRemove', (removed): FileSystem.WatchEvent => ({ _tag: 'Remove', path: removed.path })),
    Match.exhaustive,
  )

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

export const fileSystem = (self: MemoryFileSystem): FileSystem.FileSystem => {
  const nfs = self[DriverId]

  const access: FileSystem.FileSystem['access'] = (path, options) =>
    Effect.tryPromise({
      try: () => nfs.promises.access(path, accessModeOf(nfs.constants, options)),
      catch: failureOf('access'),
    })

  const chmod: FileSystem.FileSystem['chmod'] = (path, mode) =>
    Effect.tryPromise({ try: () => nfs.promises.chmod(path, mode), catch: failureOf('chmod') })

  const chown: FileSystem.FileSystem['chown'] = (path, uid, gid) =>
    Effect.tryPromise({ try: () => nfs.promises.chown(path, uid, gid), catch: failureOf('chown') })

  const copy: FileSystem.FileSystem['copy'] = (fromPath, toPath, options) =>
    Effect.tryPromise({ try: () => nfs.promises.cp(fromPath, toPath, copyArgsOf(options)), catch: failureOf('copy') })

  const copyFile: FileSystem.FileSystem['copyFile'] = (fromPath, toPath) =>
    Effect.tryPromise({ try: () => nfs.promises.copyFile(fromPath, toPath), catch: failureOf('copyFile') })

  const glob: FileSystem.FileSystem['glob'] = (pattern, options) =>
    Effect.tryPromise({
      try: () => Array.fromAsync(nfs.promises.glob(pattern, globArgsOf(options))),
      catch: failureOf('glob'),
    }).pipe(Effect.map((matches) => matches.map(entryPathOf)))

  const link: FileSystem.FileSystem['link'] = (existingPath, newPath) =>
    Effect.tryPromise({ try: () => nfs.promises.link(existingPath, newPath), catch: failureOf('link') })

  const makeDirectory: FileSystem.FileSystem['makeDirectory'] = (path, options) =>
    Effect.tryPromise({
      try: () => nfs.promises.mkdir(path, makeDirectoryArgsOf(options)),
      catch: failureOf('makeDirectory'),
    })

  const removeWith = (method: string): FileSystem.FileSystem['remove'] => (path, options) =>
    Effect.tryPromise({ try: () => nfs.promises.rm(path, removeArgsOf(options)), catch: failureOf(method) })

  const remove = removeWith('remove')

  const makeTempDirectory: FileSystem.FileSystem['makeTempDirectory'] = (options) =>
    Effect.tryPromise({
      try: () => nfs.promises.mkdir(tempParentOf(options), { recursive: true }),
      catch: failureOf('makeTempDirectory'),
    }).pipe(
      Effect.flatMap(() =>
        Effect.tryPromise({
          try: () => nfs.promises.mkdtemp(tempDirectoryOf(options)),
          catch: failureOf('makeTempDirectory'),
        })
      ),
      Effect.map(entryPathOf),
    )

  const makeTempDirectoryScoped: FileSystem.FileSystem['makeTempDirectoryScoped'] = (options) =>
    Effect.acquireRelease(
      makeTempDirectory(options),
      (directory) => Effect.orDie(removeWith('makeTempDirectoryScoped')(directory, { recursive: true })),
    )

  const makeTempFile: FileSystem.FileSystem['makeTempFile'] = (options) =>
    Effect.flatMap(Random.next, (entropy) => {
      const filePath = tempFileOf(entropy.toString(36).slice(2, 10), options)
      return Effect.tryPromise({
        try: () => nfs.promises.mkdir(tempParentOf(options), { recursive: true }),
        catch: failureOf('makeTempFile'),
      }).pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: () => nfs.promises.writeFile(filePath, '').then(() => filePath),
            catch: failureOf('makeTempFile'),
          })
        ),
      )
    })

  const makeTempFileScoped: FileSystem.FileSystem['makeTempFileScoped'] = (options) =>
    Effect.acquireRelease(
      makeTempFile(options),
      (filePath) => Effect.orDie(removeWith('makeTempFileScoped')(filePath, {})),
    )

  const infoFrom =
    <S = unknown>(method: string) => (value: S): Effect.Effect<FileSystem.File.Info, Error.PlatformError> =>
      Effect.fromResult(statOf(value)).pipe(Effect.mapError(shapeFailure(method)), Effect.map(infoOf))

  const stat: FileSystem.FileSystem['stat'] = (path) =>
    Effect.tryPromise({ try: () => nfs.promises.stat(path), catch: failureOf('stat') }).pipe(
      Effect.flatMap(infoFrom('stat record')),
    )

  const open: FileSystem.FileSystem['open'] = (path, options) =>
    Effect.acquireRelease(
      Effect.tryPromise({
        try: () => nfs.promises.open(path, openFlagOf(options)),
        catch: failureOf('open'),
      }).pipe(
        Effect.flatMap((handle) =>
          Effect.fromResult(driverOf(handle)).pipe(Effect.mapError(shapeFailure('file handle')))
        ),
        Effect.flatMap(OpenFile.make),
      ),
      (file) => Effect.orDie(OpenFile.close(file)),
    ).pipe(
      Effect.map((file) => OpenFile.file(file, OpenFile.stat(file).pipe(Effect.flatMap(infoFrom('stat record'))))),
    )

  const readFile: FileSystem.FileSystem['readFile'] = (path) =>
    Effect.tryPromise({ try: () => nfs.promises.readFile(path), catch: failureOf('readFile') }).pipe(
      Effect.map(bytesOf),
    )

  const readLink: FileSystem.FileSystem['readLink'] = (path) =>
    Effect.tryPromise({ try: () => nfs.promises.readlink(path), catch: failureOf('readLink') }).pipe(
      Effect.map(entryPathOf),
    )

  const readDirectory: FileSystem.FileSystem['readDirectory'] = (path, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.readdir(path, { recursive: isRecursive(options) }).then((entries) => entries.map(entryPathOf)),
      catch: failureOf('readDirectory'),
    })

  const realPath: FileSystem.FileSystem['realPath'] = (path) =>
    Effect.tryPromise({ try: () => nfs.promises.realpath(path), catch: failureOf('realPath') }).pipe(
      Effect.map(entryPathOf),
    )

  const rename: FileSystem.FileSystem['rename'] = (oldPath, newPath) =>
    Effect.tryPromise({ try: () => nfs.promises.rename(oldPath, newPath), catch: failureOf('rename') })

  const symlink: FileSystem.FileSystem['symlink'] = (target, path) =>
    Effect.tryPromise({ try: () => nfs.promises.symlink(target, path), catch: failureOf('symlink') })

  const truncate: FileSystem.FileSystem['truncate'] = (path, length) =>
    Effect.tryPromise({
      try: () => nfs.promises.truncate(path, truncateLengthOf(length)),
      catch: failureOf('truncate'),
    })

  const utimes: FileSystem.FileSystem['utimes'] = (path, atime, mtime) =>
    Effect.tryPromise({ try: () => nfs.promises.utimes(path, atime, mtime), catch: failureOf('utimes') })

  const writeFile: FileSystem.FileSystem['writeFile'] = (path, data, options) =>
    Effect.tryPromise({
      try: () => nfs.promises.writeFile(path, data, writeFileArgsOf(options)),
      catch: failureOf('writeFile'),
    })

  const decoded = (eventType: string, filename: string | Uint8Array): FileSystem.WatchEvent =>
    eventOf(
      Result.getOrThrow(
        decodeWatchEvent(
          new DriverWatchEvent({
            eventType: eventTypeOf(eventType),
            filename: entryPathOf(filename),
            exists: nfs.existsSync(entryPathOf(filename)),
          }),
        ),
      ),
    )

  const watch: FileSystem.FileSystem['watch'] = (path, options) =>
    Stream.callback<FileSystem.WatchEvent, Error.PlatformError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          nfs.watch(path, { persistent: false, recursive: isRecursive(options) }, (eventType, filename) => {
            Queue.offerUnsafe(queue, decoded(eventType, filename))
          })
        ),
        (watcher) => Effect.sync(() => watcher.close()),
      )
    )

  return FileSystem.make({
    access,
    chmod,
    chown,
    copy,
    copyFile,
    glob,
    link,
    makeDirectory,
    makeTempDirectory,
    makeTempDirectoryScoped,
    makeTempFile,
    makeTempFileScoped,
    open,
    readFile,
    readDirectory,
    readLink,
    realPath,
    remove,
    rename,
    stat,
    symlink,
    truncate,
    utimes,
    watch,
    writeFile,
  })
}
