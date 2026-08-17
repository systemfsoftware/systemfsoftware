import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { HybridFileSystem } from '../src/project/hybrid-file-system.js'

const Feature = makeFeature({ it, layer })

const freshFs = (): HybridFileSystem => new HybridFileSystem()

const withWrittenFile = (fileName: string, content: string): HybridFileSystem => {
  const fs = freshFs()
  fs.writeFile(fileName, content)
  return fs
}

const withAdjustedTsconfig = (): HybridFileSystem => {
  const fs = freshFs()
  fs.tsConfigOverrides.set('/project/tsconfig.json', '{"compilerOptions":{}}')
  return fs
}

const withOriginalSource = (): HybridFileSystem =>
  withWrittenFile('add.js', 'function add(a: number, b: number) { return a + b; }')

const mutationAt = (line: number, column: number, length: number): Pick<Mutant, 'location' | 'replacement'> => ({
  location: {
    start: { line, column },
    end: { line, column: column + length },
  },
  replacement: 'a - b',
})

Feature('The hybrid file system backing the compiler')
  .body(({ scenario }) => {
    scenario(
      'Should_CreateFile_When_WritingANewName',
      Gherkin.Do.pipe(
        Given('a fresh file system')('fs', () => Effect.succeed(freshFs())),
        When('a file is written')('file', (s) =>
          Effect.sync(() => {
            s.fs.writeFile('add.js', 'a + b')
            return s.fs.getFile('add.js')
          })),
        Then('the written content is readable back')((s) => {
          const file = s.file
          if (file === undefined) {
            throw new Error('expected the file to exist')
          }
          expect(file.content).toBe('a + b')
          expect(file.fileName).toBe('add.js')
        }),
      ),
    )

    scenario(
      'Should_OverrideFile_When_WritingExistingName',
      Gherkin.Do.pipe(
        Given('a file system')('fs', () => Effect.succeed(freshFs())),
        When('a name is written twice with different content')('file', (s) =>
          Effect.sync(() => {
            s.fs.writeFile('add.js', 'a + b')
            s.fs.writeFile('add.js', 'a - b')
            return s.fs.getFile('add.js')
          })),
        Then('the latest content wins')((s) => {
          const file = s.file
          if (file === undefined) {
            throw new Error('expected the file to exist')
          }
          expect(file.content).toBe('a - b')
        }),
      ),
    )

    scenario(
      'Should_NormalizePath_When_WritingBackSlashNames',
      Gherkin.Do.pipe(
        Given('a file system')('fs', () => Effect.succeed(freshFs())),
        When('a backslash path is written')('file', (s) =>
          Effect.sync(() => {
            s.fs.writeFile('test\\foo\\a.js', 'a')
            return s.fs.getFile('test/foo/a.js')
          })),
        Then('the forward-slash spelling finds it')((s) => {
          const file = s.file
          if (file === undefined) {
            throw new Error('expected the normalized file to exist')
          }
          expect(file.content).toBe('a')
        }),
      ),
    )

    scenario(
      'Should_ReadInMemoryContent_When_FileWasWritten',
      Gherkin.Do.pipe(
        Given('a file system with a written file')('fs', () => Effect.succeed(withWrittenFile('foo.js', 'in-memory'))),
        When('that file is read')('content', (s) => Effect.sync(() => s.fs.readFile('foo.js'))),
        Then('the in-memory content is returned')((s) => {
          expect(s.content).toBe('in-memory')
        }),
      ),
    )

    scenario(
      'Should_ReturnUndefined_When_FileIsNotTracked',
      Gherkin.Do.pipe(
        Given('a file system')('fs', () => Effect.succeed(freshFs())),
        When('an untracked file is read')(
          'content',
          (s) => Effect.sync(() => s.fs.readFile('some-file-that-is-not-tracked.js')),
        ),
        Then('undefined is returned to let disk answer')((s) => {
          expect(s.content).toBeUndefined()
        }),
      ),
    )

    scenario(
      'Should_HideBuildInfoFiles_When_Reading',
      Gherkin.Do.pipe(
        Given('a file system')('fs', () => Effect.succeed(freshFs())),
        When('a .tsbuildinfo file is read')('content', (s) => Effect.sync(() => s.fs.readFile('cache.tsbuildinfo'))),
        Then('null is returned so the compiler treats it as absent')((s) => {
          expect(s.content).toBeNull()
        }),
      ),
    )

    scenario(
      'Should_ReturnOverride_When_TsConfigWasAdjusted',
      Gherkin.Do.pipe(
        Given('a file system with an adjusted tsconfig')('fs', () => Effect.succeed(withAdjustedTsconfig())),
        When('that tsconfig is read')('content', (s) => Effect.sync(() => s.fs.readFile('/project/tsconfig.json'))),
        Then('the adjusted content is returned')((s) => {
          expect(s.content).toBe('{"compilerOptions":{}}')
        }),
      ),
    )

    scenario(
      'Should_Exist_When_FileIsInMemory',
      Gherkin.Do.pipe(
        Given('a file system with an in-memory file')('fs', () => Effect.succeed(withWrittenFile('foo.js', ''))),
        When('existence is asked')('exists', (s) => Effect.sync(() => s.fs.fileExists('foo.js'))),
        Then('the file exists')((s) => {
          expect(s.exists).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_ReportMissing_When_FileIsBuildInfo',
      Gherkin.Do.pipe(
        Given('a file system')('fs', () => Effect.succeed(freshFs())),
        When('existence of a buildinfo file is asked')(
          'exists',
          (s) => Effect.sync(() => s.fs.fileExists('cache.tsbuildinfo')),
        ),
        Then('the buildinfo file does not exist')((s) => {
          expect(s.exists).toBe(false)
        }),
      ),
    )

    scenario(
      'Should_BeUnknown_When_FileWasNeverSeen',
      Gherkin.Do.pipe(
        Given('a file system')('fs', () => Effect.succeed(freshFs())),
        When('existence of an unknown file is asked')(
          'exists',
          (s) => Effect.sync(() => s.fs.fileExists('unknown.js')),
        ),
        Then('undefined lets the disk decide')((s) => {
          expect(s.exists).toBeUndefined()
        }),
      ),
    )

    scenario(
      'Should_MutateAndReset_When_Asked',
      Gherkin.Do.pipe(
        Given('a file system holding the original source')('fs', () => Effect.succeed(withOriginalSource())),
        When('a mutation is applied and then reset')('contents', (s) =>
          Effect.sync(() => {
            s.fs.mutateFile('add.js', mutationAt(0, 42, 7))
            const mutated = s.fs.readFile('add.js')
            s.fs.resetFile('add.js')
            const restored = s.fs.readFile('add.js')
            return { mutated, restored }
          })),
        Then('the mutation is visible before the reset and gone after')((s) => {
          expect(s.contents.mutated).toContain('a - b')
          expect(s.contents.restored).toContain('a + b')
        }),
      ),
    )

    scenario(
      'Should_BeInMemory_When_FileWasWritten',
      Gherkin.Do.pipe(
        Given('a file system with a written file')('fs', () => Effect.succeed(withWrittenFile('test-file', ''))),
        When('membership in memory is asked')('inMemory', (s) => Effect.sync(() => s.fs.existsInMemory('test-file'))),
        Then('the file is held in memory')((s) => {
          expect(s.inMemory).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_NotBeInMemory_When_FileWasNeverWritten',
      Gherkin.Do.pipe(
        Given('a file system')('fs', () => Effect.succeed(freshFs())),
        When('membership in memory is asked')('inMemory', (s) => Effect.sync(() => s.fs.existsInMemory('test-file'))),
        Then('the file is not held in memory')((s) => {
          expect(s.inMemory).toBe(false)
        }),
      ),
    )
  })
