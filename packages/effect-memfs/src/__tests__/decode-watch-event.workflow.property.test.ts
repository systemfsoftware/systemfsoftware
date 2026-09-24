import { it } from '@systemfsoftware/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  decodeWatchEvent,
  DriverWatchEvent,
  DriverWatchEventType,
  WatchCreate,
  type WatchEventDecision,
  WatchRemove,
  WatchUpdate,
} from '../decode-watch-event.workflow.js'

const decide = (eventType: 'rename' | 'change', filename: string, exists: boolean) =>
  decodeWatchEvent(new DriverWatchEvent({ eventType, filename, exists }))

const tagOf = (decision: WatchEventDecision): string =>
  Match.value(decision).pipe(
    Match.tag('WatchCreate', () => 'WatchCreate'),
    Match.tag('WatchUpdate', () => 'WatchUpdate'),
    Match.tag('WatchRemove', () => 'WatchRemove'),
    Match.exhaustive,
  )

const expectedTagOf = (eventType: 'rename' | 'change', exists: boolean): string =>
  eventType === 'change' ? 'WatchUpdate' : exists ? 'WatchCreate' : 'WatchRemove'

it.prop(
  '∀e_WatchEvent_≡TableDispatch',
  { of: [DriverWatchEventType, Schema.String, Schema.Boolean], subject: decide },
  (subject, [eventType, filename, exists]) => {
    const decision = subject(eventType, filename, exists).pipe(Result.getOrThrow)
    return tagOf(decision) === expectedTagOf(eventType, exists) && decision.path === filename
  },
)

it.prop(
  '∀e_WatchCreate_≡RenameExisting',
  { of: [Schema.String], subject: (filename: string) => decide('rename', filename, true) },
  (subject, [filename]) => {
    const decision = subject(filename).pipe(Result.getOrThrow)
    return Schema.is(WatchCreate)(decision) && decision.path === filename
  },
)

it.prop(
  '∀e_WatchRemove_≡RenameNonExisting',
  { of: [Schema.String], subject: (filename: string) => decide('rename', filename, false) },
  (subject, [filename]) => {
    const decision = subject(filename).pipe(Result.getOrThrow)
    return Schema.is(WatchRemove)(decision) && decision.path === filename
  },
)

it.prop(
  '∀e_WatchUpdate_≡ChangeAnyState',
  {
    of: [Schema.String, Schema.Boolean],
    subject: (filename: string, exists: boolean) => decide('change', filename, exists),
  },
  (subject, [filename, exists]) => {
    const decision = subject(filename, exists).pipe(Result.getOrThrow)
    return Schema.is(WatchUpdate)(decision) && decision.path === filename
  },
)
