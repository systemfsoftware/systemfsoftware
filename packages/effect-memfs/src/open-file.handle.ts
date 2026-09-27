/// <reference types="vitest/importMeta" />
import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Option, Predicate, Ref } from 'effect'
import * as Arr from 'effect/Array'
import * as ByteSize from 'effect/ByteSize'
import * as FileSystem from 'effect/FileSystem'
import { absurd, dual } from 'effect/Function'
import * as Error from 'effect/PlatformError'
import * as Result from 'effect/Result'
import { CursorRefusal, failureOf, shapeFailure, ShapeRefusal } from './MemoryFileSystemError.schema.js'
import { ReadSlice, type ReadSliceDecision } from './plan-read-slice.schema.js'
import { planReadSlice } from './plan-read-slice.workflow.js'
import { PlanSeekPosition, type SeekPositionDecision } from './plan-seek-position.schema.js'
import { planSeekPosition as planSeekPositionWorkflow } from './plan-seek-position.workflow.js'
import { PlanTruncateCursor, type TruncateCursorDecision } from './plan-truncate-cursor.schema.js'
import { planTruncateCursor } from './plan-truncate-cursor.workflow.js'
import { WriteAllChunk, type WriteAllChunkDecision, type WriteZero } from './plan-write-continuation.schema.js'
import { planWriteContinuation } from './plan-write-continuation.workflow.js'

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

const driverSlotOf = (self: OpenFile): Driver => OpenFileDef.slot(self).driver

const cursorOf = (self: OpenFile): Ref.Ref<bigint> => OpenFileDef.slot(self).cursor

const isFunctionProperty = <V = unknown>(value: V, property: string): boolean => {
  if (!Predicate.hasProperty(value, property)) {
    return false
  }
  return typeof value[property] === 'function'
}

const isStat = (value: unknown): value is Stat =>
  isFunctionProperty(value, 'isFile') && isFunctionProperty(value, 'isDirectory')

const isReadWrite = <V = unknown>(value: V): boolean =>
  isFunctionProperty(value, 'read') && isFunctionProperty(value, 'write')

const isDriver = (value: unknown): value is Driver => isFunctionProperty(value, 'close') && isReadWrite(value)

export const statOf = <S = unknown>(value: S): Result.Result<Stat, ShapeRefusal> => {
  if (isStat(value)) {
    return Result.succeed(value)
  }
  return Result.fail(new ShapeRefusal({ method: 'stat', cause: value }))
}

export const driverOf = <H = unknown>(value: H): Result.Result<Driver, ShapeRefusal> => {
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

type StatKind = Pick<
  Stat,
  'isFile' | 'isDirectory' | 'isSymbolicLink' | 'isBlockDevice' | 'isCharacterDevice' | 'isFIFO' | 'isSocket'
>

const kindAssociations = (stat: StatKind): ReadonlyArray<readonly [boolean, FileSystem.File.Type]> => [
  [stat.isFile(), 'File'],
  [stat.isDirectory(), 'Directory'],
  [stat.isSymbolicLink(), 'SymbolicLink'],
  [stat.isBlockDevice(), 'BlockDevice'],
  [stat.isCharacterDevice(), 'CharacterDevice'],
  [stat.isFIFO(), 'FIFO'],
  [stat.isSocket(), 'Socket'],
]

const kindOf = (stat: StatKind): FileSystem.File.Type =>
  Option.match(Arr.findFirst(kindAssociations(stat), ([matches]) => matches), {
    onNone: () => 'Unknown',
    onSome: ([, type]) => type,
  })

export const infoOf = (stat: Stat): FileSystem.File.Info => ({
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
const planSeekPosition = (
  position: bigint,
  offset: bigint,
  from: FileSystem.SeekMode,
): Result.Result<bigint, CursorRefusal> =>
  Match.value(
    Result.match<SeekPositionDecision, never, SeekPositionDecision>(
      planSeekPositionWorkflow(new PlanSeekPosition({ position, offset, from })),
      { onFailure: absurd, onSuccess: (decision) => decision },
    ),
  ).pipe(
    Match.tag('SeekMoved', (moved) => Result.succeed(moved.position)),
    Match.tag('SeekRefused', (refused) => Result.fail(new CursorRefusal({ method: 'seek', cause: refused.position }))),
    Match.exhaustive,
  )

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
  Effect.tryPromise({ try: () => driverSlotOf(self).stat(), catch: failureOf('stat') })

export const sync = (self: OpenFile): Effect.Effect<void, Error.PlatformError> =>
  Effect.tryPromise({ try: () => driverSlotOf(self).sync(), catch: failureOf('sync') })

export const read: {
  (buffer: Uint8Array): (self: OpenFile) => Effect.Effect<number, Error.PlatformError>
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError>
} = dual(
  2,
  (self: OpenFile, buffer: Uint8Array): Effect.Effect<number, Error.PlatformError> =>
    Ref.get(cursorOf(self)).pipe(
      Effect.flatMap((position) =>
        Effect.tryPromise({
          try: () => driverSlotOf(self).read(buffer, 0, buffer.length, Number(position)),
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
            try: () => driverSlotOf(self).read(buf, 0, size, Number(position)),
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
          try: () => driverSlotOf(self).write(buffer, 0, buffer.length, Number(position)),
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
        try: () => driverSlotOf(self).write(pending, 0, pending.length, Number(position)),
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
      try: () => driverSlotOf(self).truncate(lengthOrZero(length)),
      catch: failureOf('truncate'),
    }).pipe(
      Effect.flatMap(() =>
        Ref.update(cursorOf(self), (position) =>
          Result.match<TruncateCursorDecision, never, bigint>(
            planTruncateCursor(new PlanTruncateCursor({ position, length: lengthOrZero(length) })),
            { onFailure: absurd, onSuccess: clampedTo },
          ))
      ),
    ),
)

export const close = (self: OpenFile): Effect.Effect<void, Error.PlatformError> =>
  Effect.tryPromise({ try: () => driverSlotOf(self).close(), catch: failureOf('close') })

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
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')

  const Size = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 64 })))

  const magnitudeOf = (value: bigint): bigint => value < 0n ? -value : value

  const outcomeOf = (outcome: Result.Result<bigint, CursorRefusal>): bigint | string =>
    Result.match(outcome, {
      onFailure: (refusal) => refusal._tag,
      onSuccess: (planned) => planned,
    })

  const seekFromStart = (position: bigint, offset: bigint) => planSeekPosition(position, offset, 'start')
  const seekFromCurrent = (position: bigint, offset: bigint) => planSeekPosition(position, offset, 'current')

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

  const basePositionOf = (from: 'start' | 'current', position: bigint): bigint => from === 'start' ? 0n : position

  it.prop(
    '∀s_SeekRefusal_≡NegativePosition',
    {
      of: [Schema.BigInt, Schema.BigInt, Schema.Literals(['start', 'current'])],
      subject: planSeekPosition,
    },
    (subject, [pos, off, from]) => {
      const position = magnitudeOf(pos)
      const target = basePositionOf(from, position) + off
      return outcomeOf(subject(position, off, from)) === (target < 0n ? 'CursorRefusal' : target)
    },
  )

  it.prop(
    '∀s_SeekPlanned_≡ExactBigIntStart',
    { of: [Schema.BigInt, Schema.BigInt], subject: seekFromStart },
    (subject, [pos, off]) => outcomeOf(subject(magnitudeOf(pos), magnitudeOf(off))) === magnitudeOf(off),
  )

  it.prop(
    '∀s_SeekPlanned_≡ExactBigIntCurrent',
    { of: [Schema.BigInt, Schema.BigInt], subject: seekFromCurrent },
    (subject, [pos, off]) =>
      outcomeOf(subject(magnitudeOf(pos), magnitudeOf(off))) === magnitudeOf(pos) + magnitudeOf(off),
  )

  it.effect.prop(
    '∀n_StalledDriver_≡RefusedNotLooped',
    { of: [Size], subject: make },
    (subject, [size]) =>
      Effect.flatMap(subject(stalledDriver), (file) =>
        Effect.map(
          Effect.all([Effect.flip(writeAll(file, new Uint8Array(size))), Effect.flip(stat(file))]),
          ([written, described]) =>
            Predicate.isTagged(written.reason, 'WriteZero') && described.reason.method === 'stat',
        )),
  )

  it.effect.prop(
    '∀d_Make_≡ItsDriverFd',
    { of: [Schema.Int], subject: make },
    (subject, [fd]) => Effect.map(subject({ ...stalledDriver, fd }), (file) => file.fd === fd),
  )

  const sliceFor = (requested: number, bytesRead: number): Option.Option<Uint8Array> =>
    Result.match<ReadSliceDecision, never, Option.Option<Uint8Array>>(
      planReadSlice(new ReadSlice({ bytesRead, requested })),
      { onFailure: absurd, onSuccess: sliceOf(new Uint8Array(requested)) },
    )

  const pendingOf = (written: number, remaining: number) =>
    planWriteContinuation(new WriteAllChunk({ fd: 3, written, remaining }))

  it.prop(
    '∀nr_Slice_≡MinReadRequested',
    { of: [Size, Size], subject: sliceFor },
    (subject, [requested, bytesRead]) =>
      Option.exists(subject(requested, bytesRead), (bytes) => bytes.length === Math.min(bytesRead, requested)),
  )

  it.prop(
    '∀nr_Slice_≡NothingWhenNothingRead',
    { of: [Size], subject: sliceFor },
    (subject, [requested]) => Option.isNone(subject(requested, 0)),
  )

  it.prop(
    '∀nw_Pending_≡Remainder',
    { of: [Size, Size], subject: pendingOf },
    (subject, [remaining, written]) =>
      Option.exists(
        Result.getSuccess(subject(written, remaining)),
        (decision) => pendingAfter(decision, new Uint8Array(remaining)).length === Math.max(remaining - written, 0),
      ),
  )

  const StatQuestion = Schema.Literals(['isFile', 'isDirectory', 'isSymbolicLink'])
  const DriverQuestion = Schema.Literals(['close', 'read', 'write', 'stat'])
  const KindQuestion = Schema.Literals([
    'isFile',
    'isDirectory',
    'isSymbolicLink',
    'isBlockDevice',
    'isCharacterDevice',
    'isFIFO',
    'isSocket',
  ])

  const recordAnswering = (answers: ReadonlyArray<string>): Record<string, () => boolean> =>
    Object.fromEntries(answers.map((answer) => [answer, Boolean]))

  const withheld =
    (answers: ReadonlyArray<string>, missing: string, required: ReadonlyArray<string>) =>
    (lacking: boolean): ReadonlyArray<string> =>
      lacking ? answers.filter((answer) => answer !== missing) : [...answers, ...required]

  const quieted = (answers: ReadonlyArray<string>, silent: boolean): ReadonlyArray<string> => silent ? [] : answers

  const statAnswering = (answers: ReadonlyArray<string>): StatKind => ({
    isFile: () => answers.includes('isFile'),
    isDirectory: () => answers.includes('isDirectory'),
    isSymbolicLink: () => answers.includes('isSymbolicLink'),
    isBlockDevice: () => answers.includes('isBlockDevice'),
    isCharacterDevice: () => answers.includes('isCharacterDevice'),
    isFIFO: () => answers.includes('isFIFO'),
    isSocket: () => answers.includes('isSocket'),
  })

  const answersStat = (answers: ReadonlyArray<string>): boolean =>
    answers.includes('isFile') && answers.includes('isDirectory')

  const answersReadWrite = (answers: ReadonlyArray<string>): boolean =>
    answers.includes('read') && answers.includes('write')

  const answersDriver = (answers: ReadonlyArray<string>): boolean =>
    answers.includes('close') && answersReadWrite(answers)

  const refusalNames = (method: string) => (refusal: ShapeRefusal): boolean =>
    shapeFailure('record')(refusal).reason.method === method

  const statSubject = (drawn: ReadonlyArray<string>, lacking: boolean) =>
    statOf(recordAnswering(withheld(drawn, 'isFile', ['isFile', 'isDirectory'])(lacking)))

  const driverSubject = (drawn: ReadonlyArray<string>, lacking: boolean) =>
    driverOf(recordAnswering(withheld(drawn, 'close', ['close', 'read', 'write'])(lacking)))

  const kindSubject = (drawn: ReadonlyArray<string>, silent: boolean) => kindOf(statAnswering(quieted(drawn, silent)))

  it.prop(
    '∀a_StatAdmitted_≡AnswersFileAndDirectory',
    { of: [Schema.Array(StatQuestion), Schema.Boolean], subject: statSubject },
    (subject, [drawn, lacking]) => {
      const answers = withheld(drawn, 'isFile', ['isFile', 'isDirectory'])(lacking)
      return Result.match(subject(drawn, lacking), {
        onFailure: (refusal) => !answersStat(answers) && refusalNames('stat')(refusal),
        onSuccess: () => answersStat(answers),
      })
    },
  )

  it.prop(
    '∀a_DriverAdmitted_≡AnswersCloseReadWrite',
    { of: [Schema.Array(DriverQuestion), Schema.Boolean], subject: driverSubject },
    (subject, [drawn, lacking]) => {
      const answers = withheld(drawn, 'close', ['close', 'read', 'write'])(lacking)
      return Result.match(subject(drawn, lacking), {
        onFailure: (refusal) => !answersDriver(answers) && refusalNames('open')(refusal),
        onSuccess: () => answersDriver(answers),
      })
    },
  )

  it.prop(
    '∀a_KindUnknown_≡NoKindAnswered',
    { of: [Schema.Array(KindQuestion), Schema.Boolean], subject: kindSubject },
    (subject, [drawn, silent]) => {
      const answers = quieted(drawn, silent)
      return (subject(drawn, silent) === 'Unknown') === (answers.length === 0)
    },
  )
}
