/**
 * Reuse registry tests (R14) — the on-disk `reuse/<hash>.json` record:
 * atomic write, read outcomes (missing/corrupt/found), best-effort
 * removal. Real tmp dirs, no services.
 */
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { readRegistry, removeRegistry, reusePath, type ReuseRegistryEntry, writeRegistryAtomic } from '../registry.js'

const freshDir = (): Promise<string> => fsp.mkdtemp(path.join(os.tmpdir(), 'rightsize-reuse-registry-'))

const entry = (overrides: Partial<ReuseRegistryEntry> = {}): ReuseRegistryEntry => ({
  name: 'rz-reuse-abcdef123456',
  image: 'redis:8.6-alpine',
  ports: { 6379: 41173 },
  createdIso: '2026-01-01T00:00:00.000Z',
  backend: 'docker',
  ...overrides,
})

describe('reuse registry read outcomes', () => {
  it('Should_ReadMissing_When_TheHashHasNoEntry', () =>
    freshDir().then((dir) =>
      Effect.runPromise(readRegistry(dir, 'deadbeef')).then((outcome) => {
        expect(outcome.kind).toBe('missing')
      })
    ))

  it('Should_ReadFound_When_TheEntryWasWellFormed', () =>
    freshDir().then((dir) =>
      Effect.runPromise(writeRegistryAtomic(dir, 'abc', entry())).then(() =>
        Effect.runPromise(readRegistry(dir, 'abc')).then((outcome) => {
          expect(outcome).toEqual({ kind: 'found', entry: entry() })
        })
      )
    ))

  it('Should_ReadCorrupt_When_JsonIsMalformed', () =>
    freshDir().then((dir) =>
      fsp.mkdir(path.join(dir, 'reuse'), { recursive: true }).then(() =>
        fsp.writeFile(reusePath(dir, 'broken'), '{not json').then(() =>
          Effect.runPromise(readRegistry(dir, 'broken')).then((outcome) => {
            expect(outcome.kind).toBe('corrupt')
          })
        )
      )
    ))

  it('Should_ReadCorrupt_When_TheEntryIsNotWellShaped', () =>
    freshDir().then((dir) =>
      Effect.runPromise(
        writeRegistryAtomic(
          dir,
          'odd',
          { name: 42, image: 'redis', ports: {}, createdIso: 'x', backend: 'docker' } as unknown as ReuseRegistryEntry,
        ),
      ).then(() =>
        Effect.runPromise(readRegistry(dir, 'odd')).then((outcome) => {
          expect(outcome.kind).toBe('corrupt')
        })
      )
    ))
})

describe('reuse registry removal', () => {
  it('Should_RemoveTheEntry_When_TheEntryExists', () =>
    freshDir().then((dir) =>
      Effect.runPromise(writeRegistryAtomic(dir, 'abc', entry())).then(() =>
        Effect.runPromise(removeRegistry(dir, 'abc')).then(() =>
          Effect.runPromise(readRegistry(dir, 'abc')).then((outcome) => {
            expect(outcome.kind).toBe('missing')
          })
        )
      )
    ))

  it('Should_NoOp_When_TheEntryNeverExisted', () =>
    freshDir().then((dir) =>
      Effect.runPromise(removeRegistry(dir, 'never')).then(() =>
        Effect.runPromise(readRegistry(dir, 'never')).then((outcome) => {
          expect(outcome.kind).toBe('missing')
        })
      )
    ))
})
