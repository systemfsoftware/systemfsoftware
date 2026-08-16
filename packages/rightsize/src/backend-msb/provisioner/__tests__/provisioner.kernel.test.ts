import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { Platform } from '../../platform.js'
import { parseChecksums, sha256Hex, verifyPlan } from '../checksum.kernel.js'
import { envResolution, resolveCacheDir } from '../env.kernel.js'
import { type InstallArtifact, installPlan, isInstalled } from '../install.kernel.js'
import { lockStaleness, parseLockInfo, STALE_LOCK_AGE_MS } from '../lock.kernel.js'

const textEncoder = new TextEncoder()

describe('checksums.kernel (parseChecksums)', () => {
  it('Should_ParseChecksumsToleratingWhitespace_When_WellFormed', () => {
    expect(parseChecksums('  abc123   file-one\ndef456  file-two  \n\n')).toEqual({
      _tag: 'ok',
      sums: new Map([
        ['file-one', 'abc123'],
        ['file-two', 'def456'],
      ]),
    })
  })

  it('Should_LowercaseHexDigests_When_Parsing', () => {
    expect(parseChecksums('ABC123  file-one\n')).toEqual({ _tag: 'ok', sums: new Map([['file-one', 'abc123']]) })
  })

  it('Should_ReportTheMalformedLine_When_LineHasASingleColumn', () => {
    expect(parseChecksums('abc123\n')).toEqual({ _tag: 'malformed', line: 'abc123' })
  })

  it('Should_IgnoreBlankLines_When_Parsing', () => {
    expect(parseChecksums('\n\n  \nabc  file-one\n\n')).toEqual({ _tag: 'ok', sums: new Map([['file-one', 'abc']]) })
  })
})

describe('checksums.kernel (verifyPlan)', () => {
  const bytes = textEncoder.encode('good-bytes')
  const manifest = `${sha256Hex(bytes)}  msb-linux-x86_64\n`

  it('Should_Proceed_When_DigestMatchesTheManifest', () => {
    expect(verifyPlan({ manifest, asset: 'msb-linux-x86_64', bytes, targetPath: '/install/bin/msb' })).toEqual({
      _tag: 'proceed',
      sha256: sha256Hex(bytes),
      targetPath: '/install/bin/msb',
    })
  })

  it('Should_ReportMismatch_When_DigestDiffersFromTheManifest', () => {
    const corrupted = textEncoder.encode('corrupted-bytes-not-matching-checksum')
    expect(verifyPlan({ manifest, asset: 'msb-linux-x86_64', bytes: corrupted, targetPath: '/install/bin/msb' }))
      .toEqual({
        _tag: 'mismatch',
        asset: 'msb-linux-x86_64',
        targetPath: '/install/bin/msb',
        expectedSha256: sha256Hex(bytes),
        actualSha256: sha256Hex(corrupted),
      })
  })

  it('Should_ReportChecksumMissing_When_AssetAbsentFromTheManifest', () => {
    expect(
      verifyPlan({
        manifest,
        asset: 'libkrunfw-linux-x86_64.so',
        bytes,
        targetPath: '/install/lib/libkrunfw.so.5.6.1',
      }),
    )
      .toEqual({
        _tag: 'checksum-missing',
        asset: 'libkrunfw-linux-x86_64.so',
        targetPath: '/install/lib/libkrunfw.so.5.6.1',
      })
  })

  it('Should_ReportMalformedManifest_When_TheManifestTextIsMalformed', () => {
    expect(verifyPlan({ manifest: 'orphan-column\n', asset: 'msb-linux-x86_64', bytes, targetPath: '/x' })).toEqual({
      _tag: 'malformed-manifest',
      line: 'orphan-column',
    })
  })

  it('Should_ComputeTheKnownSha256_When_HashingAbc', () => {
    expect(sha256Hex(textEncoder.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('install.kernel (installPlan)', () => {
  const msb: InstallArtifact = {
    asset: 'msb',
    assetName: 'msb-linux-x86_64',
    tempFile: '/install/bin/.dl-1-2-msb-linux-x86_64.part',
    finalPath: '/install/bin/msb',
    sha256: 'a'.repeat(64),
  }
  const krun: InstallArtifact = {
    asset: 'krun',
    assetName: 'libkrunfw-linux-x86_64.so',
    tempFile: '/install/lib/.dl-1-2-libkrunfw-linux-x86_64.so.part',
    finalPath: '/install/lib/libkrunfw.so.5.6.1',
    sha256: 'b'.repeat(64),
  }
  const baseUrl = 'https://release.example/base'

  it('Should_EnsureThenVerifyThenRenameKrunThenMsb_When_PlanningTheInstall', () => {
    // The exact ordered decision list the adapter must execute: both downloads
    // verified BEFORE either rename, and the msb binary renamed last so its
    // presence is the commit marker for a complete install (binary-last).
    expect(installPlan(baseUrl, msb, krun).steps).toEqual([
      { _tag: 'ensure-dir', path: '/install/bin' },
      {
        _tag: 'fetch-verified',
        asset: 'msb',
        url: `${baseUrl}/${msb.assetName}`,
        tempFile: msb.tempFile,
        expectedSha256: msb.sha256,
      },
      { _tag: 'ensure-dir', path: '/install/lib' },
      {
        _tag: 'fetch-verified',
        asset: 'krun',
        url: `${baseUrl}/${krun.assetName}`,
        tempFile: krun.tempFile,
        expectedSha256: krun.sha256,
      },
      { _tag: 'rename', asset: 'krun', from: krun.tempFile, to: krun.finalPath },
      { _tag: 'rename', asset: 'msb', from: msb.tempFile, to: msb.finalPath },
    ])
  })

  it('Should_KeepMsbAsCommitMarker_When_AnyPrefixOfRenamesApplied', () => {
    const plan = installPlan(baseUrl, msb, krun)
    const renames = plan.renames
    // A crash after any prefix of the rename sequence must never leave a
    // present-msb/missing-krun half-install: msb is renamed LAST, so its
    // presence implies krun is already in place.
    for (let prefix = 0; prefix <= renames.length; prefix++) {
      const applied = new Set(renames.slice(0, prefix).map((s) => s.asset))
      expect(applied.has('msb') && !applied.has('krun')).toBe(false)
    }
  })

  it('Should_CompleteOnlyWhenBothFilesPresent_When_AskedIsInstalled', () => {
    expect(isInstalled({ msbUsable: true, krunPresent: true })).toBe(true)
    expect(isInstalled({ msbUsable: true, krunPresent: false })).toBe(false)
    expect(isInstalled({ msbUsable: false, krunPresent: true })).toBe(false)
    expect(isInstalled({ msbUsable: false, krunPresent: false })).toBe(false)
  })
})

describe('lock.kernel (lockStaleness)', () => {
  const now = 1_000_000_000

  it('Should_ParseTheTwoLineLockRecord_When_ContentIsWellFormed', () => {
    expect(parseLockInfo('4242\n900000\n')).toEqual({ _tag: 'ok', record: { pid: 4242, timestamp: 900000 } })
  })

  it('Should_ReportUnparseable_When_ContentIsMalformed', () => {
    expect(parseLockInfo('')).toEqual({ _tag: 'unparseable' })
    expect(parseLockInfo('4242')).toEqual({ _tag: 'unparseable' })
    expect(parseLockInfo('not-a-pid\n9001')).toEqual({ _tag: 'unparseable' })
    // Upstream destructures `[pidStr, tsStr]` off the split, so a trailing
    // (or blank) extra line is ignored, not rejected — preserved here.
    expect(parseLockInfo('4242\n9001\nextra')).toEqual({ _tag: 'ok', record: { pid: 4242, timestamp: 9001 } })
  })

  it('Should_ConsiderLockFresh_When_PidAliveAndTimestampYoung', () => {
    expect(lockStaleness({ lockContent: `4242\n${now - 1000}\n`, now, isPidAlive: () => true })).toEqual({
      _tag: 'fresh',
      pid: 4242,
      timestamp: now - 1000,
      ageMs: 1000,
    })
  })

  it('Should_ReapLock_When_RecordedPidIsDead', () => {
    expect(lockStaleness({ lockContent: '4242\n900000\n', now, isPidAlive: () => false })).toEqual({
      _tag: 'stale',
      reason: 'dead-holder',
      pid: 4242,
      timestamp: 900000,
      ageMs: now - 900000,
    })
  })

  it('Should_ReapLock_When_TimestampAgedOutPastTheThreshold', () => {
    const aged = now - (STALE_LOCK_AGE_MS + 1)
    expect(lockStaleness({ lockContent: `4242\n${aged}\n`, now, isPidAlive: () => true })).toEqual({
      _tag: 'stale',
      reason: 'aged-out',
      pid: 4242,
      timestamp: aged,
      ageMs: STALE_LOCK_AGE_MS + 1,
    })
  })

  it('Should_TreatLockAsStillFresh_When_AgeEqualsTheThreshold', () => {
    // Upstream: `now - timestamp > STALE_LOCK_AGE_MS` — strictly greater, so
    // an age exactly at the threshold is a live lock, not a stale one.
    expect(lockStaleness({ lockContent: `4242\n${now - STALE_LOCK_AGE_MS}\n`, now, isPidAlive: () => true })).toEqual({
      _tag: 'fresh',
      pid: 4242,
      timestamp: now - STALE_LOCK_AGE_MS,
      ageMs: STALE_LOCK_AGE_MS,
    })
  })

  it('Should_ReapUnparseableLock_When_ContentCannotBeTrusted', () => {
    expect(lockStaleness({ lockContent: 'total-garbage', now, isPidAlive: () => true })).toEqual({
      _tag: 'stale',
      reason: 'unparseable',
      pid: undefined,
      timestamp: undefined,
      ageMs: undefined,
    })
  })
})

describe('env.kernel (resolveCacheDir)', () => {
  it('Should_UseRightsizeCacheDirOverride_When_Set', () => {
    expect(
      resolveCacheDir({
        rightsizeCacheDir: '/override',
        platform: 'linux',
        homedir: '/home/u',
        localAppData: undefined,
      }),
    )
      .toBe('/override')
    expect(
      resolveCacheDir({
        rightsizeCacheDir: '/override',
        platform: 'win32',
        homedir: 'C:\\Users\\u',
        localAppData: 'C:\\L',
      }),
    )
      .toBe('/override')
  })

  it('Should_UseHomedirDotCache_When_Linux', () => {
    expect(
      resolveCacheDir({ rightsizeCacheDir: undefined, platform: 'linux', homedir: '/home/u', localAppData: undefined }),
    )
      .toBe(join('/home/u', '.cache', 'rightsize'))
  })

  it('Should_UseLocalAppDataRightsize_When_Windows', () => {
    expect(
      resolveCacheDir({
        rightsizeCacheDir: undefined,
        platform: 'win32',
        homedir: 'C:\\Users\\u',
        localAppData: 'C:\\Users\\u\\AppData\\Local',
      }),
    ).toBe(join('C:\\Users\\u\\AppData\\Local', 'rightsize'))
  })

  it('Should_FallBackToHomedirAppDataLocal_When_WindowsWithoutLocalAppData', () => {
    expect(
      resolveCacheDir({
        rightsizeCacheDir: undefined,
        platform: 'win32',
        homedir: 'C:\\Users\\u',
        localAppData: undefined,
      }),
    )
      .toBe(join('C:\\Users\\u', 'AppData', 'Local', 'rightsize'))
  })
})

describe('env.kernel (envResolution)', () => {
  const base = {
    env: {},
    platform: 'linux-x64' as Platform,
    cacheDir: '/cache',
    isExecutable: () => false,
    isInstalled: () => false,
  }

  it('Should_ReturnUseMsbPath_When_MsbPathIsExecutable', () => {
    expect(envResolution({ ...base, env: { MSB_PATH: '/custom/msb' }, isExecutable: () => true })).toEqual({
      _tag: 'use-msb-path',
      path: '/custom/msb',
    })
  })

  it('Should_ReportUnusableMsbPath_When_NotExecutable', () => {
    expect(envResolution({ ...base, env: { MSB_PATH: '/custom/msb' } })).toEqual({
      _tag: 'msb-path-unusable',
      path: '/custom/msb',
    })
  })

  it('Should_ReportUnsupportedPlatform_When_NoPlatformResolves', () => {
    expect(envResolution({ ...base, platform: undefined })).toEqual({ _tag: 'unsupported-platform' })
  })

  it('Should_ReturnAlreadyInstalled_When_BothFilesPresent', () => {
    expect(envResolution({ ...base, isInstalled: () => true, env: { RIGHTSIZE_MSB_SKIP_DOWNLOAD: 'true' } })).toEqual({
      _tag: 'already-installed',
      msbPath: join('/cache', 'msb', '0.6.9', 'bin', 'msb'),
    })
  })

  it('Should_ReportSkipDownloadMissing_When_FlagSetAndNothingInstalled', () => {
    expect(envResolution({ ...base, env: { RIGHTSIZE_MSB_SKIP_DOWNLOAD: 'true' } })).toEqual({
      _tag: 'skip-download-missing',
      msbPath: join('/cache', 'msb', '0.6.9', 'bin', 'msb'),
    })
  })

  it('Should_ReturnDownloadPlan_When_NotInstalledAndNoSkipFlag', () => {
    expect(envResolution({ ...base })).toEqual({
      _tag: 'download',
      installDir: join('/cache', 'msb', '0.6.9'),
      msbPath: join('/cache', 'msb', '0.6.9', 'bin', 'msb'),
      krunPath: join('/cache', 'msb', '0.6.9', 'lib', 'libkrunfw.so.5.6.1'),
      msbAsset: 'msb-linux-x86_64',
      krunAsset: 'libkrunfw-linux-x86_64.so',
    })
  })

  it('Should_DeriveWindowsDownloadPlan_When_PlatformIsWindows', () => {
    expect(envResolution({ ...base, platform: 'win32-x64' })).toEqual({
      _tag: 'download',
      installDir: join('/cache', 'msb', '0.6.9'),
      msbPath: join('/cache', 'msb', '0.6.9', 'bin', 'msb.exe'),
      krunPath: join('/cache', 'msb', '0.6.9', 'lib', 'libkrunfw.dll'),
      msbAsset: 'msb-windows-x86_64.exe',
      krunAsset: 'libkrunfw-windows-x86_64.dll',
    })
  })

  it('Should_IgnoreSkipFlag_When_MsbPathOverrideIsSet', () => {
    // MSB_PATH short-circuits everything, even skip-download and the pin.
    expect(
      envResolution({
        ...base,
        env: { MSB_PATH: '/custom/msb', RIGHTSIZE_MSB_SKIP_DOWNLOAD: 'true' },
        isExecutable: () => true,
      }),
    )
      .toEqual({ _tag: 'use-msb-path', path: '/custom/msb' })
  })
})
