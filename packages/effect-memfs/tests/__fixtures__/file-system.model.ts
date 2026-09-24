import { Match, Schema } from 'effect'

export const StorePath = Schema.Literals(['/a', '/a/b', '/a/b.txt', '/a/b/c.txt', '/d.txt'])
const Text = Schema.Literals(['one', 'two'])

export const FileCommand = Schema.Union([
  Schema.TaggedStruct('WriteFile', { path: StorePath, text: Text }),
  Schema.TaggedStruct('ReadFile', { path: StorePath }),
  Schema.TaggedStruct('MakeDirectory', { path: StorePath, recursive: Schema.Boolean }),
  Schema.TaggedStruct('Remove', { path: StorePath, recursive: Schema.Boolean }),
  Schema.TaggedStruct('MakeReadOnly', { path: StorePath }),
])

export type FileCommand = Schema.Schema.Type<typeof FileCommand>

export const Refusal = Schema.Literals(['NotFound', 'AlreadyExists', 'BadResource', 'PermissionDenied', 'Unknown'])
export type Refusal = Schema.Schema.Type<typeof Refusal>

export type FileResponse =
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Content'; readonly text: string }
  | { readonly _tag: 'Refused'; readonly reason: Refusal }

const Entry = Schema.Struct({
  path: Schema.String,
  kind: Schema.Literals(['file', 'directory']),
  text: Schema.String,
  readOnly: Schema.Boolean,
})
type Entry = Schema.Schema.Type<typeof Entry>

export const StoreState = Schema.Struct({
  entries: Schema.Array(Entry),
  permissionsBypassed: Schema.Boolean,
})
export type StoreState = Schema.Schema.Type<typeof StoreState>

type Step = readonly [StoreState, FileResponse]

const done: FileResponse = { _tag: 'Done' }
const refused = (reason: Refusal): FileResponse => ({ _tag: 'Refused', reason })

const entryAt = (state: StoreState, path: string): Entry | undefined =>
  state.entries.find((entry) => entry.path === path)

const ancestorsOf = (path: string): ReadonlyArray<string> =>
  path.split('/').slice(1, -1).map((_, depth, parts) => `/${parts.slice(0, depth + 1).join('/')}`)

const blockedBy = (entry: Entry | undefined): Refusal | undefined =>
  entry === undefined ? 'NotFound' : entry.kind === 'file' ? 'BadResource' : undefined

const reachRefusal = (state: StoreState, path: string): Refusal | undefined =>
  ancestorsOf(path).map((ancestor) => blockedBy(entryAt(state, ancestor))).find((reason) => reason !== undefined)

const withEntry = (state: StoreState, entry: Entry): StoreState => ({
  ...state,
  entries: [...state.entries.filter((kept) => kept.path !== entry.path), entry].toSorted((left, right) =>
    left.path.localeCompare(right.path)
  ),
})

const withoutTree = (state: StoreState, path: string): StoreState => ({
  ...state,
  entries: state.entries.filter((entry) => entry.path !== path && !entry.path.startsWith(`${path}/`)),
})

const reached = (state: StoreState, path: string, onReached: (entry: Entry | undefined) => Step): Step => {
  const refusal = reachRefusal(state, path)
  return refusal === undefined ? onReached(entryAt(state, path)) : [state, refused(refusal)]
}

const writableFile = (state: StoreState, entry: Entry): boolean => !entry.readOnly || state.permissionsBypassed

const writeOver = (state: StoreState, text: string, entry: Entry): Step =>
  entry.kind === 'directory'
    ? [state, refused('BadResource')]
    : writableFile(state, entry)
    ? [withEntry(state, { ...entry, text }), done]
    : [state, refused('PermissionDenied')]

const writeFile = (state: StoreState, path: string, text: string): Step =>
  reached(state, path, (entry) =>
    entry === undefined
      ? [withEntry(state, { path, kind: 'file', text, readOnly: false }), done]
      : writeOver(state, text, entry))

const readFile = (state: StoreState, path: string): Step =>
  reached(state, path, (entry) =>
    entry === undefined
      ? [state, refused('NotFound')]
      : entry.kind === 'directory'
      ? [state, refused('BadResource')]
      : [state, { _tag: 'Content', text: entry.text }])

const directory = (path: string): Entry => ({ path, kind: 'directory', text: '', readOnly: false })

const madeDirectory = (state: StoreState, path: string): Step =>
  reached(
    state,
    path,
    (entry) => entry === undefined ? [withEntry(state, directory(path)), done] : [state, refused('AlreadyExists')],
  )

const deepestRefusal = (state: StoreState, path: string): Refusal | undefined =>
  [...ancestorsOf(path), path].map((step) => entryAt(state, step)).find((entry) => entry?.kind === 'file') ===
      undefined
    ? undefined
    : entryAt(state, path)?.kind === 'file'
    ? 'AlreadyExists'
    : 'BadResource'

const withDirectories = (state: StoreState, paths: ReadonlyArray<string>): StoreState =>
  paths.reduce((next, path) => (entryAt(next, path) === undefined ? withEntry(next, directory(path)) : next), state)

const madeDirectories = (state: StoreState, path: string): Step => {
  const refusal = deepestRefusal(state, path)
  return refusal === undefined
    ? [withDirectories(state, [...ancestorsOf(path), path]), done]
    : [state, refused(refusal)]
}

const removeEntry = (state: StoreState, path: string, recursive: boolean, entry: Entry): Step =>
  entry.kind === 'directory' && !recursive ? [state, refused('Unknown')] : [withoutTree(state, path), done]

const remove = (state: StoreState, path: string, recursive: boolean): Step =>
  reached(
    state,
    path,
    (entry) => entry === undefined ? [state, refused('NotFound')] : removeEntry(state, path, recursive, entry),
  )

const madeReadOnly = (state: StoreState, path: string): Step =>
  reached(
    state,
    path,
    (entry) =>
      entry === undefined ? [state, refused('NotFound')] : [withEntry(state, { ...entry, readOnly: true }), done],
  )

const stepped = (state: StoreState, command: FileCommand): Step =>
  Match.value(command).pipe(
    Match.tag('WriteFile', (write) => writeFile(state, write.path, write.text)),
    Match.tag('ReadFile', (read) => readFile(state, read.path)),
    Match.tag(
      'MakeDirectory',
      (make) => make.recursive ? madeDirectories(state, make.path) : madeDirectory(state, make.path),
    ),
    Match.tag('Remove', (removal) => remove(state, removal.path, removal.recursive)),
    Match.tag('MakeReadOnly', (lock) => madeReadOnly(state, lock.path)),
    Match.exhaustive,
  )

const mayRun = (state: StoreState, command: FileCommand): boolean =>
  Match.value(command).pipe(
    Match.tag('MakeReadOnly', (lock) => entryAt(state, lock.path)?.kind !== 'directory'),
    Match.orElse(() => true),
  )

/** A store whose caller may or may not bypass read-only permission bits, as a privileged user does. */
export const storeModel = (permissionsBypassed: boolean) => ({
  state: StoreState,
  initial: { entries: [], permissionsBypassed } satisfies StoreState,
  precondition: mayRun,
  step: stepped,
})

export interface ModelRun {
  readonly permissionsBypassed: boolean
  readonly commands: ReadonlyArray<FileCommand>
}

interface ModelWalk {
  readonly state: StoreState
  readonly ran: ReadonlyArray<FileCommand>
  readonly responses: ReadonlyArray<FileResponse>
}

const walked = (walk: ModelWalk, command: FileCommand): ModelWalk => {
  const [state, response] = stepped(walk.state, command)
  return { state, ran: [...walk.ran, command], responses: [...walk.responses, response] }
}

const walkOf = (run: ModelRun): ModelWalk =>
  run.commands.reduce<ModelWalk>(
    (walk, command) => (mayRun(walk.state, command) ? walked(walk, command) : walk),
    { state: storeModel(run.permissionsBypassed).initial, ran: [], responses: [] },
  )

export const modelResponses = (run: ModelRun): ReadonlyArray<FileResponse> => walkOf(run).responses

export const runnableCommands = (run: ModelRun): ReadonlyArray<FileCommand> => walkOf(run).ran
