import { expect } from '@effect/vitest'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as Error from 'effect/PlatformError'

const Feature = makeFeature({ it })

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const filesystem = Effect.service(FileSystem.FileSystem)

const missing = '/notes/missing.txt'

type Refusal = {
  readonly request: string
  readonly outcome: string
  readonly reason: Error.SystemErrorTag
  readonly method: string
  readonly attempt: (fs: FileSystem.FileSystem) => Effect.Effect<void, Error.PlatformError>
}

const refusals: ReadonlyArray<Refusal> = [
  {
    request: 'check that a missing note exists',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'access',
    attempt: (fs) => fs.access(missing),
  },
  {
    request: 'change who may open a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'chmod',
    attempt: (fs) => fs.chmod(missing, 0o600),
  },
  {
    request: 'hand a missing note to a new owner',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'chown',
    attempt: (fs) => fs.chown(missing, 1, 1),
  },
  {
    request: 'copy a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'copy',
    attempt: (fs) => fs.copy(missing, '/notes/copy.txt'),
  },
  {
    request: 'duplicate a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'copyFile',
    attempt: (fs) => fs.copyFile(missing, '/notes/copy.txt'),
  },
  {
    request: 'give a missing note a second name',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'link',
    attempt: (fs) => fs.link(missing, '/notes/alias.txt'),
  },
  {
    request: 'follow a shortcut that was never made',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'readLink',
    attempt: (fs) => Effect.asVoid(fs.readLink(missing)),
  },
  {
    request: 'find the full location of a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'realPath',
    attempt: (fs) => Effect.asVoid(fs.realPath(missing)),
  },
  {
    request: 'move a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'rename',
    attempt: (fs) => fs.rename(missing, '/notes/moved.txt'),
  },
  {
    request: 'place a shortcut inside a missing folder',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'symlink',
    attempt: (fs) => fs.symlink('/notes/hello.txt', '/drafts/shortcut.txt'),
  },
  {
    request: 'shorten a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'truncate',
    attempt: (fs) => fs.truncate(missing, 1),
  },
  {
    request: 'restamp a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'utimes',
    attempt: (fs) => fs.utimes(missing, 1, 1),
  },
  {
    request: 'save a note into a missing folder',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'writeFile',
    attempt: (fs) => fs.writeFile('/drafts/note.txt', encode('draft')),
  },
  {
    request: 'list a missing folder',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'readDirectory',
    attempt: (fs) => Effect.asVoid(fs.readDirectory('/drafts')),
  },
  {
    request: 'look up a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'stat',
    attempt: (fs) => Effect.asVoid(fs.stat(missing)),
  },
  {
    request: 'delete a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'remove',
    attempt: (fs) => fs.remove(missing),
  },
  {
    request: 'open a missing note',
    outcome: 'nothing there',
    reason: 'NotFound',
    method: 'open',
    attempt: (fs) => Effect.scoped(Effect.asVoid(fs.open(missing))),
  },
  {
    request: 'create a folder that already exists',
    outcome: 'already there',
    reason: 'AlreadyExists',
    method: 'makeDirectory',
    attempt: (fs) => fs.makeDirectory('/notes'),
  },
  {
    request: 'follow a note as though it were a shortcut',
    outcome: 'the wrong kind of data',
    reason: 'InvalidData',
    method: 'readLink',
    attempt: (fs) => Effect.asVoid(fs.readLink('/notes/hello.txt')),
  },
  {
    request: 'list a note as though it were a folder',
    outcome: 'the wrong kind of entry',
    reason: 'BadResource',
    method: 'readDirectory',
    attempt: (fs) => Effect.asVoid(fs.readDirectory('/notes/hello.txt')),
  },
  {
    request: 'read a note nobody may read',
    outcome: 'not permitted',
    reason: 'PermissionDenied',
    method: 'access',
    attempt: (fs) => fs.access('/notes/locked.txt', { readable: true }),
  },
  {
    request: 'write to a note nobody may write',
    outcome: 'not permitted',
    reason: 'PermissionDenied',
    method: 'access',
    attempt: (fs) => fs.access('/notes/locked.txt', { writable: true }),
  },
  {
    request: 'delete a folder that still holds notes',
    outcome: 'an unrecognised problem',
    reason: 'Unknown',
    method: 'remove',
    attempt: (fs) => fs.remove('/notes'),
  },
  {
    request: 'copy a note onto itself',
    outcome: 'an unrecognised problem',
    reason: 'Unknown',
    method: 'copy',
    attempt: (fs) => fs.copy('/notes/hello.txt', '/notes/hello.txt'),
  },
]

Feature('Learning why the filesystem turned a request down')
  .withScenarioLayer(MemoryFileSystem.make({ '/notes/hello.txt': 'hello', '/notes/locked.txt': 'secret' }).layer)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Asking to <request> is turned down as <outcome>',
      refusals,
      (row) =>
        Gherkin.Do.pipe(
          Given('a notes folder holding a greeting and a note nobody may open')('fs', () =>
            Effect.tap(filesystem, (fs) => fs.chmod('/notes/locked.txt', 0o000))),
          When('the request is made')('refusal', (s) =>
            Effect.flip(row.attempt(s.fs))),
          Then('the refusal names what went wrong and which request it was')((s) => {
            expect(s.refusal.reason._tag).toBe(row.reason)
            expect(s.refusal.reason.method).toBe(row.method)
          }),
        ),
    )
  })
