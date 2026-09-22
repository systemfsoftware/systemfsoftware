import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  decodeWatchEvent,
  DriverWatchEvent,
  DriverWatchEventType,
  WatchCreate,
  WatchRemove,
  WatchUpdate,
} from '../decode-watch-event.workflow.js'

const decodedTagOf = (
  eventType: 'rename' | 'change',
  filename: string,
  exists: boolean,
): string => {
  const decision = Result.getOrThrow(
    decodeWatchEvent(new DriverWatchEvent({ eventType, filename, exists })),
  )
  return decision._tag
}

const decodedPathOf = (
  eventType: 'rename' | 'change',
  filename: string,
  exists: boolean,
): string => {
  const decision = Result.getOrThrow(
    decodeWatchEvent(new DriverWatchEvent({ eventType, filename, exists })),
  )
  return decision.path
}

const expectedTagOf = (eventType: 'rename' | 'change', exists: boolean): string =>
  eventType === 'change' ? 'WatchUpdate' : exists ? 'WatchCreate' : 'WatchRemove'

it.prop(
  '∀e_WatchEvent_≡TableDispatch',
  [DriverWatchEventType, Schema.String, Schema.Boolean],
  ([eventType, filename, exists]) =>
    decodedTagOf(eventType, filename, exists) === expectedTagOf(eventType, exists) &&
    decodedPathOf(eventType, filename, exists) === filename,
)

it.prop(
  '∀e_WatchCreate_≡RenameExisting',
  [Schema.String],
  ([filename]) => {
    const decision = Result.getOrThrow(
      decodeWatchEvent(new DriverWatchEvent({ eventType: 'rename', filename, exists: true })),
    )
    return Schema.is(WatchCreate)(decision) && decision.path === filename
  },
)

it.prop(
  '∀e_WatchRemove_≡RenameNonExisting',
  [Schema.String],
  ([filename]) => {
    const decision = Result.getOrThrow(
      decodeWatchEvent(new DriverWatchEvent({ eventType: 'rename', filename, exists: false })),
    )
    return Schema.is(WatchRemove)(decision) && decision.path === filename
  },
)

it.prop(
  '∀e_WatchUpdate_≡ChangeAnyState',
  [Schema.String, Schema.Boolean],
  ([filename, exists]) => {
    const decision = Result.getOrThrow(
      decodeWatchEvent(new DriverWatchEvent({ eventType: 'change', filename, exists })),
    )
    return Schema.is(WatchUpdate)(decision) && decision.path === filename
  },
)
