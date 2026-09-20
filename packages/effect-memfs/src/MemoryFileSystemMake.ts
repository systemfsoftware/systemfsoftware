import * as ByteSize from 'effect/ByteSize'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Error from 'effect/PlatformError'
import * as Random from 'effect/Random'
import * as Stream from 'effect/Stream'
import * as memfs from 'memfs'
import type { Contents, FileHandle, Stat } from './MemoryFileSystemShape.js'

const REASON_BY_ERRNO: Record<string, Error.SystemErrorTag> = {
  EACCES: 'PermissionDenied',
  EBUSY: 'Busy',
  EEXIST: 'AlreadyExists',
  EISDIR: 'BadResource',
  ELOOP: 'BadResource',
  ENOENT: 'NotFound',
  ENOTDIR: 'BadResource',
}

type Cursor = { position: bigint }

type AccessConstants = {
  readonly F_OK: number
  readonly R_OK: number
  readonly W_OK: number
}

type AccessOptions = {
  readonly ok?: boolean | undefined
  readonly readable?: boolean | undefined
  readonly writable?: boolean | undefined
}

type CopyOptions = {
  readonly overwrite?: boolean | undefined
  readonly preserveTimestamps?: boolean | undefined
}

type MakeDirectoryOptions = {
  readonly recursive?: boolean | undefined
  readonly mode?: number | undefined
}

type TempOptions = {
  readonly directory?: string | undefined
  readonly prefix?: string | undefined
}

type OpenOptions = {
  readonly flag?: FileSystem.OpenFlag | undefined
  readonly mode?: number | undefined
}

type WriteFileOptions = {
  readonly flag?: FileSystem.OpenFlag | undefined
  readonly mode?: number | undefined
}

type GlobOptions = {
  readonly root?: string | undefined
  readonly exclude?: ReadonlyArray<string> | undefined
}

const isObject = (value: unknown): value is object => {
  if (typeof value !== 'object') return false
  return value !== null
}

const nameFromObject = (entry: object): string => {
  if ('name' in entry) return stringIfString(entry.name)
  return ''
}

const toGlobPath = (entry: unknown): string => {
  if (!isObject(entry)) return stringIfString(entry)
  return nameFromObject(entry)
}
const stringIfString = (value: unknown): string => {
  if (typeof value === 'string') return value
  return ''
}

const stringFieldFromRecord = (err: object, key: string): string => {
  if (!(key in err)) return ''
  return stringIfString(Reflect.get(err, key))
}

const stringField = (err: unknown, key: string): string => {
  if (!isObject(err)) return ''
  return stringFieldFromRecord(err, key)
}

const isFunctionAtKey = (value: object, key: string): boolean => {
  if (!(key in value)) return false
  return typeof Reflect.get(value, key) === 'function'
}

const hasFunction = (value: unknown, key: string): boolean => {
  if (!isObject(value)) return false
  return isFunctionAtKey(value, key)
}

const hasReadAndWrite = (value: unknown): boolean => {
  if (!hasFunction(value, 'read')) return false
  return hasFunction(value, 'write')
}

const isFileHandle = (value: unknown): value is FileHandle => {
  if (!hasFunction(value, 'close')) return false
  return hasReadAndWrite(value)
}

const isStat = (value: unknown): value is Stat => {
  if (!hasFunction(value, 'isFile')) return false
  return hasFunction(value, 'isDirectory')
}

const toFileHandle = (handle: unknown): FileHandle => {
  if (isFileHandle(handle)) return handle
  throw new TypeError('memfs returned a value that is not a file handle')
}

const toStat = (stat: unknown): Stat => {
  if (isStat(stat)) return stat
  throw new TypeError('memfs returned a value that is not a stat record')
}

const toPlatformError = (method: string) => (err: unknown): Error.PlatformError =>
  Error.systemError({
    _tag: REASON_BY_ERRNO[stringField(err, 'code')] ?? 'Unknown',
    module: 'FileSystem',
    method,
    pathOrDescriptor: stringField(err, 'path'),
    syscall: stringField(err, 'syscall'),
  })

const fileTypeWhenNotFifo = (stat: Stat): FileSystem.File.Type => {
  if (stat.isSocket()) return 'Socket'
  return 'Unknown'
}

const fileTypeWhenNotCharacterDevice = (stat: Stat): FileSystem.File.Type => {
  if (stat.isFIFO()) return 'FIFO'
  return fileTypeWhenNotFifo(stat)
}

const fileTypeWhenNotBlockDevice = (stat: Stat): FileSystem.File.Type => {
  if (stat.isCharacterDevice()) return 'CharacterDevice'
  return fileTypeWhenNotCharacterDevice(stat)
}

const fileTypeWhenNotSymbolicLink = (stat: Stat): FileSystem.File.Type => {
  if (stat.isBlockDevice()) return 'BlockDevice'
  return fileTypeWhenNotBlockDevice(stat)
}

const fileTypeWhenNotDirectory = (stat: Stat): FileSystem.File.Type => {
  if (stat.isSymbolicLink()) return 'SymbolicLink'
  return fileTypeWhenNotSymbolicLink(stat)
}

const fileTypeWhenNotFile = (stat: Stat): FileSystem.File.Type => {
  if (stat.isDirectory()) return 'Directory'
  return fileTypeWhenNotDirectory(stat)
}

const fileType = (stat: Stat): FileSystem.File.Type => {
  if (stat.isFile()) return 'File'
  return fileTypeWhenNotFile(stat)
}

const numberUnlessNaN = (value: number): number | null => {
  if (Number.isNaN(value)) return null
  return Number(value)
}

const numberOrNull = (value: number): number | null => {
  if (value === 0) return null
  return numberUnlessNaN(value)
}

const sizeOrNull = (value: number): ByteSize.ByteSize | null => {
  const n = numberOrNull(value)
  if (n === null) return null
  return ByteSize.bytes(n)
}

const makeFileInfo = (stat: Stat): FileSystem.File.Info => ({
  type: fileType(stat),
  mtime: Option.fromNullishOr(stat.mtime),
  atime: Option.fromNullishOr(stat.atime),
  birthtime: Option.fromNullishOr(stat.birthtime),
  dev: Number(stat.dev),
  rdev: Option.fromNullishOr(numberOrNull(stat.rdev)),
  ino: Option.fromNullishOr(numberOrNull(stat.ino)),
  mode: stat.mode,
  nlink: Option.fromNullishOr(numberOrNull(stat.nlink)),
  uid: Option.fromNullishOr(numberOrNull(stat.uid)),
  gid: Option.fromNullishOr(numberOrNull(stat.gid)),
  size: ByteSize.bytes(Number(stat.size)),
  blksize: Option.fromNullishOr(sizeOrNull(stat.blksize)),
  blocks: Option.fromNullishOr(numberOrNull(stat.blocks)),
})

const applySeek = (
  cursor: Cursor,
  off: bigint,
  from: FileSystem.SeekMode,
): bigint => {
  if (from === 'start') {
    cursor.position = off
    return cursor.position
  }
  cursor.position = cursor.position + off
  return cursor.position
}

const seekCursor = (
  cursor: Cursor,
  offset: bigint,
  from: FileSystem.SeekMode,
): Effect.Effect<bigint> => Effect.sync(() => applySeek(cursor, offset, from))

const optionFromNonemptyRead = (
  bytesRead: number,
  sizeNumber: number,
  buf: Buffer,
): Option.Option<Buffer> => {
  if (bytesRead === sizeNumber) return Option.some(buf)
  const dst = Buffer.allocUnsafeSlow(bytesRead)
  buf.copy(dst, 0, 0, bytesRead)
  return Option.some(dst)
}

const optionFromRead = (
  bytesRead: number,
  sizeNumber: number,
  buf: Buffer,
): Option.Option<Buffer> => {
  if (bytesRead === 0) return Option.none<Buffer>()
  return optionFromNonemptyRead(bytesRead, sizeNumber, buf)
}

const writeZeroError = (fd: number): Error.PlatformError =>
  Error.systemError({
    _tag: 'WriteZero',
    module: 'FileSystem',
    method: 'writeAll',
    pathOrDescriptor: fd,
  })

function writeAllChunk(
  handle: FileHandle,
  cursor: Cursor,
  buf: Uint8Array,
): Effect.Effect<void, Error.PlatformError> {
  return Effect.tryPromise({
    try: () => handle.write(buf, Number(cursor.position), buf.length),
    catch: toPlatformError('writeAll'),
  }).pipe(Effect.flatMap(({ bytesWritten }) => afterWriteAllBytes(handle, cursor, buf, bytesWritten)))
}

function continueWriteAll(
  handle: FileHandle,
  cursor: Cursor,
  buf: Uint8Array,
  bytesWritten: number,
): Effect.Effect<void, Error.PlatformError> {
  if (bytesWritten < buf.length) return writeAllChunk(handle, cursor, buf.subarray(bytesWritten))
  return Effect.void
}

function afterWriteAllBytes(
  handle: FileHandle,
  cursor: Cursor,
  buf: Uint8Array,
  bytesWritten: number,
): Effect.Effect<void, Error.PlatformError> {
  if (bytesWritten === 0) return Effect.fail(writeZeroError(handle.fd))
  cursor.position = cursor.position + BigInt(bytesWritten)
  return continueWriteAll(handle, cursor, buf, bytesWritten)
}

const clampCursor = (cursor: Cursor, len: number): void => {
  if (cursor.position > BigInt(len)) {
    cursor.position = BigInt(len)
  }
}

const lengthOrZero = (length?: number): number => length ?? 0

const makeFile = (handle: FileHandle): FileSystem.File => {
  const cursor: Cursor = { position: 0n }
  return {
    [FileSystem.FileTypeId]: FileSystem.FileTypeId,
    stat: Effect.tryPromise({
      try: () => handle.stat(),
      catch: toPlatformError('stat'),
    }).pipe(Effect.map(makeFileInfo)),
    sync: Effect.tryPromise({
      try: () => handle.sync(),
      catch: toPlatformError('sync'),
    }),
    seek(offset: bigint, from: FileSystem.SeekMode) {
      return seekCursor(cursor, offset, from)
    },
    read(buffer: Uint8Array) {
      return Effect.tryPromise({
        try: () => handle.read(buffer, 0, buffer.length, Number(cursor.position)),
        catch: toPlatformError('read'),
      }).pipe(
        Effect.map(({ bytesRead }) => {
          cursor.position = cursor.position + BigInt(bytesRead)
          return bytesRead
        }),
      )
    },
    readAlloc(size: number) {
      return Effect.suspend(() => {
        const buf = Buffer.allocUnsafeSlow(size)
        return Effect.tryPromise({
          try: () => handle.read(buf, 0, size, Number(cursor.position)),
          catch: toPlatformError('readAlloc'),
        }).pipe(
          Effect.map(({ bytesRead }) => {
            cursor.position = cursor.position + BigInt(bytesRead)
            return optionFromRead(bytesRead, size, buf)
          }),
        )
      })
    },
    truncate(length?: number) {
      const len = length ?? 0
      return Effect.tryPromise({
        try: () => handle.truncate(len),
        catch: toPlatformError('truncate'),
      }).pipe(Effect.map(() => clampCursor(cursor, len)))
    },
    write(buffer: Uint8Array) {
      return Effect.tryPromise({
        try: () => handle.write(buffer, Number(cursor.position), buffer.length),
        catch: toPlatformError('write'),
      }).pipe(
        Effect.map(({ bytesWritten }) => {
          cursor.position = cursor.position + BigInt(bytesWritten)
          return bytesWritten
        }),
      )
    },
    writeAll(buffer: Uint8Array) {
      return writeAllChunk(handle, cursor, buffer)
    },
  }
}

const cwdFromOpts = (opts?: { cwd: string }): string => {
  if (opts === undefined) return '/'
  return opts.cwd
}

const volumeFromContents = (contents: Contents | undefined, cwd: string): memfs.Volume => {
  if (contents === undefined) return memfs.Volume.fromJSON({})
  return memfs.Volume.fromJSON(contents, cwd)
}

const withReadable = (mode: number, constants: AccessConstants, options: AccessOptions): number => {
  if (options.readable === true) return mode | constants.R_OK
  return mode
}

const withWritable = (mode: number, constants: AccessConstants, options: AccessOptions): number => {
  if (options.writable === true) return mode | constants.W_OK
  return mode
}

const accessModeFromOptions = (constants: AccessConstants, options: AccessOptions): number =>
  withWritable(withReadable(constants.F_OK, constants, options), constants, options)

const accessMode = (constants: AccessConstants, options?: AccessOptions): number => {
  if (options === undefined) return constants.F_OK
  return accessModeFromOptions(constants, options)
}

const copyForce = (options?: CopyOptions): boolean => options?.overwrite === true

const copyPreserveTimestamps = (options?: CopyOptions): boolean => options?.preserveTimestamps === true

const recursiveOption = (options?: { readonly recursive?: boolean | undefined }): boolean => options?.recursive === true

const forceOption = (options?: { readonly force?: boolean | undefined }): boolean => options?.force === true

const modeOrDefault = (mode: number | undefined): number => {
  if (mode === undefined) return 0o755
  return mode
}

const directoryMode = (options?: MakeDirectoryOptions): number => {
  if (options === undefined) return 0o755
  return modeOrDefault(options.mode)
}

const stringOrEmpty = (value: string | undefined): string => {
  if (value === undefined) return ''
  return value
}

const prefixFromOptions = (options?: TempOptions): string => {
  if (options === undefined) return ''
  return stringOrEmpty(options.prefix)
}

const stringOrTmp = (value: string | undefined): string => {
  if (value === undefined) return '/tmp'
  return value
}

const directoryFromOptions = (options?: TempOptions): string => {
  if (options === undefined) return '/tmp'
  return stringOrTmp(options.directory)
}

const tempDirParentFromOptions = (options?: TempOptions): string => directoryFromOptions(options) + '/.'

const mkdtempPath = (tmpDirParent: string, prefix: string): string => {
  if (prefix === '') return tmpDirParent
  return tmpDirParent + prefix
}

const flagOrRead = (flag: FileSystem.OpenFlag | undefined): FileSystem.OpenFlag => {
  if (flag === undefined) return 'r'
  return flag
}

const openFlag = (options?: OpenOptions): FileSystem.OpenFlag => {
  if (options === undefined) return 'r'
  return flagOrRead(options.flag)
}

const toUint8Array = (contents: Uint8Array | string): Uint8Array => {
  if (contents instanceof Uint8Array) return contents
  return new TextEncoder().encode(contents)
}

const modeField = (mode: number | undefined): { mode?: number } => {
  if (mode === undefined) return {}
  return { mode }
}

const flagField = (flag: FileSystem.OpenFlag | undefined): { flag?: FileSystem.OpenFlag } => {
  if (flag === undefined) return {}
  return { flag }
}

const writeFileMode = (options?: WriteFileOptions): { mode?: number } => {
  if (options === undefined) return {}
  return modeField(options.mode)
}

const writeFileFlag = (options?: WriteFileOptions): { flag?: FileSystem.OpenFlag } => {
  if (options === undefined) return {}
  return flagField(options.flag)
}

const globCwd = (root: string | undefined): { cwd?: string } => {
  if (root === undefined) return {}
  return { cwd: root }
}

const globExcludeList = (exclude: ReadonlyArray<string> | undefined): { exclude?: Array<string> } => {
  if (exclude === undefined) return {}
  return { exclude: [...exclude] }
}

const globCwdFromOptions = (options?: GlobOptions): { cwd?: string } => {
  if (options === undefined) return {}
  return globCwd(options.root)
}

const globExcludeFromOptions = (options?: GlobOptions): { exclude?: Array<string> } => {
  if (options === undefined) return {}
  return globExcludeList(options.exclude)
}

export function make(contents?: Contents, opts?: { cwd: string }): FileSystem.FileSystem {
  const nfs = memfs.createFsFromVolume(volumeFromContents(contents, cwdFromOpts(opts)))

  const access: FileSystem.FileSystem['access'] = (path, options) =>
    Effect.tryPromise({
      try: () => nfs.promises.access(path, accessMode(nfs.constants, options)),
      catch: toPlatformError('access'),
    })

  const copy: FileSystem.FileSystem['copy'] = (fromPath, toPath, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.cp(fromPath, toPath, {
          force: copyForce(options),
          preserveTimestamps: copyPreserveTimestamps(options),
          recursive: true,
        }),
      catch: toPlatformError('copy'),
    })

  const copyFile: FileSystem.FileSystem['copyFile'] = (fromPath, toPath) =>
    Effect.tryPromise({
      try: () => nfs.promises.copyFile(fromPath, toPath),
      catch: toPlatformError('copyFile'),
    })

  const chmod: FileSystem.FileSystem['chmod'] = (path, mode) =>
    Effect.tryPromise({
      try: () => nfs.promises.chmod(path, mode),
      catch: toPlatformError('chmod'),
    })

  const chown: FileSystem.FileSystem['chown'] = (path, uid, gid) =>
    Effect.tryPromise({
      try: () => nfs.promises.chown(path, uid, gid),
      catch: toPlatformError('chown'),
    })

  const link: FileSystem.FileSystem['link'] = (existingPath, newPath) =>
    Effect.tryPromise({
      try: () => nfs.promises.link(existingPath, newPath),
      catch: toPlatformError('link'),
    })

  const makeDirectory: FileSystem.FileSystem['makeDirectory'] = (path, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.mkdir(path, {
          recursive: recursiveOption(options),
          mode: directoryMode(options),
        }),
      catch: toPlatformError('makeDirectory'),
    })

  const makeTempDirectory: FileSystem.FileSystem['makeTempDirectory'] = (options) =>
    Effect.suspend(() => {
      const prefix = prefixFromOptions(options)
      const tmpDirParent = tempDirParentFromOptions(options)
      return Effect.tryPromise({
        try: () =>
          nfs.promises
            .mkdir(tmpDirParent, { recursive: true })
            .then(() => nfs.promises.mkdtemp(mkdtempPath(tmpDirParent, prefix)))
            .then((dir) => String(dir)),
        catch: toPlatformError('makeTempDirectory'),
      })
    })

  const removeFactory = (method: string): FileSystem.FileSystem['remove'] => (path, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.rm(path, {
          recursive: recursiveOption(options),
          force: forceOption(options),
        }),
      catch: toPlatformError(method),
    })

  const remove = removeFactory('remove')
  const makeTempDirectoryScoped: FileSystem.FileSystem['makeTempDirectoryScoped'] = (options) =>
    Effect.acquireRelease(
      makeTempDirectory(options),
      (directory) => Effect.orDie(removeFactory('makeTempDirectoryScoped')(directory, { recursive: true })),
    )

  const openHandler: FileSystem.FileSystem['open'] = (path, options) =>
    Effect.acquireRelease(
      Effect.tryPromise({
        try: () => nfs.promises.open(path, openFlag(options)),
        catch: toPlatformError('open'),
      }),
      (memfsHandle) =>
        Effect.tryPromise({
          try: () => memfsHandle.close(),
          catch: toPlatformError('close'),
        }).pipe(Effect.orDie),
    ).pipe(Effect.map((memfsHandle) => makeFile(toFileHandle(memfsHandle))))

  const readFileFn: FileSystem.FileSystem['readFile'] = (path) =>
    Effect.tryPromise({
      try: () => nfs.promises.readFile(path).then(toUint8Array),
      catch: toPlatformError('readFile'),
    })

  const readLink: FileSystem.FileSystem['readLink'] = (path) =>
    Effect.tryPromise({
      try: () => nfs.promises.readlink(path).then((l) => String(l)),
      catch: toPlatformError('readLink'),
    })

  const readDirectory: FileSystem.FileSystem['readDirectory'] = (path, _options) =>
    Effect.tryPromise({
      try: () => nfs.promises.readdir(path).then((entries) => entries.map(String)),
      catch: toPlatformError('readDirectory'),
    })

  const realPath: FileSystem.FileSystem['realPath'] = (path) =>
    Effect.tryPromise({
      try: () => nfs.promises.realpath(path).then((p) => String(p)),
      catch: toPlatformError('realPath'),
    })

  const rename: FileSystem.FileSystem['rename'] = (oldPath, newPath) =>
    Effect.tryPromise({
      try: () => nfs.promises.rename(oldPath, newPath),
      catch: toPlatformError('rename'),
    })

  const pathStat: FileSystem.FileSystem['stat'] = (path) =>
    Effect.tryPromise({
      try: () => nfs.promises.stat(path).then(toStat),
      catch: toPlatformError('stat'),
    }).pipe(Effect.map(makeFileInfo))

  const symlink: FileSystem.FileSystem['symlink'] = (target, path) =>
    Effect.tryPromise({
      try: () => nfs.promises.symlink(target, path),
      catch: toPlatformError('symlink'),
    })

  const truncate: FileSystem.FileSystem['truncate'] = (path, length) =>
    Effect.tryPromise({
      try: () => nfs.promises.truncate(path, lengthOrZero(length)),
      catch: toPlatformError('truncate'),
    })

  const writeFile: FileSystem.FileSystem['writeFile'] = (path, data, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.writeFile(path, data, {
          ...writeFileMode(options),
          ...writeFileFlag(options),
        }),
      catch: toPlatformError('writeFile'),
    })

  const makeTempFile: FileSystem.FileSystem['makeTempFile'] = (options) =>
    Effect.gen(function*() {
      const entropy = yield* Random.next
      const prefix = prefixFromOptions(options)
      const dir = tempDirParentFromOptions(options)
      const name = prefix + entropy.toString(36).slice(2, 10)
      const filePath = dir + name
      return yield* Effect.tryPromise({
        try: () => nfs.promises.writeFile(filePath, '').then(() => filePath),
        catch: toPlatformError('makeTempFile'),
      })
    })

  const makeTempFileScoped: FileSystem.FileSystem['makeTempFileScoped'] = (options) =>
    Effect.acquireRelease(
      makeTempFile(options),
      (filePath) => Effect.orDie(removeFactory('makeTempFileScoped')(filePath, {})),
    )

  const utimes: FileSystem.FileSystem['utimes'] = (path, atime, mtime) =>
    Effect.tryPromise({
      try: () => nfs.promises.utimes(path, atime, mtime),
      catch: toPlatformError('utimes'),
    })

  const watch: FileSystem.FileSystem['watch'] = (_path, _options) => Stream.empty

  const glob: FileSystem.FileSystem['glob'] = (pattern, options) =>
    Effect.gen(function*() {
      const matches = yield* Effect.tryPromise({
        try: () =>
          Array.fromAsync(
            nfs.promises.glob(pattern, {
              ...globCwdFromOptions(options),
              ...globExcludeFromOptions(options),
            }),
          ),
        catch: toPlatformError('glob'),
      })
      return matches.map(toGlobPath)
    })

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
    open: openHandler,
    readFile: readFileFn,
    readDirectory,
    readLink,
    realPath,
    remove,
    rename,
    stat: pathStat,
    symlink,
    truncate,
    utimes,
    watch,
    writeFile,
  })
}
