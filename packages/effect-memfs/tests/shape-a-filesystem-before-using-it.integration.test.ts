import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Context, Effect, Layer, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

const held = (resource: MemoryFileSystem.MemoryFileSystemResource) =>
  Effect.flatMap(resource.scoped, (handle) =>
    Effect.map(
      MemoryFileSystem.Definition.context(handle),
      (context) => Context.get(context, FileSystem.FileSystem),
    ))

const laid = (resource: MemoryFileSystem.MemoryFileSystemResource) =>
  Effect.flatMap(Effect.scope, (scope) =>
    Effect.map(
      Layer.buildWithScope(resource.layer, scope),
      (context) => Context.get(context, FileSystem.FileSystem),
    ))

type Shape = {
  readonly shape: string
  readonly obtain: Effect.Effect<FileSystem.FileSystem, never, FileSystem.FileSystem | Scope.Scope>
  readonly path: string
  readonly seen: string
}

const shapes: ReadonlyArray<Shape> = [
  {
    shape: 'handed over as a layer',
    obtain: laid(MemoryFileSystem.make({ '/notes/a.txt': 'from a layer' })),
    path: '/notes/a.txt',
    seen: 'from a layer',
  },
  {
    shape: 'handed over directly',
    obtain: held(MemoryFileSystem.make({ '/notes/a.txt': 'handed over' })),
    path: '/notes/a.txt',
    seen: 'handed over',
  },
  {
    shape: 'given replacement contents',
    obtain: held(
      MemoryFileSystem.make({ '/old.txt': 'old' }).pipe(MemoryFileSystem.withContents({ '/new.txt': 'replaced' })),
    ),
    path: '/new.txt',
    seen: 'replaced',
  },
  {
    shape: 'given a note as raw bytes',
    obtain: held(MemoryFileSystem.make({ '/notes/raw.txt': encode('kept as bytes') })),
    path: '/notes/raw.txt',
    seen: 'kept as bytes',
  },
  {
    shape: 'given raw bytes by a name without a folder',
    obtain: held(MemoryFileSystem.make({ 'raw.txt': encode('at the top') })),
    path: '/raw.txt',
    seen: 'at the top',
  },
  {
    shape: 'rooted at a home folder',
    obtain: held(MemoryFileSystem.make({ 'note.txt': 'at home' }).pipe(MemoryFileSystem.withCwd('/home'))),
    path: '/home/note.txt',
    seen: 'at home',
  },
  {
    shape: 'rooted at a home folder and given raw bytes',
    obtain: held(MemoryFileSystem.make({ 'raw.txt': encode('bytes at home') }).pipe(MemoryFileSystem.withCwd('/home'))),
    path: '/home/raw.txt',
    seen: 'bytes at home',
  },
  {
    shape: 'started empty and then written to',
    obtain: Effect.tap(filesystem, (fs) => Effect.orDie(fs.writeFile('/first.txt', encode('first')))),
    path: '/first.txt',
    seen: 'first',
  },
]

Feature('Shaping an in-memory filesystem before using it')
  .withScenarioLayer(MemoryFileSystem.make({}).layer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A filesystem <shape> holds the notes it was shaped with',
      shapes,
      (row) =>
        Gherkin.Do.pipe(
          Given('a filesystem that was shaped in advance')('fs', () => row.obtain),
          When('a note in it is read')('contents', (s) => Effect.map(s.fs.readFile(row.path), decode)),
          Then('the note reads as it was shaped')((s) => {
            expect(s.contents).toBe(row.seen)
          }),
        ),
    )
  })
