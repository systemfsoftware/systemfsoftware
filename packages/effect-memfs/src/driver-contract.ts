/// <reference types="vitest/importMeta" />
import * as Error from 'effect/PlatformError'
import * as Predicate from 'effect/Predicate'

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

const stringOrEmpty = <V = unknown>(value: V): string => (typeof value === 'string' ? value : '')

const stringFieldOf = <E = unknown>(error: E, property: string): string => {
  if (!Predicate.hasProperty(error, property)) {
    return ''
  }
  return stringOrEmpty(error[property])
}

const tagOf = (code: string): Error.SystemErrorTag => REASON_BY_ERRNO[code] ?? 'Unknown'

export const toPlatformError = (method: string) => <E = unknown>(error: E): Error.PlatformError =>
  Error.systemError({
    _tag: tagOf(stringFieldOf(error, 'code')),
    module: 'FileSystem',
    method,
    description: `${method} failed`,
    pathOrDescriptor: stringFieldOf(error, 'path'),
    syscall: stringFieldOf(error, 'syscall'),
    cause: error,
  })

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { Schema } = await import('effect')

  const KNOWN_CODES = [
    'EACCES',
    'EBUSY',
    'EEXIST',
    'EISDIR',
    'ELOOP',
    'ENOENT',
    'ENOTDIR',
    'EINVAL',
    'EPERM',
    'ENOTEMPTY',
    'EBADF',
    'EAGAIN',
  ] as const

  it.prop('∀c_KnownErrno_≡TableTag', [Schema.Literals(KNOWN_CODES)], ([code]) => tagOf(code) === REASON_BY_ERRNO[code])

  it.prop(
    '∀c_UnlistedErrno_≡UnknownTag',
    [Schema.Literals(['EDOM', 'EFOO', 'ENOSPC'])],
    ([code]) => tagOf(code) === 'Unknown',
  )

  it.prop('∀c_NonStringField_≡EmptyString', [Schema.String], ([key]) => stringFieldOf({ [key]: 12345 }, key) === '')

  it.prop(
    '∀v_StringField_≡ExtractedValue',
    [Schema.String],
    ([value]) => stringFieldOf({ code: value }, 'code') === value,
  )
}
