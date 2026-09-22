import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

const seeded = MemoryFileSystem.make({ '/seed/hello.txt': 'hello' })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const filesystem = Effect.service(FileSystem.FileSystem)

Feature('Reading and writing files through the platform port')
  .withScenarioLayer(seeded.layer)
  .body(({ scenario }) => {
    scenario(
      'A file written through the port is readable through the port',
      Gherkin.Do.pipe(
        Given('a filesystem seeded with one file')('fs', () => filesystem),
        When('a new file is written')(
          'written',
          (s) => Effect.flatMap(s.fs.writeFile('/written.txt', encode('written')), () => s.fs.readFile('/written.txt')),
        ),
        Then('the bytes read back are the bytes written')((s) => {
          expect(decode(s.written)).toBe('written')
        }),
      ),
    )

    scenario(
      'Seeded contents are present before anything is written',
      Gherkin.Do.pipe(
        Given('a filesystem seeded with one file')('fs', () => filesystem),
        When('the seeded path is read')('read', (s) => s.fs.readFile('/seed/hello.txt')),
        Then('the seeded contents are returned')((s) => {
          expect(decode(s.read)).toBe('hello')
        }),
      ),
    )

    scenario(
      'Reading an absent path refuses as not found',
      Gherkin.Do.pipe(
        Given('a filesystem with no such path')('fs', () => filesystem),
        When('the absent path is read')('failure', (s) => Effect.flip(s.fs.readFile('/absent.txt'))),
        Then('the refusal names the missing file and the operation')((s) => {
          expect(s.failure.reason._tag).toBe('NotFound')
          expect(s.failure.reason.method).toBe('readFile')
        }),
      ),
    )

    scenario(
      'Creating a nested directory without recursion refuses',
      Gherkin.Do.pipe(
        Given('a filesystem without the parent directory')('fs', () => filesystem),
        When('a nested directory is requested without recursion')(
          'failure',
          (s) => Effect.flip(s.fs.makeDirectory('/missing/child')),
        ),
        Then('the refusal names the missing parent')((s) => {
          expect(s.failure.reason._tag).toBe('NotFound')
        }),
      ),
    )

    scenario(
      'Creating a nested directory recursively succeeds',
      Gherkin.Do.pipe(
        Given('a filesystem without the parent directory')('fs', () => filesystem),
        When('a nested directory is requested recursively')(
          'info',
          (s) => Effect.flatMap(s.fs.makeDirectory('/deep/child', { recursive: true }), () => s.fs.stat('/deep/child')),
        ),
        Then('the directory exists')((s) => {
          expect(s.info.type).toBe('Directory')
        }),
      ),
    )

    scenario(
      'Directory listings name their entries',
      Gherkin.Do.pipe(
        Given('a filesystem seeded with one file')('fs', () => filesystem),
        When('the seeded directory is listed')('entries', (s) => s.fs.readDirectory('/seed')),
        Then('the listing names the seeded file')((s) => {
          expect(s.entries).toEqual(['hello.txt'])
        }),
      ),
    )
  })
