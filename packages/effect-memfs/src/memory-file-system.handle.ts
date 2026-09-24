/// <reference types="vitest/importMeta" />
import { Handle } from '@systemfsoftware/effect-cell-types'
import { Context, Effect, Match, Queue, Random, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Error from 'effect/PlatformError'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as memfs from 'memfs'
import {
  decodeWatchEvent,
  DriverWatchEvent,
  type DriverWatchEventType,
  type WatchEventDecision,
} from './decode-watch-event.workflow.js'
import {
  byteBodiesOf,
  bytesOf,
  driverOf,
  entryPathOf,
  failureOf,
  infoOf,
  shapeFailure,
  statOf,
  stringOrEmpty,
  volumeJSONOf,
} from './driver-values.js'
import { ShapeRefusal } from './MemoryFileSystemError.schema.js'
import { type MemoryFileSystemSpec } from './MemoryFileSystemSpec.schema.js'
import { file as fileOf, info as described, OpenFile } from './open-file.handle.js'

/** What the handle carries: where the volume is rooted. */
export interface MemoryFileSystemData {
  readonly cwd: string
}

export type MemoryFileSystemHandle = Handle.Handle<'MemoryFileSystem', MemoryFileSystemData>

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

const ACCESS_CONSTANTS: AccessConstants = memfs.fs.constants

const withReadable = (mode: number, options: AccessOptions): number => {
  if (options.readable === true) {
    return mode | ACCESS_CONSTANTS.R_OK
  }
  return mode
}

const withWritable = (mode: number, options: AccessOptions): number => {
  if (options.writable === true) {
    return mode | ACCESS_CONSTANTS.W_OK
  }
  return mode
}

const accessModeFromOptions = (options: AccessOptions): number =>
  withWritable(withReadable(ACCESS_CONSTANTS.F_OK, options), options)

const accessModeOf = (options?: AccessOptions): number => {
  if (options === undefined) {
    return ACCESS_CONSTANTS.F_OK
  }
  return accessModeFromOptions(options)
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
  args: { readonly cwd: string },
  exclude: ReadonlyArray<string> | undefined,
): { readonly cwd: string; readonly exclude?: Array<string> } => {
  if (exclude === undefined) {
    return args
  }
  return { ...args, exclude: [...exclude] }
}

const globRootOf = (cwd: string, root: string | undefined): string => root ?? cwd

const globArgsOf = (
  cwd: string,
  options?: GlobOptions,
): { readonly cwd: string; readonly exclude?: Array<string> } => {
  if (options === undefined) {
    return { cwd }
  }
  return withGlobExclude({ cwd: globRootOf(cwd, options.root) }, options.exclude)
}

const truncateLengthOf = (length?: number): number => length ?? 0

// ---------------------------------------------------------------------------
// Temporary entries: one parent, one prefix, one entropy suffix
// ---------------------------------------------------------------------------

const directoryOrDefault = (directory?: string): string => directory ?? '/tmp'

const tempDirectory = (options?: TempOptions): string => directoryOrDefault(options?.directory)

const tempPrefix = (options?: TempOptions): string => stringOrEmpty(options?.prefix)

const tempSuffix = (options?: TempOptions): string => stringOrEmpty(options?.suffix)

const tempParentOf = (options?: TempOptions): string => `${tempDirectory(options)}/.`

const tempDirectoryOf = (options?: TempOptions): string => tempParentOf(options) + tempPrefix(options)

const tempFileOf = (entropy: string, options?: TempOptions): string =>
  tempParentOf(options) + tempPrefix(options) + entropy + tempSuffix(options)

const eventTypeOf = (eventType: string): DriverWatchEventType => (eventType === 'rename' ? 'rename' : 'change')

const eventOf = (decision: WatchEventDecision): FileSystem.WatchEvent =>
  Match.value(decision).pipe(
    Match.tag('WatchCreate', (created): FileSystem.WatchEvent => ({ _tag: 'Create', path: created.path })),
    Match.tag('WatchUpdate', (updated): FileSystem.WatchEvent => ({ _tag: 'Update', path: updated.path })),
    Match.tag('WatchRemove', (removed): FileSystem.WatchEvent => ({ _tag: 'Remove', path: removed.path })),
    Match.exhaustive,
  )

const parentOf = (path: string): string => {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}

const entryUnder = (directory: string, entry: string): string =>
  directory.endsWith('/') ? `${directory}${entry}` : `${directory}/${entry}`

const decidedFrom = (entry: string, exists: boolean): FileSystem.WatchEvent =>
  decodeWatchEvent(new DriverWatchEvent({ eventType: 'rename', filename: entry, exists })).pipe(
    Result.getOrThrow,
    eventOf,
  )

const changedFrom = (entry: string): FileSystem.WatchEvent =>
  decodeWatchEvent(new DriverWatchEvent({ eventType: 'change', filename: entry, exists: true })).pipe(
    Result.getOrThrow,
    eventOf,
  )

type DriverEvent = { readonly eventType: string; readonly entry: string }

const infoFrom =
  <S = unknown>(method: string) => (value: S): Effect.Effect<FileSystem.File.Info, Error.PlatformError> =>
    Effect.fromResult(statOf(value)).pipe(Effect.mapError(shapeFailure(method)), Effect.map(infoOf))

/** The memfs volume the definition's `create` mounts from the spec. A volume holds nothing to release. */
const mounted = (spec: MemoryFileSystemSpec): memfs.IFs => {
  const driver = memfs.createFsFromVolume(memfs.Volume.fromJSON(volumeJSONOf(spec.contents), spec.cwd))
  byteBodiesOf(spec.cwd, spec.contents).forEach(([path, bytes]) => driver.writeFileSync(path, bytes))
  return driver
}

/**
 * Declares the in-memory filesystem. The volume's identity is the spec's contents, so `create`
 * mounts it from the spec and the definition declares no release: a volume holds nothing to
 * let go of. The port is assembled from the definition's own operations, and `open` is a child
 * entry, so every file the port opens is released exactly once when its scope ends.
 */
export const MemoryFileSystem = Handle.make({
  name: 'MemoryFileSystem',
  create: (spec: MemoryFileSystemSpec) => Effect.sync(() => ({ driver: mounted(spec), data: { cwd: spec.cwd } })),
  operations: {
    access: (driver, _self, path: string, options?: AccessOptions) =>
      Effect.tryPromise({
        try: () => driver.promises.access(path, accessModeOf(options)),
        catch: failureOf('access'),
      }),
    chmod: (driver, _self, path: string, mode: number) =>
      Effect.tryPromise({ try: () => driver.promises.chmod(path, mode), catch: failureOf('chmod') }),
    chown: (driver, _self, path: string, uid: number, gid: number) =>
      Effect.tryPromise({ try: () => driver.promises.chown(path, uid, gid), catch: failureOf('chown') }),
    copy: (driver, _self, fromPath: string, toPath: string, options?: CopyOptions) =>
      Effect.tryPromise({
        try: () => driver.promises.cp(fromPath, toPath, copyArgsOf(options)),
        catch: failureOf('copy'),
      }),
    copyFile: (driver, _self, fromPath: string, toPath: string) =>
      Effect.tryPromise({ try: () => driver.promises.copyFile(fromPath, toPath), catch: failureOf('copyFile') }),
    glob: (driver, self, pattern: string, options?: GlobOptions) =>
      Effect.tryPromise({
        try: () => Array.fromAsync(driver.promises.glob(pattern, globArgsOf(self.cwd, options))),
        catch: failureOf('glob'),
      }).pipe(Effect.map((matches) => matches.map(entryPathOf))),
    link: (driver, _self, existingPath: string, newPath: string) =>
      Effect.tryPromise({ try: () => driver.promises.link(existingPath, newPath), catch: failureOf('link') }),
    makeDirectory: (driver, _self, path: string, options?: MakeDirectoryOptions) =>
      Effect.tryPromise({
        try: () => driver.promises.mkdir(path, makeDirectoryArgsOf(options)),
        catch: failureOf('makeDirectory'),
      }),
    makeTempDirectory: (driver, _self, options?: TempOptions) =>
      Effect.tryPromise({
        try: () => driver.promises.mkdir(tempParentOf(options), { recursive: true }),
        catch: failureOf('makeTempDirectory'),
      }).pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: () => driver.promises.mkdtemp(tempDirectoryOf(options)),
            catch: failureOf('makeTempDirectory'),
          })
        ),
        Effect.map(entryPathOf),
      ),
    makeTempFile: (driver, _self, options?: TempOptions) =>
      Effect.flatMap(Random.next, (entropy) => {
        const filePath = tempFileOf(entropy.toString(36).slice(2, 10), options)
        return Effect.tryPromise({
          try: () => driver.promises.mkdir(tempParentOf(options), { recursive: true }),
          catch: failureOf('makeTempFile'),
        }).pipe(
          Effect.flatMap(() =>
            Effect.tryPromise({
              try: () => driver.promises.writeFile(filePath, '').then(() => filePath),
              catch: failureOf('makeTempFile'),
            })
          ),
        )
      }),
    readFile: (driver, _self, path: string) =>
      Effect.tryPromise({ try: () => driver.promises.readFile(path), catch: failureOf('readFile') }).pipe(
        Effect.map(bytesOf),
      ),
    readLink: (driver, _self, path: string) =>
      Effect.tryPromise({ try: () => driver.promises.readlink(path), catch: failureOf('readLink') }).pipe(
        Effect.map(entryPathOf),
      ),
    readDirectory: (driver, _self, path: string, options?: { readonly recursive?: boolean | undefined }) =>
      Effect.tryPromise({
        try: () =>
          driver.promises.readdir(path, { recursive: isRecursive(options) }).then((entries) =>
            entries.map(entryPathOf)
          ),
        catch: failureOf('readDirectory'),
      }),
    realPath: (driver, _self, path: string) =>
      Effect.tryPromise({ try: () => driver.promises.realpath(path), catch: failureOf('realPath') }).pipe(
        Effect.map(entryPathOf),
      ),
    remove: (driver, _self, path: string, options?: RemoveOptions) =>
      Effect.tryPromise({ try: () => driver.promises.rm(path, removeArgsOf(options)), catch: failureOf('remove') }),
    rename: (driver, _self, oldPath: string, newPath: string) =>
      Effect.tryPromise({ try: () => driver.promises.rename(oldPath, newPath), catch: failureOf('rename') }),
    stat: (driver, _self, path: string) =>
      Effect.tryPromise({ try: () => driver.promises.stat(path), catch: failureOf('stat') }).pipe(
        Effect.flatMap(infoFrom('stat record')),
      ),
    symlink: (driver, _self, target: string, path: string) =>
      Effect.tryPromise({ try: () => driver.promises.symlink(target, path), catch: failureOf('symlink') }),
    truncate: (driver, _self, path: string, length?: number) =>
      Effect.tryPromise({
        try: () => driver.promises.truncate(path, truncateLengthOf(length)),
        catch: failureOf('truncate'),
      }),
    utimes: (driver, _self, path: string, atime: Date | number, mtime: Date | number) =>
      Effect.tryPromise({ try: () => driver.promises.utimes(path, atime, mtime), catch: failureOf('utimes') }),
    writeFile: (driver, _self, path: string, data: string | Uint8Array, options?: WriteFileOptions) =>
      Effect.tryPromise({
        try: () => driver.promises.writeFile(path, data, writeFileArgsOf(options)),
        catch: failureOf('writeFile'),
      }),
  },
  streams: {
    watch: (driver, _self, path: string, options?: FileSystem.WatchOptions) =>
      Stream.callback<FileSystem.WatchEvent, Error.PlatformError>((queue) =>
        Effect.gen(function*() {
          const directory = yield* Effect.sync(() => driver.statSync(path).isDirectory() ? path : parentOf(path))
          const changes = yield* Queue.unbounded<DriverEvent>()
          yield* Effect.forkScoped(
            Effect.forever(
              Effect.flatMap(Queue.take(changes), (event) =>
                eventTypeOf(event.eventType) === 'change'
                  ? Queue.offer(queue, changedFrom(event.entry))
                  : Effect.flatMap(
                    Effect.match(
                      Effect.tryPromise({
                        try: () => driver.promises.stat(entryUnder(directory, event.entry)),
                        catch: () => new ShapeRefusal({ method: 'watch' }),
                      }),
                      { onFailure: () => false, onSuccess: () => true },
                    ),
                    (exists) => Queue.offer(queue, decidedFrom(event.entry, exists)),
                  )),
            ),
          )
          return yield* Effect.acquireRelease(
            Effect.sync(() =>
              driver.watch(path, { persistent: false, recursive: isRecursive(options) }, (eventType, filename) => {
                Queue.offerUnsafe(changes, { entry: entryPathOf(filename), eventType })
              })
            ),
            (watcher) => Effect.sync(() => watcher.close()),
          )
        })
      ),
  },
  children: {
    open: {
      handle: OpenFile,
      create: (driver, _self, path: string, options?: OpenOptions) =>
        Effect.tryPromise({
          try: () => driver.promises.open(path, openFlagOf(options)),
          catch: failureOf('open'),
        }).pipe(
          Effect.flatMap((handle) =>
            Effect.fromResult(driverOf(handle)).pipe(Effect.mapError(shapeFailure('file handle')))
          ),
          Effect.flatMap((file) =>
            Effect.map(Ref.make(0n), (cursor) => ({ driver: { file, cursor }, data: { fd: file.fd } }))
          ),
        ),
    },
  },
  services: (self, members) => {
    const makeTempDirectory = (options?: TempOptions) => members.operations.makeTempDirectory(self, options)
    const makeTempFile = (options?: TempOptions) => members.operations.makeTempFile(self, options)
    return Context.make(
      FileSystem.FileSystem,
      FileSystem.make({
        access: (path, options) => members.operations.access(self, path, options),
        chown: (path, uid, gid) => members.operations.chown(self, path, uid, gid),
        chmod: (path, mode) => members.operations.chmod(self, path, mode),
        copy: (fromPath, toPath, options) => members.operations.copy(self, fromPath, toPath, options),
        copyFile: (fromPath, toPath) => members.operations.copyFile(self, fromPath, toPath),
        glob: (pattern, options) => members.operations.glob(self, pattern, options),
        link: (existingPath, newPath) => members.operations.link(self, existingPath, newPath),
        makeDirectory: (path, options) => members.operations.makeDirectory(self, path, options),
        makeTempDirectory,
        makeTempDirectoryScoped: (options) =>
          Effect.acquireRelease(
            makeTempDirectory(options),
            (directory) => Effect.orDie(members.operations.remove(self, directory, { recursive: true })),
          ),
        makeTempFile,
        makeTempFileScoped: (options) =>
          Effect.acquireRelease(
            makeTempFile(options),
            (filePath) => Effect.orDie(members.operations.remove(self, filePath, {})),
          ),
        open: (path, options) =>
          Effect.map(members.children.open(self, path, options), (file) => fileOf(file, described(file))),
        readFile: (path) => members.operations.readFile(self, path),
        readDirectory: (path, options) => members.operations.readDirectory(self, path, options),
        readLink: (path) => members.operations.readLink(self, path),
        realPath: (path) => members.operations.realPath(self, path),
        remove: (path, options) => members.operations.remove(self, path, options),
        rename: (oldPath, newPath) => members.operations.rename(self, oldPath, newPath),
        stat: (path) => members.operations.stat(self, path),
        symlink: (target, path) => members.operations.symlink(self, target, path),
        truncate: (path, length) => members.operations.truncate(self, path, length),
        utimes: (path, atime, mtime) => members.operations.utimes(self, path, atime, mtime),
        watch: (path, options) => members.streams.watch(self, path, options),
        writeFile: (path, data, options) => members.operations.writeFile(self, path, data, options),
      }),
    )
  },
})
