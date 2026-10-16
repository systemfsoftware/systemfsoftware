import { Predicate, Schema } from 'effect'
import * as Error from 'effect/PlatformError'

export class ShapeRefusal extends Schema.TaggedError<ShapeRefusal>()('ShapeRefusal', {
  method: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `The "${this.method}" call was given a value that is not a memory file system driver`
  }
}

export class CursorRefusal extends Schema.TaggedError<CursorRefusal>()('CursorRefusal', {
  method: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `The "${this.method}" call would move the cursor before the start of the file`
  }
}

export type MemoryFileSystemError = ShapeRefusal | CursorRefusal

/** The platform-shaped failure a memory file system driver call turns into. */
export type MemoryFileSystemFailure = Error.PlatformError

const REASON_BY_CODE: Readonly<Record<string, Error.SystemErrorTag>> = {
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
  ERR_OUT_OF_RANGE: 'BadResource',
}

const stringOrEmpty = <V = unknown>(value: V): string => typeof value === 'string' ? value : ''

const stringFieldOf = <E = unknown>(error: E, property: string): string =>
  Predicate.hasProperty(error, property) ? stringOrEmpty(error[property]) : ''

const tagOf = (code: string): Error.SystemErrorTag => REASON_BY_CODE[code] ?? 'Unknown'

export const failureOf: (method: string) => <E = unknown>(error: E) => MemoryFileSystemFailure = (method) => (error) =>
  Error.systemError({
    _tag: tagOf(stringFieldOf(error, 'code')),
    module: 'FileSystem',
    method,
    description: `${method} failed`,
    pathOrDescriptor: stringFieldOf(error, 'path'),
    syscall: stringFieldOf(error, 'syscall'),
    cause: error,
  })

export const shapeFailure: (shape: string) => (cause: ShapeRefusal) => MemoryFileSystemFailure = (shape) => (cause) =>
  Error.systemError({
    _tag: 'BadResource',
    module: 'FileSystem',
    method: cause.method,
    description: `${cause.method} failed: the driver returned a value that is not a ${shape}`,
    cause,
  })

const shapeRefusalMessageOf = (method: string): string => new ShapeRefusal({ method }).message

const cursorRefusalMessageOf = (method: string): string => new CursorRefusal({ method }).message

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀m_ShapeRefusalMessage_≡Expected',
    { of: [Schema.String], subject: shapeRefusalMessageOf },
    (subject, [method]) =>
      subject(method) === `The "${method}" call was given a value that is not a memory file system driver`,
  )

  it.prop(
    '∀m_CursorRefusalMessage_≡Expected',
    { of: [Schema.String], subject: cursorRefusalMessageOf },
    (subject, [method]) =>
      subject(method) === `The "${method}" call would move the cursor before the start of the file`,
  )

  const ErrorField = Schema.Literals(['absent', 'text', 'number'])

  const fieldShaped = {
    absent: (_key: string, _text: string) => ({ record: {}, read: '' }),
    text: (key: string, text: string) => ({ record: { [key]: text }, read: text }),
    number: (key: string, text: string) => ({ record: { [key]: text.length }, read: '' }),
  }

  const stringFieldSubject = (key: string, text: string, field: keyof typeof fieldShaped) =>
    stringFieldOf(fieldShaped[field](key, text).record, key)

  it.prop(
    '∀k_ErrorField_≡StringOrEmpty',
    { of: [Schema.String, Schema.String, ErrorField], subject: stringFieldSubject },
    (subject, [key, text, field]) => subject(key, text, field) === fieldShaped[field](key, text).read,
  )
}
