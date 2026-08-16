/**
 * Output-kernel tests — the pure "what did msb just say?" classification
 * matrix, driven by upstream's recorded verbatim wordings (upstream
 * `backend-msb/*.test.ts`, Apache-2.0) plus the fragment-grammars the
 * kernels deliberately match.
 */
import { describe, expect, it } from 'vitest'

import {
  classifyBootExit,
  confirmDigestDirNamePresent,
  isAgentEndpointNotReady,
  isImageCacheCorruption,
  isMsbInstallLockActive,
  isMsbStateDbError,
  isPortBindConflictOutput,
  isSnapshotAlreadyExistsError,
  isSnapshotNotFoundError,
  lsEntries,
  parseImportedDigestDirName,
  parseSnapshotList,
  runningNames,
  undeliveredLines,
} from '../output.kernel.js'

describe('boot-exit classification (recorded upstream wordings)', () => {
  it('Should_ClassifyImageCacheCorruption_When_CacheErrorNamesMissingLayerFile', () => {
    const output = 'error: image error: cache error at /tmp/.microsandbox/cache/layers/sha256_deadbeef.tar.gz: ' +
      'No such file or directory (os error 2)'
    expect(classifyBootExit(output)).toMatchObject({ _tag: 'image-cache-corruption' })
    expect(isImageCacheCorruption(output)).toBe(true)
  })

  it('Should_ClassifyStateDb_When_OutputCarriesDatabaseErrorPrefix', () => {
    const output = 'error: database error: Execution Error: error returned from database: ' +
      '(code: 1) index idx_manifest_layers_unique already exists'
    expect(classifyBootExit(output)).toMatchObject({ _tag: 'state-db' })
    expect(isMsbStateDbError(output)).toBe(true)
  })

  it('Should_ClassifyInstallLock_When_OutputCarriesEitherObservedPhrasing', () => {
    expect(
      classifyBootExit(
        'error: runtime error: microsandbox install operation is in progress until 2026-07-31 20:55:04.779845600; retry after it completes',
      ),
    ).toMatchObject({ _tag: 'install-lock' })
    expect(
      classifyBootExit(
        'error: runtime error: another microsandbox install operation is in progress until 2026-08-01 19:26:19.025098100',
      ),
    ).toMatchObject({ _tag: 'install-lock' })
    expect(isMsbInstallLockActive('install operation in progress until tomorrow')).toBe(true)
  })

  it('Should_ClassifyPortBindConflict_When_OutputNamesAnInUsePort', () => {
    expect(classifyBootExit('error: port is already allocated')).toMatchObject({ _tag: 'port-bind-conflict' })
    expect(classifyBootExit('bind: address already in use')).toMatchObject({ _tag: 'port-bind-conflict' })
    expect(isPortBindConflictOutput('port 8080 already in use')).toBe(true)
  })

  it('Should_ClassifyUnknown_When_NoStablePhraseMatches', () => {
    expect(classifyBootExit('panic: something else entirely')).toMatchObject({ _tag: 'unknown' })
    expect(classifyBootExit('')).toMatchObject({ _tag: 'unknown' })
  })

  it('Should_ClassifyImageCacheFirst_When_OutputCarriesBothCacheAndDatabaseSignals', () => {
    const both = 'error: database error: X\nerror: cache error at /tmp/a: No such file'
    expect(classifyBootExit(both)).toMatchObject({ _tag: 'image-cache-corruption' })
  })
})

describe('exec + snapshot wording', () => {
  it('Should_RetryExec_When_StderrIsAgentClientConnectError', () => {
    expect(
      isAgentEndpointNotReady(
        'error: agent client error: connect \\\\.\\pipe\\msb-agent-x: The system cannot find the file specified. (os error 2)',
      ),
    ).toBe(true)
    expect(isAgentEndpointNotReady('error: agent client error: rpc failure inside the established session')).toBe(false)
  })

  it('Should_ResolveFalse_When_ProbeCarriesSnapshotNotFoundFraming', () => {
    expect(isSnapshotNotFoundError('error: snapshot not found: /home/x/.microsandbox/snapshots/rz-ckpt-1')).toBe(true)
    expect(isSnapshotNotFoundError('error: database error: broken')).toBe(false)
    expect(isSnapshotAlreadyExistsError('error: snapshot already exists: /snap/sha256-abc')).toBe(true)
  })
})

describe('runningNames/entries from `msb ls --format json`', () => {
  const wellFormed = JSON.stringify([
    { name: 'a', status: 'Running', image: 'x:1' },
    { name: 'b', status: 'Stopped', image: 'x:1' },
  ])

  it('Should_YieldRunningNames_When_LsOutputIsWellFormedJson', () => {
    expect([...runningNames(wellFormed)]).toEqual(['a'])
  })

  it('Should_DegradeGracefully_When_JsonIsTruncatedOrMalformed', () => {
    const malformed = wellFormed.slice(0, wellFormed.indexOf('"b"'))
    expect([...runningNames(malformed)]).toEqual(['a'])
    expect([...runningNames('not json at all')]).toEqual([])
  })

  it('Should_KeepEveryEntry_When_LsOutputCarriesStoppedSandboxes', () => {
    const entries = lsEntries(wellFormed)
    expect(entries).toHaveLength(2)
    expect(entries.find((entry) => entry.name === 'b')?.status).toBe('Stopped')
  })
})

describe('snapshot import digest-dirname derivation', () => {
  it('Should_ParseDigestDirName_When_ImportSucceeds', () => {
    expect(parseImportedDigestDirName('imported snapshot to /home/u/.microsandbox/snapshots/sha256-b9c0448ee9d54e33\n'))
      .toBe('sha256-b9c0448ee9d54e33')
  })

  it('Should_ParseDigestDirName_When_ImportIsAlreadyPresentError', () => {
    expect(parseImportedDigestDirName('error: snapshot already exists: /snap/sha256-abc123')).toBe('sha256-abc123')
  })

  it('Should_ReturnUndefined_When_OutputHasNoNonEmptyLine', () => {
    expect(parseImportedDigestDirName('')).toBeUndefined()
    expect(parseImportedDigestDirName('\n  \n')).toBeUndefined()
  })

  it('Should_ConfirmDigestDirName_When_EntryNameOrArtifactBasenameMatches', () => {
    const entries = parseSnapshotList(
      JSON.stringify([{ digest: 'sha256:full', name: 'sha256-ab', artifact_path: '/snap/sha256-cd' }]),
    )
    expect(confirmDigestDirNamePresent(entries, 'sha256-ab')).toBe('sha256-ab')
    expect(confirmDigestDirNamePresent(entries, 'sha256-cd')).toBe('sha256-cd')
    expect(confirmDigestDirNamePresent(entries, 'sha256-zz')).toBeUndefined()
  })

  it('Should_NotConfirmDigestDirName_When_OnlyTheFullDigestMatches', () => {
    const entries = parseSnapshotList(JSON.stringify([{ digest: 'sha256:full', name: 'x', artifact_path: '/y' }]))
    expect(confirmDigestDirNamePresent(entries, 'sha256:full')).toBeUndefined()
  })
})

describe('follow-logs replay math', () => {
  it('Should_NotSynthesizePhantomLine_When_TailEndsWithNewline', () => {
    expect(undeliveredLines('line1\nline2\n', 0)).toEqual(['line1', 'line2'])
    expect(undeliveredLines('line1\nline2\n', 1)).toEqual(['line2'])
  })

  it('Should_KeepInteriorBlankLines_When_WorkloadPrintedThem', () => {
    expect(undeliveredLines('a\n\nb\n', 0)).toEqual(['a', '', 'b'])
  })
})
