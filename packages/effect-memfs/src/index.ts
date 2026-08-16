import { Layer } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Error from 'effect/PlatformError'
import * as Random from 'effect/Random'
import * as Stream from 'effect/Stream'
import * as memfs from 'memfs'
import { layer } from './memory-file-system.adapter.js'
import type { Contents, FileHandle, Stat } from './memory-file-system.shape.js'

const REASON_BY_ERRNO: Record<string, Error.SystemErrorTag> = {
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
  Error.systemError({
    _tag: REASON_BY_ERRNO[stringField(err, 'code')] ?? 'Unknown',
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
  mtime: Option.fromNullishOr(stat.mtime),
  atime: Option.fromNullishOr(stat.atime),
  birthtime: Option.fromNullishOr(stat.birthtime),
  dev: Number(stat.dev),
  rdev: Option.fromNullishOr(stat.rdev ? Number(stat.rdev) : null),
  ino: Option.fromNullishOr(stat.ino ? Number(stat.ino) : null),
  mode: stat.mode,
  nlink: Option.fromNullishOr(stat.nlink ? Number(stat.nlink) : null),
  uid: Option.fromNullishOr(stat.uid ? Number(stat.uid) : null),
  gid: Option.fromNullishOr(stat.gid ? Number(stat.gid) : null),
  size: FileSystem.Size(Number(stat.size)),
  blksize: Option.fromNullishOr(stat.blksize ? FileSystem.Size(Number(stat.blksize)) : null),
  blocks: Option.fromNullishOr(stat.blocks ? Number(stat.blocks) : null),
})

const makeFile = (handle: FileHandle): FileSystem.File => {
  let position = 0n
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
    seek(offset: FileSystem.SizeInput, from: FileSystem.SeekMode) {
      const off = FileSystem.Size(offset)
      return Effect.sync(() => {
        if (from === 'start') position = off
        else if (from === 'current') position = position + off
        return FileSystem.Size(position)
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
                Error.systemError({
                  _tag: 'WriteZero',
                  module: 'FileSystem',
                  method: 'writeAll',
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

  const access: FileSystem.FileSystem['access'] = (path, options) => {
    let mode = nfs.constants.F_OK
    if (options?.readable) mode |= nfs.constants.R_OK
    if (options?.writable) mode |= nfs.constants.W_OK
    return Effect.tryPromise({
      try: () => nfs.promises.access(path, mode),
      catch: toPlatformError('access'),
    })
  }

  const copy: FileSystem.FileSystem['copy'] = (fromPath, toPath, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.cp(fromPath, toPath, {
          force: options?.overwrite ?? false,
          preserveTimestamps: options?.preserveTimestamps ?? false,
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
          recursive: options?.recursive ?? false,
          mode: options?.mode ?? 0o755,
        }),
      catch: toPlatformError('makeDirectory'),
    })

  const makeTempDirectory: FileSystem.FileSystem['makeTempDirectory'] = (options) =>
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

  const removeFactory = (method: string): FileSystem.FileSystem['remove'] => (path, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.rm(path, {
          recursive: options?.recursive ?? false,
          force: options?.force ?? false,
        }),
      catch: toPlatformError(method),
    })

  const remove = removeFactory('remove')
  const makeTempDirectoryScoped: FileSystem.FileSystem['makeTempDirectoryScoped'] = (options) =>
    Effect.acquireRelease(
      makeTempDirectory(options),
      (directory) => Effect.orDie(removeFactory('makeTempDirectoryScoped')(directory, { recursive: true })),
    )

  const openHandler: FileSystem.FileSystem['open'] = (path, options) => {
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

  const readFileFn: FileSystem.FileSystem['readFile'] = (path) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.readFile(path).then((contents) =>
          contents instanceof Uint8Array ? contents : new TextEncoder().encode(contents)
        ),
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
      try: () => nfs.promises.truncate(path, Number(length ?? 0)),
      catch: toPlatformError('truncate'),
    })

  const writeFile: FileSystem.FileSystem['writeFile'] = (path, data, options) =>
    Effect.tryPromise({
      try: () =>
        nfs.promises.writeFile(path, data, {
          ...(options?.mode === undefined ? {} : { mode: options.mode }),
          ...(options?.flag === undefined ? {} : { flag: options.flag }),
        }),
      catch: toPlatformError('writeFile'),
    })

  const makeTempFile: FileSystem.FileSystem['makeTempFile'] = (options) =>
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
    Effect.tryPromise({
      try: () =>
        nfs.promises.glob(pattern, {
          ...(options?.root === undefined ? {} : { cwd: options.root }),
          ...(options?.exclude === undefined ? {} : { exclude: [...options.exclude] }),
        }),
      catch: toPlatformError('glob'),
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
