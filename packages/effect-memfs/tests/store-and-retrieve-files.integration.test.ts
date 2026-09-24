import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { expect } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'

const Feature = makeFeature({ it })

const withNotes = MemoryFileSystem.make({ '/notes/hello.txt': 'hello' })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

Feature('Keeping files in memory instead of on disk')
  .withScenarioLayer(withNotes.layer)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A file that was just saved reads back exactly as it was saved',
      Gherkin.Do.pipe(
        Given('a filesystem holding a notes folder')('fs', () => filesystem),
        When('a shopping list is saved and read back')(
          'contents',
          (s) =>
            Effect.flatMap(
              s.fs.writeFile('/notes/list.txt', encode('milk, bread')),
              () => s.fs.readFile('/notes/list.txt'),
            ),
        ),
        Then('the shopping list comes back word for word')((s) => {
          expect(decode(s.contents)).toBe('milk, bread')
        }),
      ),
    )

    scenario(
      'Files handed over when the filesystem is created are available straight away',
      Gherkin.Do.pipe(
        Given('a filesystem holding a notes folder')('fs', () => filesystem),
        When('the note it was created with is read')('contents', (s) => s.fs.readFile('/notes/hello.txt')),
        Then('the note reads as it was handed over')((s) => {
          expect(decode(s.contents)).toBe('hello')
        }),
      ),
    )

    scenario(
      'Listing a folder names the files it holds',
      Gherkin.Do.pipe(
        Given('a filesystem holding a notes folder')('fs', () => filesystem),
        When('the notes folder is listed')('entries', (s) => s.fs.readDirectory('/notes')),
        Then('the listing names the note inside it')((s) => {
          expect(s.entries).toEqual(['hello.txt'])
        }),
      ),
    )

    scenario(
      'Reading a file nobody saved is turned down',
      Gherkin.Do.pipe(
        Given('a filesystem holding a notes folder')('fs', () => filesystem),
        When('a note that was never saved is read')('outcome', (s) => Effect.flip(s.fs.readFile('/notes/absent.txt'))),
        Then('the reader is told the file is missing, and which attempt failed')((s) => {
          expect(s.outcome.reason._tag).toBe('NotFound')
          expect(s.outcome.reason.method).toBe('readFile')
        }),
      ),
    )

    scenarioOutline(
      'Creating a folder inside a missing parent <expectation> when creating parents is <permission>',
      [
        { expectation: 'is turned down', permission: 'refused', parents: false, found: false },
        { expectation: 'succeeds', permission: 'allowed', parents: true, found: true },
      ],
      (row) =>
        Gherkin.Do.pipe(
          Given('a filesystem with no archive folder')('fs', () => filesystem),
          When('a folder is created beneath the archive folder')('found', (s) =>
            Effect.match(
              Effect.flatMap(
                s.fs.makeDirectory('/archive/2026', { recursive: row.parents }),
                () => s.fs.stat('/archive/2026'),
              ),
              { onFailure: () => false, onSuccess: (info) => info.type === 'Directory' },
            )),
          Then('whether the folder now exists matches what was asked for')((s) => {
            expect(s.found).toBe(row.found)
          }),
        ),
    )
  })
