import * as Error from '@effect/platform/Error'
import * as FileSystem from '@effect/platform/FileSystem'
import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Random from 'effect/Random'
import * as Stream from 'effect/Stream'
import * as memfs from 'memfs'
import { layer } from './memory-file-system.adapter.js'
import type { Contents, FileHandle, Stat } from './memory-file-system.shape.js'

const REASON_BY_ERRNO: Record<string, Error.SystemErrorReason> = {
  EACCES: 'PermissionDenied',
  EBUSY: 'Busy',
  EEXIST: 'AlreadyExists',
  EISDIR: 'BadResource',
  ELOOP: 'BadResource',
  ENOENT: 'NotFound',
  ENOTDIR: 'BadResource',
}

const stringField = (err: unknown, key: string): string => {
  if (typeof err !== 'object' || err === null || !(key in err)) return ''
  const value: unknown = Reflect.get(err, key)
  return typeof value === 'string' ? value : ''
}

const hasFunction = (value: unknown, key: string): boolean =>
  typeof value === 'object' && value !== null && key in value && typeof Reflect.get(value, key) === 'function'

const isFileHandle = (value: unknown): value is FileHandle =>
  hasFunction(value, 'close') && hasFunction(value, 'read') && hasFunction(value, 'write')

const isStat = (value: unknown): value is Stat => hasFunction(value, 'isFile') && hasFunction(value, 'isDirectory')

const toFileHandle = (handle: unknown): FileHandle => {
  if (isFileHandle(handle)) return handle
  throw new TypeError('memfs returned a value that is not a file handle')
}

const toStat = (stat: unknown): Stat => {
  if (isStat(stat)) return stat
  throw new TypeError('memfs returned a value that is not a stat record')
}

const toPlatformError = (method: string) => (err: unknown): Error.PlatformError =>
  new Error.SystemError({
    reason: REASON_BY_ERRNO[stringField(err, 'code')] ?? 'Unknown',
    module: 'FileSystem',
    method,
    pathOrDescriptor: stringField(err, 'path'),
    syscall: stringField(err, 'syscall'),
  })

const makeFileInfo = (stat: Stat): FileSystem.File.Info => ({
  type: stat.isFile()
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
    : 'Unknown',
  mtime: Option.fromNullable(stat.mtime),
  atime: Option.fromNullable(stat.atime),
  birthtime: Option.fromNullable(stat.birthtime),
  dev: Number(stat.dev),
  rdev: Option.fromNullable(stat.rdev ? Number(stat.rdev) : null),
  ino: Option.fromNullable(stat.ino ? Number(stat.ino) : null),
  mode: stat.mode,
  nlink: Option.fromNullable(stat.nlink ? Number(stat.nlink) : null),
  uid: Option.fromNullable(stat.uid ? Number(stat.uid) : null),
  gid: Option.fromNullable(stat.gid ? Number(stat.gid) : null),
  size: FileSystem.Size(Number(stat.size)),
  blksize: Option.fromNullable(stat.blksize ? FileSystem.Size(Number(stat.blksize)) : null),
  blocks: Option.fromNullable(stat.blocks ? Number(stat.blocks) : null),
})

const makeFile = (handle: FileHandle): FileSystem.File => {
  let position = 0n
  return {
    fd: FileSystem.FileDescriptor(handle.fd),
    [FileSystem.FileTypeId]: FileSystem.FileTypeId,
    stat: Effect.tryPromise({
      try: () => handle.stat(),
      catch: toPlatformError('stat'),
    }).pipe(Effect.map(makeFileInfo)),
    sync: Effect.tryPromise({
      try: () => handle.sync(),
      catch: toPlatformError('sync'),
    }),
    seek(offset: FileSystem.SizeInput, _from: FileSystem.SeekMode) {
      return Effect.sync(() => {
        const off = FileSystem.Size(offset)
        if (_from === 'start') position = off
        else if (_from === 'current') position = position + off
      })
    },
    read(buffer: Uint8Array) {
      return Effect.tryPromise({
        try: () => handle.read(buffer, 0, buffer.length, Number(position)),
        catch: toPlatformError('read'),
      }).pipe(
        Effect.map(({ bytesRead }) => {
          position = position + BigInt(bytesRead)
          return FileSystem.Size(bytesRead)
        }),
      )
    },
    readAlloc(size: FileSystem.SizeInput) {
      const sizeNumber = Number(size)
      return Effect.suspend(() => {
        const buf = Buffer.allocUnsafeSlow(sizeNumber)
        return Effect.tryPromise({
          try: () => handle.read(buf, 0, sizeNumber, Number(position)),
          catch: toPlatformError('readAlloc'),
        }).pipe(
          Effect.map(({ bytesRead }) => {
            position = position + BigInt(bytesRead)
            if (bytesRead === 0) return Option.none<Buffer>()
            if (bytesRead === sizeNumber) return Option.some(buf)
            const dst = Buffer.allocUnsafeSlow(bytesRead)
            buf.copy(dst, 0, 0, bytesRead)
            return Option.some(dst)
          }),
        )
      })
    },
    truncate(length?: FileSystem.SizeInput) {
      const len = Number(length ?? 0)
      return Effect.tryPromise({
        try: () => handle.truncate(len),
        catch: toPlatformError('truncate'),
      }).pipe(
        Effect.map(() => {
          if (position > BigInt(len)) position = BigInt(len)
        }),
      )
    },
    write(buffer: Uint8Array) {
      return Effect.tryPromise({
        try: () => handle.write(buffer, Number(position), buffer.length),
        catch: toPlatformError('write'),
      }).pipe(
        Effect.map(({ bytesWritten }) => {
          position = position + BigInt(bytesWritten)
          return FileSystem.Size(bytesWritten)
        }),
      )
    },
    writeAll(buffer: Uint8Array) {
      const writeAllChunk = (buf: Uint8Array): Effect.Effect<void, Error.PlatformError> =>
        Effect.tryPromise({
          try: () => handle.write(buf, Number(position), buf.length),
          catch: toPlatformError('writeAll'),
        }).pipe(
          Effect.flatMap(({ bytesWritten }) => {
            if (bytesWritten === 0) {
              return Effect.fail(
                new Error.SystemError({
                  module: 'FileSystem',
                  method: 'writeAll',
                  reason: 'WriteZero',
                  pathOrDescriptor: handle.fd,
                }),
              )
            }
            position = position + BigInt(bytesWritten)
            return bytesWritten < buf.length
              ? writeAllChunk(buf.subarray(bytesWritten))
              : Effect.void
          }),
        )

      return writeAllChunk(buffer)
    },
  }
}

export function make(contents?: Contents, opts?: { cwd: string }): FileSystem.FileSystem {
  const cwd = opts?.cwd ?? '/'
  const nfs = memfs.createFsFromVolume(
    contents
      ? memfs.Volume.fromJSON(contents, cwd)
      : memfs.Volume.fromJSON({}),
  )

  const access = (path: string, options?: FileSystem.AccessFileOptions): Effect.Effect<void, Error.PlatformError> => {
    let mode = nfs.constants.F_OK
    if (options?.readable) mode |= nfs.constants.R_OK
    if (options?.writable) mode |= nfs.constants.W_OK
    return Effect.tryPromise({
      try: () => nfs.promises.access(path, mode),
      catch: toPlatformError('access'),
    })
  }

  const copy = (
    fromPath: string,
    toPath: string,
    options?: FileSystem.CopyOptions,
  ): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.cp(fromPath, toPath, {
          force: options?.overwrite ?? false,
          preserveTimestamps: options?.preserveTimestamps ?? false,
          recursive: true,
        }),
      catch: toPlatformError('copy'),
    })

  const copyFile = (fromPath: string, toPath: string): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.copyFile(fromPath, toPath),
      catch: toPlatformError('copyFile'),
    })

  const chmod = (path: string, mode: number): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.chmod(path, mode),
      catch: toPlatformError('chmod'),
    })

  const chown = (path: string, uid: number, gid: number): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.chown(path, uid, gid),
      catch: toPlatformError('chown'),
    })

  const link = (existingPath: string, newPath: string): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.link(existingPath, newPath),
      catch: toPlatformError('link'),
    })

  const makeDirectory = (
    path: string,
    options?: FileSystem.MakeDirectoryOptions,
  ): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.mkdir(path, {
          recursive: options?.recursive ?? false,
          mode: options?.mode ?? 0o755,
        }),
      catch: toPlatformError('makeDirectory'),
    })

  const makeTempDirectory = (
    options?: FileSystem.MakeTempDirectoryOptions,
  ): Effect.Effect<string, Error.PlatformError> =>
    Effect.suspend(() => {
      const prefix = options?.prefix ?? ''
      const tmpDirParent = (options?.directory ?? '/tmp') + '/.'
      return Effect.tryPromise({
        try: () =>
          nfs.promises.mkdir(tmpDirParent, { recursive: true }).then(() =>
            nfs.promises.mkdtemp(prefix ? tmpDirParent + prefix : tmpDirParent)
          ).then((dir) => String(dir)),
        catch: toPlatformError('makeTempDirectory'),
      })
    })

  const removeFactory =
    (method: string) => (path: string, options?: FileSystem.RemoveOptions): Effect.Effect<void, Error.PlatformError> =>
      Effect.tryPromise({
        try: () =>
          nfs.promises.rm(path, {
            recursive: options?.recursive ?? false,
            force: options?.force ?? false,
          }),
        catch: toPlatformError(method),
      })

  const remove = removeFactory('remove')
  const makeTempDirectoryScoped = (options?: FileSystem.MakeTempDirectoryOptions) =>
    Effect.acquireRelease(
      makeTempDirectory(options),
      (directory) => Effect.orDie(removeFactory('makeTempDirectoryScoped')(directory, { recursive: true })),
    )

  const openHandler = (path: string, options?: FileSystem.OpenFileOptions) => {
    const flag = options?.flag ?? 'r'
    return Effect.acquireRelease(
      Effect.tryPromise({
        try: () => nfs.promises.open(path, flag),
        catch: toPlatformError('open'),
      }),
      (memfsHandle) =>
        Effect.tryPromise({
          try: () => memfsHandle.close(),
          catch: toPlatformError('close'),
        }).pipe(Effect.orDie),
    ).pipe(Effect.map((memfsHandle) => makeFile(toFileHandle(memfsHandle))))
  }

  const readFileFn = (path: string): Effect.Effect<Uint8Array, Error.PlatformError> =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.readFile(path).then((contents) =>
          contents instanceof Uint8Array ? contents : new TextEncoder().encode(contents)
        ),
      catch: toPlatformError('readFile'),
    })

  const readLink = (path: string): Effect.Effect<string, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.readlink(path).then((l) => String(l)),
      catch: toPlatformError('readLink'),
    })

  const readDirectory = (
    path: string,
    _options?: FileSystem.ReadDirectoryOptions,
  ): Effect.Effect<Array<string>, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.readdir(path).then((entries) => entries.map(String)),
      catch: toPlatformError('readDirectory'),
    })

  const realPath = (path: string): Effect.Effect<string, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.realpath(path).then((p) => String(p)),
      catch: toPlatformError('realPath'),
    })

  const rename = (oldPath: string, newPath: string): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.rename(oldPath, newPath),
      catch: toPlatformError('rename'),
    })

  const pathStat = (path: string): Effect.Effect<FileSystem.File.Info, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.stat(path).then(toStat),
      catch: toPlatformError('stat'),
    }).pipe(Effect.map(makeFileInfo))

  const symlink = (target: string, path: string): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.symlink(target, path),
      catch: toPlatformError('symlink'),
    })

  const truncate = (path: string, length?: FileSystem.SizeInput): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.truncate(path, Number(length ?? 0)),
      catch: toPlatformError('truncate'),
    })

  const writeFile = (
    path: string,
    data: Uint8Array,
    options?: FileSystem.WriteFileOptions,
  ): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.writeFile(path, data, {
          ...(options?.mode === undefined ? {} : { mode: options.mode }),
          ...(options?.flag === undefined ? {} : { flag: options.flag }),
        }),
      catch: toPlatformError('writeFile'),
    })

  const makeTempFile = (options?: FileSystem.MakeTempFileOptions): Effect.Effect<string, Error.PlatformError> =>
    Effect.gen(function*() {
      const entropy = yield* Random.next
      const prefix = options?.prefix ?? ''
      const dir = (options?.directory ?? '/tmp') + '/.'
      const name = prefix + entropy.toString(36).slice(2, 10)
      const filePath = dir + name
      return yield* Effect.tryPromise({
        try: () => nfs.promises.writeFile(filePath, '').then(() => filePath),
        catch: toPlatformError('makeTempFile'),
      })
    })

  const makeTempFileScoped = (options?: FileSystem.MakeTempFileOptions) =>
    Effect.acquireRelease(
      makeTempFile(options),
      (filePath) => Effect.orDie(removeFactory('makeTempFileScoped')(filePath, {})),
    )

  const utimes = (path: string, atime: Date | number, mtime: Date | number): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => nfs.promises.utimes(path, atime, mtime),
      catch: toPlatformError('utimes'),
    })

  const watch = (
    _path: string,
    _options?: FileSystem.WatchOptions,
  ): Stream.Stream<FileSystem.WatchEvent, Error.PlatformError> => Stream.empty

  return FileSystem.make({
    access,
    chmod,
    chown,
    copy,
    copyFile,
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

export const layerWith = (contents: Contents): Layer.Layer<FileSystem.FileSystem> =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.sync(() => make(contents)),
  )

// Not `export * as`: API Extractor cannot follow a namespace re-export and emits
// the members undeclared, degrading every one to `any` in the rollup and API report.
export const MemoryFileSystem: {
  readonly layer: Layer.Layer<FileSystem.FileSystem>
  readonly layerWith: (contents: Contents) => Layer.Layer<FileSystem.FileSystem>
  readonly make: (contents?: Contents, opts?: { cwd: string }) => FileSystem.FileSystem
} = { layer, layerWith, make }

export type { Contents } from './memory-file-system.shape.js'
