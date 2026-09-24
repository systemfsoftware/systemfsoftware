/// <reference types="vitest/importMeta" />
import { Option, Predicate } from 'effect'
import * as Arr from 'effect/Array'
import * as ByteSize from 'effect/ByteSize'
import type * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import * as Error from 'effect/PlatformError'
import * as Result from 'effect/Result'
import { ShapeRefusal } from './MemoryFileSystemError.schema.js'
import type { Contents } from './MemoryFileSystemSpec.schema.js'
import type * as OpenFile from './open-file.handle.js'

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

export const stringOrEmpty = <V = unknown>(value: V): string => (typeof value === 'string' ? value : '')

const volumeBodyOf = (body: Contents[string]): string | null => body instanceof Uint8Array ? '' : body

export const volumeJSONOf = (contents: Contents): Record<string, string | null> =>
  Object.fromEntries(Object.entries(contents).map(([path, body]) => [path, volumeBodyOf(body)]))

const directoryOf = (cwd: string): string => cwd.endsWith('/') ? cwd : `${cwd}/`

const absoluteOf = (cwd: string, path: string): string => path.startsWith('/') ? path : directoryOf(cwd) + path

type ByteBodies = ReadonlyArray<readonly [path: string, bytes: Uint8Array]>

export const byteBodiesOf: {
  (contents: Contents): (cwd: string) => ByteBodies
  (cwd: string, contents: Contents): ByteBodies
} = dual(
  2,
  (cwd: string, contents: Contents): ByteBodies =>
    Object.entries(contents).flatMap(([path, body]) =>
      body instanceof Uint8Array ? [[absoluteOf(cwd, path), body] as const] : []
    ),
)

const stringFieldOf = <E = unknown>(error: E, property: string): string => {
  if (!Predicate.hasProperty(error, property)) {
    return ''
  }
  return stringOrEmpty(error[property])
}

const tagOf = (code: string): Error.SystemErrorTag => REASON_BY_ERRNO[code] ?? 'Unknown'

export const failureOf = (method: string) => <E = unknown>(error: E): Error.PlatformError =>
  Error.systemError({
    _tag: tagOf(stringFieldOf(error, 'code')),
    module: 'FileSystem',
    method,
    description: `${method} failed`,
    pathOrDescriptor: stringFieldOf(error, 'path'),
    syscall: stringFieldOf(error, 'syscall'),
    cause: error,
  })

export const shapeFailure = (shape: string) => (cause: ShapeRefusal): Error.PlatformError =>
  Error.systemError({
    _tag: 'BadResource',
    module: 'FileSystem',
    method: cause.method,
    description: `${cause.method} failed: the driver returned a value that is not a ${shape}`,
    cause,
  })

const isFunctionProperty = <V = unknown>(value: V, property: string): boolean => {
  if (!Predicate.hasProperty(value, property)) {
    return false
  }
  return typeof value[property] === 'function'
}

const isStat = (value: unknown): value is OpenFile.Stat =>
  isFunctionProperty(value, 'isFile') && isFunctionProperty(value, 'isDirectory')

const isReadWrite = <V = unknown>(value: V): boolean =>
  isFunctionProperty(value, 'read') && isFunctionProperty(value, 'write')

const isDriver = (value: unknown): value is OpenFile.FileHandle =>
  isFunctionProperty(value, 'close') && isReadWrite(value)

export const statOf = <S = unknown>(value: S): Result.Result<OpenFile.Stat, ShapeRefusal> => {
  if (isStat(value)) {
    return Result.succeed(value)
  }
  return Result.fail(new ShapeRefusal({ method: 'stat', cause: value }))
}

export const driverOf = <H = unknown>(value: H): Result.Result<OpenFile.FileHandle, ShapeRefusal> => {
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
  OpenFile.Stat,
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

export const infoOf = (stat: OpenFile.Stat): FileSystem.File.Info => ({
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

export const bytesOf = (contents: string | Uint8Array): Uint8Array =>
  typeof contents === 'string' ? new TextEncoder().encode(contents) : contents

const isNamed = (entry: unknown): entry is { readonly name: string | Uint8Array } =>
  Predicate.hasProperty(entry, 'name')

export const entryPathOf = (entry: string | Uint8Array | { readonly name: string | Uint8Array }): string =>
  isNamed(entry) ? textOf(entry.name) : textOf(entry)

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')

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
  const EntryShape = Schema.Literals(['text', 'bytes', 'named text', 'named bytes'])
  const ContentsShape = Schema.Literals(['text', 'bytes'])
  const ErrorField = Schema.Literals(['absent', 'text', 'number'])

  const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

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

  const answersDriver = (answers: ReadonlyArray<string>): boolean =>
    answers.includes('close') && answersReadWrite(answers)

  const answersReadWrite = (answers: ReadonlyArray<string>): boolean =>
    answers.includes('read') && answers.includes('write')

  const refusalNames = (method: string) => (refusal: ShapeRefusal): boolean =>
    shapeFailure('record')(refusal).reason.method === method

  const entryShaped = {
    text: (text: string) => text,
    bytes: encode,
    'named text': (text: string) => ({ name: text }),
    'named bytes': (text: string) => ({ name: encode(text) }),
  }

  const contentsShaped = { text: (text: string) => text, bytes: encode }

  const fieldShaped = {
    absent: (_key: string, _text: string) => ({ record: {}, read: '' }),
    text: (key: string, text: string) => ({ record: { [key]: text }, read: text }),
    number: (key: string, text: string) => ({ record: { [key]: text.length }, read: '' }),
  }

  it.prop(
    '∀a_StatAdmitted_≡AnswersFileAndDirectory',
    [Schema.Array(StatQuestion), Schema.Boolean],
    ([drawn, lacking]) => {
      const answers = withheld(drawn, 'isFile', ['isFile', 'isDirectory'])(lacking)
      return Result.match(statOf(recordAnswering(answers)), {
        onFailure: (refusal) => !answersStat(answers) && refusalNames('stat')(refusal),
        onSuccess: () => answersStat(answers),
      })
    },
  )

  it.prop(
    '∀a_DriverAdmitted_≡AnswersCloseReadWrite',
    [Schema.Array(DriverQuestion), Schema.Boolean],
    ([drawn, lacking]) => {
      const answers = withheld(drawn, 'close', ['close', 'read', 'write'])(lacking)
      return Result.match(driverOf(recordAnswering(answers)), {
        onFailure: (refusal) => !answersDriver(answers) && refusalNames('open')(refusal),
        onSuccess: () => answersDriver(answers),
      })
    },
  )

  it.prop('∀a_KindUnknown_≡NoKindAnswered', [Schema.Array(KindQuestion), Schema.Boolean], ([drawn, silent]) => {
    const answers = quieted(drawn, silent)
    return (kindOf(statAnswering(answers)) === 'Unknown') === (answers.length === 0)
  })

  it.prop('∀t_EntryPath_≡ShapeIndependent', [Schema.String, EntryShape], ([drawn, shape]) => {
    const text = drawn.toWellFormed()
    return entryPathOf(entryShaped[shape](text)) === text
  })

  it.prop('∀t_Contents_≡ShapeIndependent', [Schema.String, ContentsShape], ([drawn, shape]) => {
    const text = drawn.toWellFormed()
    return new TextDecoder().decode(bytesOf(contentsShaped[shape](text))) === text
  })

  it.prop('∀k_ErrorField_≡StringOrEmpty', [Schema.String, Schema.String, ErrorField], ([key, text, field]) => {
    const { record, read } = fieldShaped[field](key, text)
    return stringFieldOf(record, key) === read
  })
}
