import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { PlatformError } from 'effect/PlatformError'
import * as Schema from 'effect/Schema'

import { ErrnoCause, type ErrnoCause as Errno } from './errno-cause.schema.js'

const pathOrEmpty = (value: string | undefined): string => value ?? ''

const hostRendersUndefined = (value: string | undefined): string => value ?? 'undefined'

const wrapperFor = (errno: Errno): Option.Option<string> =>
  Match.value(errno).pipe(
    Match.tag(
      'FileDoesNotExist',
      (raised) => Option.some(`File does not exist: ${pathOrEmpty(raised.path)}`),
    ),
    Match.tag(
      'FolderDoesNotExist',
      (raised) => Option.some(`Folder does not exist: ${pathOrEmpty(raised.path)}`),
    ),
    Match.tag(
      'FileOrFolderAlreadyExists',
      (raised) => Option.some(`File or folder already exists: ${hostRendersUndefined(raised.dest)}`),
    ),
    Match.tag(
      'FileOrFolderCouldNotBeDeleted',
      (raised) => Option.some(`File or folder could not be deleted: ${pathOrEmpty(raised.path)}`),
    ),
    Match.tag(
      'TargetIsAFolderNotAFile',
      (raised) => Option.some(`Target is a folder, not a file: ${pathOrEmpty(raised.path)}`),
    ),
    Match.tag('UnrecognizedErrno', () => Option.none()),
    Match.exhaustive,
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
