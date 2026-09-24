/// <reference types="vitest/importMeta" />
import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Option, Ref } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Error from 'effect/PlatformError'
import * as Result from 'effect/Result'
import { infoOf, shapeFailure, statOf } from './driver-values.js'
import { CursorRefusal } from './MemoryFileSystemError.schema.js'
import { planReadSlice, ReadSlice, type ReadSliceDecision } from './plan-read-slice.workflow.js'
import { PlanTruncateCursor, planTruncateCursor, type TruncateCursorDecision } from './plan-truncate-cursor.workflow.js'
import {
  planWriteContinuation,
  WriteAllChunk,
  type WriteAllChunkDecision,
  type WriteZero,
} from './plan-write-continuation.workflow.js'

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

/** The memfs file handle, narrowed from what the volume's `open` resolves to. */
export interface FileHandle {
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

/** The child driver: the memfs file handle and the cursor the operations move. */
export interface Driver {
  readonly file: FileHandle
  readonly cursor: Ref.Ref<bigint>
}

/** What an open file carries: its descriptor. */
export interface OpenFileData {
  readonly fd: number
}

export type OpenFileHandle = Handle.Handle<'OpenFile', OpenFileData>

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

const sliceOf = (buf: Uint8Array) => (decision: ReadSliceDecision): Option.Option<Uint8Array> =>
  Match.value(decision).pipe(
    Match.tag('ReadExhausted', () => Option.none<Uint8Array>()),
    Match.tag('ReadWhole', () => Option.some<Uint8Array>(buf)),
    Match.tag('ReadPartial', (partial) => Option.some<Uint8Array>(buf.subarray(0, partial.bytesRead))),
    Match.exhaustive,
  )

const writtenOf = (decision: WriteAllChunkDecision, remaining: number): number =>
  Match.value(decision).pipe(
    Match.tag('WriteContinued', (continued) => continued.skip),
    Match.tag('WriteDrained', () => remaining),
    Match.exhaustive,
  )

const pendingAfter = (decision: WriteAllChunkDecision, pending: Uint8Array): Uint8Array =>
  pending.subarray(writtenOf(decision, pending.length))

const clampedTo = (decision: TruncateCursorDecision): bigint =>
  Match.value(decision).pipe(
    Match.tag('CursorKept', (kept) => kept.position),
    Match.tag('CursorClamped', (clamped) => clamped.position),
    Match.exhaustive,
  )

const lengthOrZero = (length?: number): number => length ?? 0

/**
 * Declares the file a filesystem handle opens. Only `MemoryFileSystem`'s `open` child entry
 * creates its driver, so its release is registered in the caller's Scope the moment the file
 * is opened, and every operation runs only while the file is open.
 */
export const OpenFile = Handle.make({
  name: 'OpenFile',
  shape: Handle.shape<Driver, OpenFileData>(),
  release: [[(driver) => Effect.tryPromise({ try: () => driver.file.close(), catch: failureOf('close') })]],
  operations: {
    stat: (driver, _self) => Effect.tryPromise({ try: () => driver.file.stat(), catch: failureOf('stat') }),
    sync: (driver, _self) => Effect.tryPromise({ try: () => driver.file.sync(), catch: failureOf('sync') }),
    seek: (driver, _self, offset: bigint, from: FileSystem.SeekMode) =>
      Effect.flatMap(Ref.get(driver.cursor), (position) =>
        Effect.flatMap(
          Effect.fromResult(planSeekPosition(position, offset, from)).pipe(Effect.mapError(seekRefusal)),
          (next) => Effect.as(Ref.set(driver.cursor, next), next),
        )),
    read: (driver, _self, buffer: Uint8Array) =>
      Effect.flatMap(Ref.get(driver.cursor), (position) =>
        Effect.flatMap(
          Effect.tryPromise({
            try: () => driver.file.read(buffer, 0, buffer.length, Number(position)),
            catch: failureOf('read'),
          }),
          ({ bytesRead }) => Effect.as(Ref.update(driver.cursor, (p) => p + BigInt(bytesRead)), bytesRead),
        )),
    readAlloc: (driver, _self, size: number) =>
      Effect.suspend(() => {
        const buf = new Uint8Array(size)
        return Effect.flatMap(Ref.get(driver.cursor), (position) =>
          Effect.flatMap(
            Effect.tryPromise({
              try: () => driver.file.read(buf, 0, size, Number(position)),
              catch: failureOf('readAlloc'),
            }),
            ({ bytesRead }) =>
              Effect.flatMap(
                Effect.fromResult(planReadSlice(new ReadSlice({ bytesRead, requested: size }))),
                (decision) =>
                  Effect.as(Ref.update(driver.cursor, (p) => p + BigInt(bytesRead)), sliceOf(buf)(decision)),
              ),
          ))
      }),
    write: (driver, _self, buffer: Uint8Array) =>
      Effect.flatMap(Ref.get(driver.cursor), (position) =>
        Effect.flatMap(
          Effect.tryPromise({
            try: () => driver.file.write(buffer, 0, buffer.length, Number(position)),
            catch: failureOf('write'),
          }),
          ({ bytesWritten }) => Effect.as(Ref.update(driver.cursor, (p) => p + BigInt(bytesWritten)), bytesWritten),
        )),
    writeAll: (driver, self, buffer: Uint8Array) =>
      Effect.flatMap(Ref.make(buffer), (pending) => {
        const step = Effect.flatMap(Ref.get(pending), (chunk) =>
          chunk.length === 0
            ? Effect.succeed(false)
            : Effect.flatMap(Ref.get(driver.cursor), (position) =>
              Effect.flatMap(
                Effect.tryPromise({
                  try: () => driver.file.write(chunk, 0, chunk.length, Number(position)),
                  catch: failureOf('writeAll'),
                }),
                ({ bytesWritten }) =>
                  Effect.fromResult(
                    planWriteContinuation(
                      new WriteAllChunk({ fd: self.fd, written: bytesWritten, remaining: chunk.length }),
                    ),
                  ).pipe(
                    Effect.mapError(writeZeroRefusal),
                    Effect.flatMap((decision) => {
                      const rest = pendingAfter(decision, chunk)
                      return Effect.as(
                        Ref.update(driver.cursor, (p) => p + BigInt(writtenOf(decision, chunk.length))),
                        rest.length > 0,
                      )
                    }),
                  ),
              )))
        return Effect.asVoid(Effect.repeat(step, { while: (more: boolean) => more }))
      }),
    truncate: (driver, _self, length?: number) =>
      Effect.tryPromise({
        try: () => driver.file.truncate(lengthOrZero(length)),
        catch: failureOf('truncate'),
      }).pipe(
        Effect.flatMap(() =>
          Ref.update(driver.cursor, (position) =>
            planTruncateCursor(new PlanTruncateCursor({ position, length: lengthOrZero(length) })).pipe(
              Result.getOrThrow,
              clampedTo,
            ))
        ),
      ),
  },
})

/** What the file reports about itself: the memfs record, narrowed and widened to the port's info. */
export const info = (self: OpenFileHandle): Effect.Effect<FileSystem.File.Info, Error.PlatformError> =>
  Effect.flatMap(
    OpenFile.operations.stat(self),
    (record) =>
      Effect.fromResult(statOf(record)).pipe(Effect.mapError(shapeFailure('stat record')), Effect.map(infoOf)),
  )

/** The port's file view of an open file, built from the child's own operations. */
export const file: {
  (info: Effect.Effect<FileSystem.File.Info, Error.PlatformError>): (self: OpenFileHandle) => FileSystem.File
  (self: OpenFileHandle, info: Effect.Effect<FileSystem.File.Info, Error.PlatformError>): FileSystem.File
} = dual(
  (args) => OpenFile.is(args[0]),
  (self: OpenFileHandle, info: Effect.Effect<FileSystem.File.Info, Error.PlatformError>): FileSystem.File => ({
    [FileSystem.FileTypeId]: FileSystem.FileTypeId,
    stat: info,
    sync: OpenFile.operations.sync(self),
    seek: (offset, from) => OpenFile.operations.seek(self, offset, from),
    read: (buffer) => OpenFile.operations.read(self, buffer),
    readAlloc: (size) => OpenFile.operations.readAlloc(self, size),
    truncate: (length) => OpenFile.operations.truncate(self, length),
    write: (buffer) => OpenFile.operations.write(self, buffer),
    writeAll: (buffer) => OpenFile.operations.writeAll(self, buffer),
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

  const Chunk = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 64 })))

  const continuationOf = (written: number): string =>
    Result.match(planWriteContinuation(new WriteAllChunk({ fd: 8, written, remaining: 2 })), {
      onFailure: (zero) => writeZeroRefusal(zero).reason._tag,
      onSuccess: () => 'continued',
    })

  it.prop(
    '∀nw_StalledWrite_≡RefusedNotLooped',
    [Chunk],
    ([written]) => continuationOf(written) === (written === 0 ? 'WriteZero' : 'continued'),
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
