/**
 * Checkpoint archive kernel tests (R14) — the pinned `checkpoint.json`
 * manifest parser's rejection matrix and the tar container argv shapes.
 * Pure: no fs, no services.
 */
import { Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import { MalformedCheckpointArchiveError } from '../../model/errors.js'
import { CHECKPOINT_ARCHIVE_VERSION, parseCheckpointArchiveMetadata } from '../archive.js'
import { TarCli, tarDirArg } from '../tar.js'

const validManifest = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  rightsizeArchive: CHECKPOINT_ARCHIVE_VERSION,
  name: 'seeded-db',
  ref: 'rightsize/checkpoint:seeded-db',
  backend: 'docker',
  createdIso: '2026-01-01T00:00:00.000Z',
  spec: { env: { A: '1' }, command: ['sleep', '60'], exposedPorts: [80], memoryLimitMb: 256 },
  ...overrides,
})

const parseOf = (text: string) => parseCheckpointArchiveMetadata(text, '/archives/x.tar')

const failureOf = (parsed: ReturnType<typeof parseOf>): MalformedCheckpointArchiveError =>
  Option.getOrThrow(Result.getFailure(parsed))

describe('parseCheckpointArchiveMetadata — the pinned manifest', () => {
  it('Should_Parse_When_TheManifestIsWellFormed', () => {
    const parsed = Result.getOrThrow(parseOf(JSON.stringify(validManifest())))
    expect(parsed.rightsizeArchive).toBe(1)
    expect(parsed.name).toBe('seeded-db')
    expect(parsed.spec.exposedPorts).toEqual([80])
  })

  it('Should_AcceptNameNull_When_TheCheckpointWasEphemeral', () => {
    const parsed = parseOf(JSON.stringify(validManifest({ name: null })))
    expect(Result.isSuccess(parsed)).toBe(true)
  })

  it('Should_Reject_When_TheJsonIsMalformed', () => {
    const parsed = parseOf('{not json')
    expect(Result.isFailure(parsed)).toBe(true)
    expect(failureOf(parsed)).toBeInstanceOf(MalformedCheckpointArchiveError)
  })

  it('Should_Reject_When_TheArchiveVersionIsUnsupported', () => {
    const parsed = parseOf(JSON.stringify(validManifest({ rightsizeArchive: 2 })))
    expect(Result.isFailure(parsed)).toBe(true)
    expect(failureOf(parsed)).toBeInstanceOf(MalformedCheckpointArchiveError)
  })

  it('Should_Reject_When_TheNameIsNeitherStringNorNull', () => {
    const parsed = parseOf(JSON.stringify(validManifest({ name: 42 })))
    expect(Result.isFailure(parsed)).toBe(true)
    expect(failureOf(parsed)).toBeInstanceOf(MalformedCheckpointArchiveError)
  })

  it('Should_Reject_When_TheRefFieldIsMissing', () => {
    const manifest = validManifest()
    delete manifest['ref']
    const parsed = parseOf(JSON.stringify(manifest))
    expect(Result.isFailure(parsed)).toBe(true)
    expect(failureOf(parsed)).toBeInstanceOf(MalformedCheckpointArchiveError)
  })

  it('Should_Reject_When_TheSpecProjectionIsMalformed', () => {
    const parsed = parseOf(JSON.stringify(validManifest({ spec: { env: { A: 1 } } })))
    expect(Result.isFailure(parsed)).toBe(true)
    expect(failureOf(parsed)).toBeInstanceOf(MalformedCheckpointArchiveError)
  })
})

describe('TarCli — the archive container argv', () => {
  it('Should_BuildTheCreateArgv_When_TheMembersAreStaged', () => {
    expect(TarCli.create('out.tar', '/tmp/work', ['checkpoint.json', 'artifact'])).toEqual([
      '-cf',
      'out.tar',
      '-C',
      '/tmp/work',
      'checkpoint.json',
      'artifact',
    ])
  })

  it('Should_BuildTheExtractArgv_When_TheArchiveIsRead', () => {
    expect(TarCli.extract('in.tar', '/tmp/dest')).toEqual(['-xf', 'in.tar', '-C', '/tmp/dest'])
  })

  it('Should_ForwardSlashTheDirArg_When_ThePlatformIsWindows', () => {
    expect(tarDirArg('C:\\Users\\me\\work', 'win32')).toBe('C:/Users/me/work')
    expect(tarDirArg('/tmp/work', 'linux')).toBe('/tmp/work')
  })
})
