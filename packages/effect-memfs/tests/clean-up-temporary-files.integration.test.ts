import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Error from 'effect/PlatformError'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

const filesystem = Effect.service(FileSystem.FileSystem)

type Scratch = {
  readonly kind: string
  readonly placement: string
  readonly found: FileSystem.File.Type
  readonly startsWith: string
  readonly endsWith: string
  readonly borrow: (fs: FileSystem.FileSystem) => Effect.Effect<string, Error.PlatformError, Scope.Scope>
}

const scratches: ReadonlyArray<Scratch> = [
  {
    kind: 'file',
    placement: 'wherever the filesystem chooses',
    found: 'File',
    startsWith: '/tmp/.',
    endsWith: '',
    borrow: (fs) => fs.makeTempFileScoped(),
  },
  {
    kind: 'file',
    placement: 'in a chosen folder under a chosen name',
    found: 'File',
    startsWith: '/scratch/.draft-',
    endsWith: '.txt',
    borrow: (fs) => fs.makeTempFileScoped({ directory: '/scratch', prefix: 'draft-', suffix: '.txt' }),
  },
  {
    kind: 'file',
    placement: 'with only a chosen name start',
    found: 'File',
    startsWith: '/tmp/.draft-',
    endsWith: '',
    borrow: (fs) => fs.makeTempFileScoped({ prefix: 'draft-' }),
  },
  {
    kind: 'file',
    placement: 'with only a chosen folder',
    found: 'File',
    startsWith: '/scratch/.',
    endsWith: '',
    borrow: (fs) => fs.makeTempFileScoped({ directory: '/scratch' }),
  },
  {
    kind: 'folder',
    placement: 'wherever the filesystem chooses',
    found: 'Directory',
    startsWith: '/tmp/.',
    endsWith: '',
    borrow: (fs) => fs.makeTempDirectoryScoped(),
  },
  {
    kind: 'folder',
    placement: 'in a chosen folder under a chosen name',
    found: 'Directory',
    startsWith: '/scratch/.draft-',
    endsWith: '',
    borrow: (fs) => fs.makeTempDirectoryScoped({ directory: '/scratch', prefix: 'draft-' }),
  },
  {
    kind: 'folder',
    placement: 'with only a chosen folder',
    found: 'Directory',
    startsWith: '/scratch/.',
    endsWith: '',
    borrow: (fs) => fs.makeTempDirectoryScoped({ directory: '/scratch' }),
  },
]

Feature('Handing back scratch space when the work using it is over')
  .withScenarioLayer(MemoryFileSystem.make({}).layer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A scratch <kind> borrowed <placement> is cleared away once the work that borrowed it is over',
      scratches,
      (row) =>
        Gherkin.Do.pipe(
          Given('a filesystem with no scratch space in use')('fs', () => filesystem),
          When('a piece of work borrows scratch space and then finishes')('outcome', (s) =>
            Effect.gen(function*() {
              const borrowed = yield* Effect.scoped(
                Effect.flatMap(
                  Effect.flatMap(filesystem, row.borrow),
                  (path) => Effect.as(s.fs.stat(path), path),
                ),
              )
              return yield* Effect.flip(s.fs.stat(borrowed))
            })),
          Then('the scratch space it borrowed can no longer be found')((s) => {
            expect(s.outcome.reason._tag).toBe('NotFound')
          }),
        ),
    )

    scenarioOutline(
      'A scratch <kind> borrowed <placement> sits where it was asked for while the work runs',
      scratches,
      (row) =>
        Gherkin.Do.pipe(
          Given('a filesystem with no scratch space in use')('fs', () => filesystem),
          When('a piece of work borrows scratch space and looks at it')('borrowed', (s) =>
            Effect.scoped(
              Effect.flatMap(row.borrow(s.fs), (path) => Effect.map(s.fs.stat(path), (info) => ({ path, info }))),
            )),
          Then('the scratch space is of the kind asked for, in the place asked for')((s) => {
            expect(s.borrowed.info.type).toBe(row.found)
            expect(s.borrowed.path.startsWith(row.startsWith)).toBe(true)
            expect(s.borrowed.path.endsWith(row.endsWith)).toBe(true)
          }),
        ),
    )
  })
