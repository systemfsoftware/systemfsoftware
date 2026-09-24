/// <reference types="vitest/importMeta" />
import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Option, Predicate, Ref } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Error from 'effect/PlatformError'
import * as Result from 'effect/Result'
import { CursorRefusal } from './MemoryFileSystemError.schema.js'
import { planReadSlice, ReadSlice, type ReadSliceDecision } from './plan-read-slice.workflow.js'
import { PlanTruncateCursor, planTruncateCursor, type TruncateCursorDecision } from './plan-truncate-cursor.workflow.js'
import {
  planWriteContinuation,
  WriteAllChunk,
  type WriteAllChunkDecision,
  type WriteZero,
} from './plan-write-continuation.workflow.js'

export const TypeId = Symbol.for('~systemfsoftware/memfs/OpenFile')
export type TypeId = typeof TypeId

export interface Stat {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  isBlockDevice(): boolean
  isCharacterDevice(): boolean
  isFIFO(): boolean
  isSocket(): boolean
  readonly mode: number
  readonly size: number
  readonly blocks: number
  readonly blksize: number
  readonly dev: number
  readonly ino: number
  readonly nlink: number
  readonly uid: number
  readonly gid: number
  readonly rdev: number
  readonly mtime: Date
  readonly atime: Date
  readonly birthtime: Date
}

export interface Driver {
  readonly fd: number
  stat(): Promise<Stat>
  sync(): Promise<void>
  read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number; buffer: Uint8Array }>
  write(
    buffer: Uint8Array,
    offset: number | undefined,
    length: number,
    position?: number | null,
  ): Promise<{ bytesWritten: number; buffer: Uint8Array }>
  truncate(len?: number): Promise<void>
  close(): Promise<void>
}

const OpenFileDef = Handle.make<
  { readonly fd: number },
  { readonly driver: Driver; readonly cursor: Ref.Ref<bigint> }
>()(TypeId)

export type OpenFile = Handle.Of<typeof OpenFileDef>

export const isOpenFile = OpenFileDef.is

export const make = (driver: Driver): Effect.Effect<OpenFile> =>
  Effect.map(Ref.make(0n), (cursor) => OpenFileDef.make({ fd: driver.fd }, { driver, cursor }))

const driverOf = (self: OpenFile): Driver => OpenFileDef.slot(self).driver

const cursorOf = (self: OpenFile): Ref.Ref<bigint> => OpenFileDef.slot(self).cursor

const failureOf = (method: string) => <E = unknown>(cause: E): Error.PlatformError =>
  Error.systemError({
    _tag: 'BadResource',
    module: 'FileSystem',
    method,
    description: `${method} failed`,
    pathOrDescriptor: '',
    syscall: method,
    cause,
  })

const nextPosition = (position: bigint, offset: bigint, from: FileSystem.SeekMode): bigint =>
  from === 'start' ? offset : position + offset

const planSeekPosition = (
  position: bigint,
  offset: bigint,
  from: FileSystem.SeekMode,
): Result.Result<bigint, CursorRefusal> => {
  const next = nextPosition(position, offset, from)
  if (next < 0n) {
    return Result.fail(new CursorRefusal({ method: 'seek', cause: next }))
  }
  return Result.succeed(next)
}

const seekRefusal = (cause: CursorRefusal): Error.PlatformError =>
  Error.badArgument({
    module: 'FileSystem',
    method: 'seek',
    description: 'seek failed: the resulting position is before the start of the file',
    cause,
  })

const writeZeroRefusal = (cause: WriteZero): Error.PlatformError =>
  Error.systemError({
    _tag: 'WriteZero',
    module: 'FileSystem',
    method: 'writeAll',
    description: 'writeAll failed: the driver reported zero bytes written',
    pathOrDescriptor: cause.fd,
    cause,
  })

const positioned = (self: OpenFile, position: bigint): Effect.Effect<bigint> =>
  Ref.set(cursorOf(self), position).pipe(Effect.as(position))

export const seek: {
  (offset: bigint, from: FileSystem.SeekMode): (self: OpenFile) => Effect.Effect<bigint, Error.PlatformError>
  (self: OpenFile, offset: bigint, from: FileSystem.SeekMode): Effect.Effect<bigint, Error.PlatformError>
} = dual(
  3,
  (self: OpenFile, offset: bigint, from: FileSystem.SeekMode): Effect.Effect<bigint, Error.PlatformError> =>
    Ref.get(cursorOf(self)).pipe(
      Effect.flatMap((position) => Effect.fromResult(planSeekPosition(position, offset, from))),
      Effect.mapError(seekRefusal),
      Effect.flatMap((position) => positioned(self, position)),
    ),
)

const advance = (self: OpenFile, delta: bigint): Effect.Effect<bigint, Error.PlatformError> =>
  seek(self, delta, 'current')

export const stat = (self: OpenFile): Effect.Effect<Stat, Error.PlatformError> =>
  Effect.tryPromise({ try: () => driverOf(self).stat(), catch: failureOf('stat') })

export const sync = (self: OpenFile): Effect.Effect<void, Error.PlatformError> =>
  Effect.tryPromise({ try: () => driverOf(self).sync(), catch: failureOf('sync') })

export const read: {
  (buffer: Uint8Array): (self: OpenFile) => Effect.Effect<number, Error.PlatformError>
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError>
} = dual(
  2,
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError> =>
    Ref.get(cursorOf(self)).pipe(
      Effect.flatMap((position) =>
        Effect.tryPromise({
          try: () => driverOf(self).read(buffer, 0, buffer.length, Number(position)),
          catch: failureOf('read'),
        })
      ),
      Effect.flatMap(({ bytesRead }) => advance(self, BigInt(bytesRead)).pipe(Effect.as(bytesRead))),
    ),
)

const sliceOf = (buf: Uint8Array) => (decision: ReadSliceDecision): Option.Option<Uint8Array> =>
  Match.value(decision).pipe(
    Match.tag('ReadExhausted', () => Option.none<Uint8Array>()),
    Match.tag('ReadWhole', () => Option.some<Uint8Array>(buf)),
    Match.tag('ReadPartial', (partial) => Option.some<Uint8Array>(buf.subarray(0, partial.bytesRead))),
    Match.exhaustive,
  )

export const readAlloc: {
  (size: number): (self: OpenFile) => Effect.Effect<Option.Option<Uint8Array>, Error.PlatformError>
  (self: OpenFile, size: number): Effect.Effect<Option.Option<Uint8Array>, Error.PlatformError>
} = dual(
  2,
  (self: OpenFile, size: number): Effect.Effect<Option.Option<Uint8Array>, Error.PlatformError> =>
    Effect.suspend(() => {
      const buf = new Uint8Array(size)
      return Ref.get(cursorOf(self)).pipe(
        Effect.flatMap((position) =>
          Effect.tryPromise({
            try: () => driverOf(self).read(buf, 0, size, Number(position)),
            catch: failureOf('readAlloc'),
          })
        ),
        Effect.flatMap(({ bytesRead }) =>
          advance(self, BigInt(bytesRead)).pipe(
            Effect.flatMap(() => Effect.fromResult(planReadSlice(new ReadSlice({ bytesRead, requested: size })))),
            Effect.map(sliceOf(buf)),
          )
        ),
      )
    }),
)

export const write: {
  (buffer: Uint8Array): (self: OpenFile) => Effect.Effect<number, Error.PlatformError>
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError>
} = dual(
  2,
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError> =>
    Ref.get(cursorOf(self)).pipe(
      Effect.flatMap((position) =>
        Effect.tryPromise({
          try: () => driverOf(self).write(buffer, 0, buffer.length, Number(position)),
          catch: failureOf('write'),
        })
      ),
      Effect.flatMap(({ bytesWritten }) => advance(self, BigInt(bytesWritten)).pipe(Effect.as(bytesWritten))),
    ),
)

const writtenOf = (decision: WriteAllChunkDecision, remaining: number): number =>
  Match.value(decision).pipe(
    Match.tag('WriteContinued', (continued) => continued.skip),
    Match.tag('WriteDrained', () => remaining),
    Match.exhaustive,
  )

const pendingAfter = (decision: WriteAllChunkDecision, pending: Uint8Array): Uint8Array =>
  pending.subarray(writtenOf(decision, pending.length))

const writeChunk = (self: OpenFile, pending: Uint8Array): Effect.Effect<WriteAllChunkDecision, Error.PlatformError> =>
  Ref.get(cursorOf(self)).pipe(
    Effect.flatMap((position) =>
      Effect.tryPromise({
        try: () => driverOf(self).write(pending, 0, pending.length, Number(position)),
        catch: failureOf('writeAll'),
      })
    ),
    Effect.flatMap(({ bytesWritten }) =>
      Effect.fromResult(
        planWriteContinuation(new WriteAllChunk({ fd: self.fd, written: bytesWritten, remaining: pending.length })),
      ).pipe(
        Effect.mapError(writeZeroRefusal),
        Effect.flatMap((decision) =>
          advance(self, BigInt(writtenOf(decision, pending.length))).pipe(Effect.as(decision))
        ),
      )
    ),
  )

const drain = (self: OpenFile, pending: Uint8Array): Effect.Effect<void, Error.PlatformError> =>
  Effect.suspend(() =>
    pending.length === 0
      ? Effect.void
      : writeChunk(self, pending).pipe(Effect.flatMap((decision) => drain(self, pendingAfter(decision, pending))))
  )

export const writeAll: {
  (buffer: Uint8Array): (self: OpenFile) => Effect.Effect<void, Error.PlatformError>
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<void, Error.PlatformError>
} = dual(2, (self: OpenFile, buffer: Uint8Array): Effect.Effect<void, Error.PlatformError> => drain(self, buffer))

const clampedTo = (decision: TruncateCursorDecision): bigint =>
  Match.value(decision).pipe(
    Match.tag('CursorKept', (kept) => kept.position),
    Match.tag('CursorClamped', (clamped) => clamped.position),
    Match.exhaustive,
  )

const lengthOrZero = (length?: number): number => length ?? 0

export const truncate: {
  (length?: number): (self: OpenFile) => Effect.Effect<void, Error.PlatformError>
  (self: OpenFile, length?: number): Effect.Effect<void, Error.PlatformError>
} = dual(
  (args) => isOpenFile(args[0]),
  (self: OpenFile, length?: number): Effect.Effect<void, Error.PlatformError> =>
    Effect.tryPromise({
      try: () => driverOf(self).truncate(lengthOrZero(length)),
      catch: failureOf('truncate'),
    }).pipe(
      Effect.flatMap(() =>
        Ref.update(cursorOf(self), (position) =>
          planTruncateCursor(new PlanTruncateCursor({ position, length: lengthOrZero(length) })).pipe(
            Result.getOrThrow,
            clampedTo,
          ))
      ),
    ),
)

export const close = (self: OpenFile): Effect.Effect<void, Error.PlatformError> =>
  Effect.tryPromise({ try: () => driverOf(self).close(), catch: failureOf('close') })

export const file: {
  (info: Effect.Effect<FileSystem.File.Info, Error.PlatformError>): (self: OpenFile) => FileSystem.File
  (self: OpenFile, info: Effect.Effect<FileSystem.File.Info, Error.PlatformError>): FileSystem.File
} = dual(
  (args) => isOpenFile(args[0]),
  (self: OpenFile, info: Effect.Effect<FileSystem.File.Info, Error.PlatformError>): FileSystem.File => ({
    [FileSystem.FileTypeId]: FileSystem.FileTypeId,
    stat: info,
    sync: sync(self),
    seek: (offset, from) => seek(self, offset, from),
    read: (buffer) => read(self, buffer),
    readAlloc: (size) => readAlloc(self, size),
    truncate: (length) => truncate(self, length),
    write: (buffer) => write(self, buffer),
    writeAll: (buffer) => writeAll(self, buffer),
  }),
)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')

  const Size = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 64 })))

  const magnitudeOf = (value: bigint): bigint => value < 0n ? -value : value

  const seekOutcomeOf = (position: bigint, offset: bigint, from: FileSystem.SeekMode): bigint | string =>
    Result.match(planSeekPosition(position, offset, from), {
      onFailure: (refusal) => refusal._tag,
      onSuccess: (planned) => planned,
    })

  const stalled = (): Promise<{ bytesRead: number; bytesWritten: number; buffer: Uint8Array }> =>
    Promise.resolve({ bytesRead: 0, bytesWritten: 0, buffer: new Uint8Array(0) })

  const stalledDriver: Driver = {
    fd: 3,
    stat: () => Promise.reject(new globalThis.Error('a stalled driver describes nothing')),
    sync: Promise.resolve.bind(Promise),
    read: stalled,
    write: stalled,
    truncate: Promise.resolve.bind(Promise),
    close: Promise.resolve.bind(Promise),
  }

  it.prop(
    '∀s_SeekRefusal_≡NegativePosition',
    [Schema.BigInt, Schema.BigInt],
    ([pos, delta]) => {
      const position = magnitudeOf(pos)
      const span = magnitudeOf(delta)
      return seekOutcomeOf(position, -(position + span + 1n), 'current') === 'CursorRefusal' &&
        seekOutcomeOf(position, -1n - span, 'start') === 'CursorRefusal'
    },
  )

  it.prop(
    '∀s_SeekPlanned_≡ExactBigIntStart',
    [Schema.BigInt, Schema.BigInt],
    ([pos, off]) => seekOutcomeOf(magnitudeOf(pos), magnitudeOf(off), 'start') === magnitudeOf(off),
  )

  it.prop(
    '∀s_SeekPlanned_≡ExactBigIntCurrent',
    [Schema.BigInt, Schema.BigInt],
    ([pos, off]) =>
      seekOutcomeOf(magnitudeOf(pos), magnitudeOf(off), 'current') === magnitudeOf(pos) + magnitudeOf(off),
  )

  it.effect.prop(
    '∀n_StalledDriver_≡RefusedNotLooped',
    [Size],
    ([size]) =>
      Effect.flatMap(make(stalledDriver), (file) =>
        Effect.map(
          Effect.all([Effect.flip(writeAll(file, new Uint8Array(size))), Effect.flip(stat(file))]),
          ([written, described]) =>
            Predicate.isTagged(written.reason, 'WriteZero') && described.reason.method === 'stat',
        )),
  )

  const sliceFor = (requested: number, bytesRead: number): Option.Option<Uint8Array> =>
    planReadSlice(new ReadSlice({ bytesRead, requested })).pipe(
      Result.getOrThrow,
      sliceOf(new Uint8Array(requested)),
    )

  it.prop(
    '∀nr_Slice_≡MinReadRequested',
    [Size, Size],
    ([requested, bytesRead]) =>
      Option.exists(sliceFor(requested, bytesRead), (bytes) => bytes.length === Math.min(bytesRead, requested)),
  )

  it.prop('∀nr_Slice_≡NothingWhenNothingRead', [Size], ([requested]) => Option.isNone(sliceFor(requested, 0)))

  it.prop('∀nw_Pending_≡Remainder', [Size, Size], ([remaining, written]) =>
    Option.exists(
      Result.getSuccess(planWriteContinuation(new WriteAllChunk({ fd: 3, written, remaining }))),
      (decision) => pendingAfter(decision, new Uint8Array(remaining)).length === Math.max(remaining - written, 0),
    ))
}
