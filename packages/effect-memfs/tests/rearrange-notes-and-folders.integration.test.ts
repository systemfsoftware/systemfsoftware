import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Option } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as Error from 'effect/PlatformError'

const Feature = makeFeature({ it })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

const hello = '/notes/hello.txt'

type Look = (fs: FileSystem.FileSystem) => Effect.Effect<string, Error.PlatformError>

const textOf = (path: string): Look => (fs) => Effect.map(fs.readFile(path), decode)

const modeOf = (path: string): Look => (fs) => Effect.map(fs.stat(path), (info) => (info.mode & 0o777).toString(8))

const kindOf = (path: string): Look => (fs) => Effect.map(fs.stat(path), (info) => info.type)

const ownerOf = (path: string): Look => (fs) =>
  Effect.map(fs.stat(path), (info) => `${Option.getOrElse(info.uid, () => 0)}:${Option.getOrElse(info.gid, () => 0)}`)

const modifiedAt = (path: string): Look => (fs) =>
  Effect.map(fs.stat(path), (info) => String(Option.getOrElse(Option.map(info.mtime, (at) => at.getTime()), () => 0)))

const listingOf = (entries: ReadonlyArray<string>): string => entries.toSorted().join(',')

type Change = {
  readonly change: string
  readonly attempt: (fs: FileSystem.FileSystem) => Effect.Effect<void, Error.PlatformError>
  readonly look: Look
  readonly seen: string
}

const noteChanges: ReadonlyArray<Change> = [
  {
    change: 'moved to a new name',
    attempt: (fs) => fs.rename(hello, '/notes/greeting.txt'),
    look: textOf('/notes/greeting.txt'),
    seen: 'hello',
  },
  {
    change: 'duplicated',
    attempt: (fs) => fs.copyFile(hello, '/notes/copy.txt'),
    look: textOf('/notes/copy.txt'),
    seen: 'hello',
  },
  {
    change: 'copied',
    attempt: (fs) => fs.copy(hello, '/notes/copy.txt'),
    look: textOf('/notes/copy.txt'),
    seen: 'hello',
  },
  {
    change: 'copied over an older copy while keeping its times',
    attempt: (fs) =>
      Effect.andThen(
        fs.writeFile('/notes/copy.txt', encode('stale')),
        fs.copy(hello, '/notes/copy.txt', { overwrite: true, preserveTimestamps: true }),
      ),
    look: textOf('/notes/copy.txt'),
    seen: 'hello',
  },
  {
    change: 'given a second name',
    attempt: (fs) => fs.link(hello, '/notes/alias.txt'),
    look: textOf('/notes/alias.txt'),
    seen: 'hello',
  },
  {
    change: 'given a shortcut',
    attempt: (fs) => fs.symlink(hello, '/notes/shortcut.txt'),
    look: (fs) => fs.readLink('/notes/shortcut.txt'),
    seen: hello,
  },
  {
    change: 'reached through a shortcut',
    attempt: (fs) => fs.symlink(hello, '/notes/shortcut.txt'),
    look: (fs) => fs.realPath('/notes/shortcut.txt'),
    seen: hello,
  },
  {
    change: 'rewritten',
    attempt: (fs) => fs.writeFile(hello, encode('bye')),
    look: textOf(hello),
    seen: 'bye',
  },
  {
    change: 'extended at its end',
    attempt: (fs) => fs.writeFile(hello, encode(' world'), { flag: 'a' }),
    look: textOf(hello),
    seen: 'hello world',
  },
  {
    change: 'saved anew as private',
    attempt: (fs) => fs.writeFile('/notes/secret.txt', encode('psst'), { mode: 0o600 }),
    look: modeOf('/notes/secret.txt'),
    seen: '600',
  },
  {
    change: 'started anew as private by adding to its end',
    attempt: (fs) => fs.writeFile('/notes/secret.txt', encode('psst'), { flag: 'a', mode: 0o600 }),
    look: modeOf('/notes/secret.txt'),
    seen: '600',
  },
  {
    change: 'shortened to two letters',
    attempt: (fs) => fs.truncate(hello, 2),
    look: textOf(hello),
    seen: 'he',
  },
  {
    change: 'emptied',
    attempt: (fs) => fs.truncate(hello),
    look: textOf(hello),
    seen: '',
  },
  {
    change: 'locked to its owner',
    attempt: (fs) => fs.chmod(hello, 0o600),
    look: modeOf(hello),
    seen: '600',
  },
  {
    change: 'handed to a new owner',
    attempt: (fs) => fs.chown(hello, 1234, 4321),
    look: ownerOf(hello),
    seen: '1234:4321',
  },
  {
    change: 'restamped',
    attempt: (fs) => fs.utimes(hello, 1, 5),
    look: modifiedAt(hello),
    seen: '5000',
  },
  {
    change: 'deleted',
    attempt: (fs) => fs.remove(hello),
    look: (fs) => Effect.map(fs.readDirectory('/notes'), listingOf),
    seen: '',
  },
  {
    change: 'deleted along with its folder',
    attempt: (fs) => fs.remove('/notes', { recursive: true }),
    look: (fs) => Effect.map(fs.readDirectory('/'), listingOf),
    seen: '',
  },
  {
    change: 'deleted again after it is already gone',
    attempt: (fs) => fs.remove('/notes/missing.txt', { force: true }),
    look: (fs) => Effect.map(fs.readDirectory('/notes'), listingOf),
    seen: 'hello.txt',
  },
]

const folderChanges: ReadonlyArray<Change> = [
  {
    change: 'created',
    attempt: (fs) => fs.makeDirectory('/drafts'),
    look: kindOf('/drafts'),
    seen: 'Directory',
  },
  {
    change: 'created as private',
    attempt: (fs) => fs.makeDirectory('/drafts', { mode: 0o700 }),
    look: modeOf('/drafts'),
    seen: '700',
  },
  {
    change: 'created along with the folders above it',
    attempt: (fs) => fs.makeDirectory('/drafts/2026/may', { recursive: true }),
    look: kindOf('/drafts/2026/may'),
    seen: 'Directory',
  },
  {
    change: 'listed together with everything beneath it',
    attempt: (fs) =>
      Effect.andThen(
        fs.makeDirectory('/notes/archive', { recursive: true }),
        fs.writeFile('/notes/archive/old.txt', encode('old')),
      ),
    look: (fs) => Effect.map(fs.readDirectory('/notes', { recursive: true }), listingOf),
    seen: 'archive,archive/old.txt,hello.txt',
  },
  {
    change: 'searched for notes by pattern',
    attempt: (fs) => fs.writeFile('/notes/todo.md', encode('todo')),
    look: (fs) => Effect.map(fs.glob('*.txt', { root: '/notes' }), listingOf),
    seen: 'hello.txt',
  },
  {
    change: 'searched for everything except its lists',
    attempt: (fs) => fs.writeFile('/notes/todo.md', encode('todo')),
    look: (fs) => Effect.map(fs.glob('*', { root: '/notes', exclude: ['*.md'] }), listingOf),
    seen: 'hello.txt',
  },
  {
    change: 'searched for from the top of the store',
    attempt: (fs) => fs.writeFile('/notes/todo.md', encode('todo')),
    look: (fs) => Effect.map(fs.glob('notes/*.md'), listingOf),
    seen: 'notes/todo.md',
  },
  {
    change: 'searched from the top of the store for everything but its lists',
    attempt: (fs) => fs.writeFile('/notes/todo.md', encode('todo')),
    look: (fs) => Effect.map(fs.glob('notes/*', { exclude: ['**/*.md'] }), listingOf),
    seen: 'notes/hello.txt',
  },
]

Feature('Rearranging notes and folders kept in memory')
  .withScenarioLayer(MemoryFileSystem.make({ [hello]: 'hello' }).layer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A greeting that is <change> shows the change afterwards',
      noteChanges,
      (row) =>
        Gherkin.Do.pipe(
          Given('a notes folder holding a greeting')('fs', () => filesystem),
          When('the greeting is changed')('seen', (s) => Effect.andThen(row.attempt(s.fs), row.look(s.fs))),
          Then('looking again shows the change')((s, expect) => expect(s.seen).toBe(row.seen)),
        ),
    )

    scenarioOutline(
      'A folder that is <change> shows the change afterwards',
      folderChanges,
      (row) =>
        Gherkin.Do.pipe(
          Given('a notes folder holding a greeting')('fs', () => filesystem),
          When('the folders are changed')('seen', (s) => Effect.andThen(row.attempt(s.fs), row.look(s.fs))),
          Then('looking again shows the change')((s, expect) => expect(s.seen).toBe(row.seen)),
        ),
    )
  })
