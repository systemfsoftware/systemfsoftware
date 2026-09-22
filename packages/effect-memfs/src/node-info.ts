/// <reference types="vitest/importMeta" />
import * as Array from 'effect/Array'
import * as ByteSize from 'effect/ByteSize'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import type { FileHandle, Stat } from './driver-shape.js'
import { ShapeRefusal } from './node-info.schema.js'

export { ShapeRefusal } from './node-info.schema.js'

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null

const isFunctionProperty = (value: object, property: string): boolean => {
  if (!Predicate.hasProperty(value, property)) {
    return false
  }
  return typeof value[property] === 'function'
}

const hasClose = (value: object): boolean => isFunctionProperty(value, 'close')
const hasRead = (value: object): boolean => isFunctionProperty(value, 'read')
const hasWrite = (value: object): boolean => isFunctionProperty(value, 'write')
const hasIsFile = (value: object): boolean => isFunctionProperty(value, 'isFile')
const hasIsDirectory = (value: object): boolean => isFunctionProperty(value, 'isDirectory')

const isStatRecord = (value: object): value is Stat => hasIsFile(value) && hasIsDirectory(value)

const isStat = (value: unknown): value is Stat => isObject(value) && isStatRecord(value)

const hasReadAndWrite = (value: object): boolean => hasRead(value) && hasWrite(value)

const isFileHandleRecord = (value: object): value is FileHandle => hasClose(value) && hasReadAndWrite(value)

const isFileHandle = (value: unknown): value is FileHandle => isObject(value) && isFileHandleRecord(value)

export const statOf = <S = unknown>(value: S): Result.Result<Stat, ShapeRefusal> => {
  if (isStat(value)) {
    return Result.succeed(value)
  }
  return Result.fail(new ShapeRefusal({ method: 'stat', cause: value }))
}

export const fileHandleOf = <H = unknown>(value: H): Result.Result<FileHandle, ShapeRefusal> => {
  if (isFileHandle(value)) {
    return Result.succeed(value)
  }
  return Result.fail(new ShapeRefusal({ method: 'open', cause: value }))
}

const isZeroOrNaN = (value: number): boolean => value === 0 || Number.isNaN(value)

export const numberOptionOf = (value: number): Option.Option<number> => {
  if (isZeroOrNaN(value)) {
    return Option.none()
  }
  return Option.some(value)
}

const sizeOptionOf = (value: number): Option.Option<ByteSize.ByteSize> =>
  Option.map(numberOptionOf(value), (n) => ByteSize.bytes(n))

const KIND_ASSOCIATIONS = (stat: Stat): ReadonlyArray<readonly [boolean, FileSystem.File.Type]> => [
  [stat.isFile(), 'File'],
  [stat.isDirectory(), 'Directory'],
  [stat.isSymbolicLink(), 'SymbolicLink'],
  [stat.isBlockDevice(), 'BlockDevice'],
  [stat.isCharacterDevice(), 'CharacterDevice'],
  [stat.isFIFO(), 'FIFO'],
  [stat.isSocket(), 'Socket'],
]

const kindOf = (stat: Stat): FileSystem.File.Type =>
  Option.match(
    Array.findFirst(KIND_ASSOCIATIONS(stat), ([matches]) => matches),
    {
      onNone: () => 'Unknown',
      onSome: ([, type]) => type,
    },
  )

export const fileInfoOf = (stat: Stat): FileSystem.File.Info => ({
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

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { DateTime, Schema } = await import('effect')

  const KINDS = ['File', 'Directory', 'SymbolicLink', 'BlockDevice', 'CharacterDevice', 'FIFO', 'Socket'] as const

  const epoch = DateTime.toDate(DateTime.makeUnsafe(0))

  const statWithKind = (kind: (typeof KINDS)[number]): Stat => ({
    isFile: () => kind === 'File',
    isDirectory: () => kind === 'Directory',
    isSymbolicLink: () => kind === 'SymbolicLink',
    isBlockDevice: () => kind === 'BlockDevice',
    isCharacterDevice: () => kind === 'CharacterDevice',
    isFIFO: () => kind === 'FIFO',
    isSocket: () => kind === 'Socket',
    mode: 0o644,
    size: 12,
    blocks: 2,
    blksize: 4096,
    dev: 1,
    ino: 7,
    nlink: 1,
    uid: 1000,
    gid: 1000,
    rdev: 0,
    mtime: epoch,
    atime: epoch,
    birthtime: epoch,
  })

  it.prop('∀k_Kind_≡Self', [Schema.Literals(KINDS)], ([kind]) => kindOf(statWithKind(kind)) === kind)

  it.prop(
    '∀f_FiniteNumber_≡Some',
    [Schema.Finite],
    ([n]) => n === 0 ? Option.isNone(numberOptionOf(n)) : Option.getOrThrow(numberOptionOf(n)) === n,
  )

  const nanOf = (n: number): number => (n - n) * Number.POSITIVE_INFINITY

  it.prop(
    '∀n_NaN_∈Absents',
    [Schema.Finite],
    ([n]) => isZeroOrNaN(nanOf(n)) && Option.isNone(numberOptionOf(nanOf(n))),
  )

  it.prop(
    '∀b_NonNegativeSize_≡BytesOf',
    [Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))],
    ([n]) => n === 0 ? Option.isNone(sizeOptionOf(n)) : Number(Option.getOrThrow(sizeOptionOf(n))) === n,
  )

  it.prop('∀s_MalformedStat_∈Refusals', [Schema.String], ([s]) => Result.isFailure(statOf(s)))
}
