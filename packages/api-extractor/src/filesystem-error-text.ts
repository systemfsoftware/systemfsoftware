import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { PlatformError } from 'effect/PlatformError'
import * as Schema from 'effect/Schema'

import { ErrnoCause, type ErrnoCause as Errno } from './errno-cause.schema.js'

const pathOrEmpty = (value: string | undefined): string => value ?? ''

const hostRendersUndefined = (value: string | undefined): string => value ?? 'undefined'

const wrapperFor = (errno: Errno): Option.Option<string> =>
  Match.value({ code: errno.code, removesLink: errno.syscall === 'unlink' }).pipe(
    Match.when({ code: 'ENOENT' }, () => Option.some(`File does not exist: ${pathOrEmpty(errno.path)}`)),
    Match.when({ code: 'ENOTDIR' }, () => Option.some(`Folder does not exist: ${pathOrEmpty(errno.path)}`)),
    Match.when(
      { code: 'EEXIST' },
      () => Option.some(`File or folder already exists: ${hostRendersUndefined(errno.dest)}`),
    ),
    Match.when(
      { removesLink: true, code: 'EPERM' },
      () => Option.some(`File or folder could not be deleted: ${pathOrEmpty(errno.path)}`),
    ),
    Match.when({ code: 'EISDIR' }, () => Option.some(`Target is a folder, not a file: ${pathOrEmpty(errno.path)}`)),
    Match.orElse(() => Option.none()),
  )

const errnoOf = (failure: PlatformError): Option.Option<Errno> =>
  Option.flatMap(Option.fromNullishOr(failure.cause), (cause) => Schema.decodeUnknownOption(ErrnoCause)(cause))

const wrappedOnce = (errno: Errno): string =>
  Option.getOrElse(Option.map(wrapperFor(errno), (wrapper) => `${wrapper}\n${errno.message}`), () => errno.message)

const ensureFolderInsideWrappedWrite = (errno: Errno): string =>
  Option.getOrElse(
    Option.map(wrapperFor(errno), (wrapper) => `${wrapper}\n${wrapper}\n${errno.message}`),
    () => errno.message,
  )

export const fileSystemFailureTextOf = (failure: PlatformError): Option.Option<string> =>
  Option.map(errnoOf(failure), wrappedOnce)

export const fileSystemFailureMessageOf = (failure: PlatformError): string =>
  Option.getOrElse(fileSystemFailureTextOf(failure), () => failure.message)

export const ensureDirectoryFailureTextOf = (failure: PlatformError): string =>
  Option.getOrElse(Option.map(errnoOf(failure), ensureFolderInsideWrappedWrite), () => failure.message)
