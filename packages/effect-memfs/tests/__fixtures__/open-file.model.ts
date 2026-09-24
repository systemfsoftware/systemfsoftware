import { Match, Schema } from 'effect'

/** A note of five letters, opened for reading and writing, is the subject. */
export const OpenedNoteText = 'hello'

const Written = Schema.Literals(['a', 'bc', 'def'])
const Size = Schema.Literals([1, 2, 3, 5, 8])
const Offset = Schema.Literals([-1, 0, 1, 2, 3, 5, 8])
const Length = Schema.Literals([0, 1, 3, 5, 9, 13])

export const FileHandleCommand = Schema.Union([
  Schema.TaggedStruct('WriteAll', { text: Written }),
  Schema.TaggedStruct('Write', { text: Written }),
  Schema.TaggedStruct('Read', { size: Size }),
  Schema.TaggedStruct('ReadAlloc', { size: Size }),
  Schema.TaggedStruct('Seek', { offset: Offset }),
  Schema.TaggedStruct('Step', { offset: Offset }),
  Schema.TaggedStruct('Truncate', { length: Length }),
  Schema.TaggedStruct('Sync', {}),
  Schema.TaggedStruct('Where', {}),
])

export type FileHandleCommand = Schema.Schema.Type<typeof FileHandleCommand>

export const FileHandleResponse = Schema.Union([
  Schema.TaggedStruct('Wrote', { count: Schema.Finite }),
  Schema.TaggedStruct('Read', { text: Schema.String }),
  Schema.TaggedStruct('Nothing', {}),
  Schema.TaggedStruct('At', { position: Schema.Finite }),
  Schema.TaggedStruct('Done', {}),
  Schema.TaggedStruct('Refused', { method: Schema.String }),
])

export type FileHandleResponse = Schema.Schema.Type<typeof FileHandleResponse>

export const OpenFileState = Schema.Struct({ text: Schema.String, cursor: Schema.Finite })

export type OpenFileState = Schema.Schema.Type<typeof OpenFileState>

export const initialOpenFileState: OpenFileState = { text: OpenedNoteText, cursor: 0 }

type Step = readonly [OpenFileState, FileHandleResponse]

const stepOf = (state: OpenFileState, response: FileHandleResponse): Step => [state, response]

const wrote = (count: number): FileHandleResponse => ({ _tag: 'Wrote', count })
const read = (text: string): FileHandleResponse => ({ _tag: 'Read', text })
const at = (position: number): FileHandleResponse => ({ _tag: 'At', position })
const done: FileHandleResponse = { _tag: 'Done' }
const nothing: FileHandleResponse = { _tag: 'Nothing' }
const refused = (method: string): FileHandleResponse => ({ _tag: 'Refused', method })

/** A note long enough to reach a position, with the gap a real filesystem writes as zero bytes. */
const roomAt = (text: string, cursor: number): string =>
  cursor <= text.length ? text : text + '\0'.repeat(cursor - text.length)

const writtenInto = (state: OpenFileState, text: string): OpenFileState => {
  const room = roomAt(state.text, state.cursor)
  return {
    text: room.slice(0, state.cursor) + text + room.slice(state.cursor + text.length),
    cursor: state.cursor + text.length,
  }
}

const sizedTo = (text: string, length: number): string =>
  length <= text.length ? text.slice(0, length) : text + '\0'.repeat(length - text.length)

const readFrom = (state: OpenFileState, size: number): Step => {
  const count = Math.min(size, Math.max(state.text.length - state.cursor, 0))
  return stepOf(
    { text: state.text, cursor: state.cursor + count },
    read(state.text.slice(state.cursor, state.cursor + count)),
  )
}

const readAllFrom = (state: OpenFileState, size: number): Step =>
  state.cursor >= state.text.length ? stepOf(state, nothing) : readFrom(state, size)

const movedTo = (state: OpenFileState, position: number): Step =>
  position < 0 ? stepOf(state, refused('seek')) : stepOf({ text: state.text, cursor: position }, at(position))

const stepped = (state: OpenFileState, command: FileHandleCommand): Step =>
  Match.value(command).pipe(
    Match.tag('WriteAll', (write) => stepOf(writtenInto(state, write.text), wrote(write.text.length))),
    Match.tag('Write', (write) => stepOf(writtenInto(state, write.text), wrote(write.text.length))),
    Match.tag('Read', (slice) => readFrom(state, slice.size)),
    Match.tag('ReadAlloc', (slice) => readAllFrom(state, slice.size)),
    Match.tag('Seek', (seek) => movedTo(state, seek.offset)),
    Match.tag('Step', (step) => movedTo(state, state.cursor + step.offset)),
    Match.tag('Truncate', (cut) =>
      stepOf({ text: sizedTo(state.text, cut.length), cursor: Math.min(state.cursor, cut.length) }, done)),
    Match.tag('Sync', () =>
      stepOf(state, done)),
    Match.tag('Where', () => stepOf(state, at(state.cursor))),
    Match.exhaustive,
  )

export const openFileModel = {
  state: OpenFileState,
  initial: initialOpenFileState,
  precondition: (_state: OpenFileState, _command: FileHandleCommand): boolean => true,
  step: stepped,
}
