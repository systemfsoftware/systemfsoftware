/// <reference types="vitest/importMeta" />
import { Effect, Match, Option, Predicate, Ref } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import * as Error from 'effect/PlatformError'
import * as Result from 'effect/Result'
import { ShapeRefusal } from './MemoryFileSystemError.schema.js'
import { planReadSlice, ReadSlice, type ReadSliceDecision } from './plan-read-slice.workflow.js'
import { PlanSeek, planSeek, type SeekBeforeStart, type SeekPlanned } from './plan-seek.workflow.js'
import { PlanTruncateCursor, planTruncateCursor, type TruncateCursorDecision } from './plan-truncate-cursor.workflow.js'
import {
  planWriteContinuation,
  WriteAllChunk,
  type WriteAllChunkDecision,
  type WriteZero,
} from './plan-write-continuation.workflow.js'

export const TypeId = Symbol.for('~systemfsoftware/memfs/OpenFile')
export type TypeId = typeof TypeId

const DriverId: unique symbol = Symbol.for('~systemfsoftware/memfs/OpenFile/driver')
const CursorId: unique symbol = Symbol.for('~systemfsoftware/memfs/OpenFile/cursor')

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
  ): Promise<{ bytesRead: number; buffer: Buffer }>
  write(
    buffer: Uint8Array,
    offset: number | undefined,
    length: number,
    position?: number | null,
  ): Promise<{ bytesWritten: number; buffer: Buffer }>
  truncate(len?: number): Promise<void>
  close(): Promise<void>
}

export interface OpenFile extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly [DriverId]: Driver
  readonly [CursorId]: Ref.Ref<bigint>
  readonly fd: number
}

export const isOpenFile = (u: unknown): u is OpenFile => Predicate.hasProperty(u, TypeId)

export const make = (driver: Driver): Effect.Effect<OpenFile> =>
  Effect.map(Ref.make(0n), (cursor) => ({
    [TypeId]: TypeId,
    [DriverId]: driver,
    [CursorId]: cursor,
    fd: driver.fd,
    ...Prototype,
  }))

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

const seekRefusal = (cause: SeekBeforeStart): Error.PlatformError =>
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

const shapeRefusal = (cause: ShapeRefusal): Error.PlatformError =>
  Error.systemError({
    _tag: 'BadResource',
    module: 'FileSystem',
    method: cause.method,
    description: `${cause.method} failed: the driver returned a value of the wrong shape`,
    cause,
  })

const positioned = (self: OpenFile, planned: SeekPlanned): Effect.Effect<bigint> =>
  Ref.set(self[CursorId], planned.position).pipe(Effect.as(planned.position))

const applySeek =
  (self: OpenFile) => (decision: SeekPlanned | SeekBeforeStart): Effect.Effect<bigint, Error.PlatformError> =>
    Match.value(decision).pipe(
      Match.tag('SeekPlanned', (planned) => positioned(self, planned)),
      Match.tag('SeekBeforeStart', (refusal) => Effect.fail(seekRefusal(refusal))),
      Match.exhaustive,
    )

export const seek: {
  (offset: bigint, from: FileSystem.SeekMode): (self: OpenFile) => Effect.Effect<bigint, Error.PlatformError>
  (self: OpenFile, offset: bigint, from: FileSystem.SeekMode): Effect.Effect<bigint, Error.PlatformError>
} = dual(
  3,
  (self: OpenFile, offset: bigint, from: FileSystem.SeekMode): Effect.Effect<bigint, Error.PlatformError> =>
    Ref.get(self[CursorId]).pipe(
      Effect.flatMap((position) => Effect.fromResult(planSeek(new PlanSeek({ position, offset, from })))),
      Effect.mapError(seekRefusal),
      Effect.flatMap(applySeek(self)),
    ),
)

const advance = (self: OpenFile, delta: bigint): Effect.Effect<bigint, Error.PlatformError> =>
  seek(self, delta, 'current')

export const stat = (self: OpenFile): Effect.Effect<Stat, Error.PlatformError> =>
  Effect.tryPromise({ try: () => self[DriverId].stat(), catch: failureOf('stat') })

export const sync = (self: OpenFile): Effect.Effect<void, Error.PlatformError> =>
  Effect.tryPromise({ try: () => self[DriverId].sync(), catch: failureOf('sync') })

export const read: {
  (buffer: Uint8Array): (self: OpenFile) => Effect.Effect<number, Error.PlatformError>
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError>
} = dual(
  2,
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError> =>
    Ref.get(self[CursorId]).pipe(
      Effect.flatMap((position) =>
        Effect.tryPromise({
          try: () => self[DriverId].read(buffer, 0, buffer.length, Number(position)),
          catch: failureOf('read'),
        })
      ),
      Effect.flatMap(({ bytesRead }) => advance(self, BigInt(bytesRead)).pipe(Effect.as(bytesRead))),
    ),
)

const sliceOf = (buf: Buffer) => (decision: ReadSliceDecision): Option.Option<Uint8Array> =>
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
      const buf = Buffer.allocUnsafeSlow(size)
      return Ref.get(self[CursorId]).pipe(
        Effect.flatMap((position) =>
          Effect.tryPromise({
            try: () => self[DriverId].read(buf, 0, size, Number(position)),
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
    Ref.get(self[CursorId]).pipe(
      Effect.flatMap((position) =>
        Effect.tryPromise({
          try: () => self[DriverId].write(buffer, 0, buffer.length, Number(position)),
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
  Ref.get(self[CursorId]).pipe(
    Effect.flatMap((position) =>
      Effect.tryPromise({
        try: () => self[DriverId].write(pending, 0, pending.length, Number(position)),
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
      try: () => self[DriverId].truncate(lengthOrZero(length)),
      catch: failureOf('truncate'),
    }).pipe(
      Effect.flatMap(() =>
        Ref.update(
          self[CursorId],
          (position) =>
            clampedTo(
              Result.getOrThrow(planTruncateCursor(new PlanTruncateCursor({ position, length: lengthOrZero(length) }))),
            ),
        )
      ),
    ),
)

export const close = (self: OpenFile): Effect.Effect<void, Error.PlatformError> =>
  Effect.tryPromise({ try: () => self[DriverId].close(), catch: failureOf('close') })

export const refusalOf = shapeRefusal

export const file = (
  self: OpenFile,
  info: Effect.Effect<FileSystem.File.Info, Error.PlatformError>,
): FileSystem.File => ({
  [FileSystem.FileTypeId]: FileSystem.FileTypeId,
  stat: info,
  sync: sync(self),
  seek: (offset, from) => seek(self, offset, from),
  read: (buffer) => read(self, buffer),
  readAlloc: (size) => readAlloc(self, size),
  truncate: (length) => truncate(self, length),
  write: (buffer) => write(self, buffer),
  writeAll: (buffer) => writeAll(self, buffer),
})

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')

  const Size = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 64 })))
  const Count = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 64 })))

  it.prop('∀nr_Slice_≡MinReadRequested', [Size, Count], ([requested, bytesRead]) =>
    Option.match(
      sliceOf(Buffer.alloc(requested))(Result.getOrThrow(planReadSlice(new ReadSlice({ bytesRead, requested })))),
      {
        onNone: () => bytesRead === 0,
        onSome: (bytes) => bytes.length === Math.min(bytesRead, requested),
      },
    ))

  it.prop(
    '∀nw_Pending_≡Remainder',
    [Size, Count],
    ([remaining, written]) =>
      Result.match(planWriteContinuation(new WriteAllChunk({ fd: 3, written, remaining })), {
        onFailure: () => written === 0,
        onSuccess: (decision) =>
          pendingAfter(decision, new Uint8Array(remaining)).length === Math.max(remaining - written, 0),
      }),
  )
}
