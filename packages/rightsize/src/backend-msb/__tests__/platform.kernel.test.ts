import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  KRUN_ASSETS,
  KRUN_INSTALL_NAMES,
  krunAsset,
  krunInstallName,
  MSB_ASSETS,
  msbAsset,
  msbBinaryName,
  msbInstallPaths,
  platformFor,
  PLATFORMS,
  virtualizationDecision,
} from '../platform.js'

const sort = (names: readonly string[]): string[] => [...names].sort((a, b) => a.localeCompare(b))

describe('PlatformInfo (asset tables)', () => {
  it('Should_ResolveAllFiveSupportedPlatforms_When_GivenKnownTriples', () => {
    expect(platformFor('darwin', 'arm64')).toBe('darwin-arm64')
    expect(platformFor('linux', 'x64')).toBe('linux-x64')
    expect(platformFor('linux', 'arm64')).toBe('linux-arm64')
    expect(platformFor('win32', 'x64')).toBe('win32-x64')
    expect(platformFor('win32', 'arm64')).toBe('win32-arm64')
  })

  it('Should_ReturnUndefined_When_PlatformOrArchUnsupported', () => {
    expect(platformFor('win32', 'ia32')).toBeUndefined()
    expect(platformFor('darwin', 'x64')).toBeUndefined()
    expect(platformFor('linux', 'ia32')).toBeUndefined()
    expect(platformFor('freebsd', 'arm64')).toBeUndefined()
  })

  it('Should_HaveNoGaps_When_ComparingEveryAssetTableAgainstThePlatformList', () => {
    const platforms = sort(PLATFORMS)
    for (const table of [MSB_ASSETS, KRUN_ASSETS, KRUN_INSTALL_NAMES] as const) {
      expect(sort(Object.keys(table))).toEqual(platforms)
    }
    // exactly five platforms, no more, no fewer
    expect(Object.keys(MSB_ASSETS).length).toBe(5)
  })

  it('Should_NameTheMsbAsset_When_EnumeratedPerPlatform', () => {
    expect(msbAsset('darwin-arm64')).toBe('msb-darwin-aarch64')
    expect(msbAsset('linux-x64')).toBe('msb-linux-x86_64')
    expect(msbAsset('linux-arm64')).toBe('msb-linux-aarch64')
    expect(msbAsset('win32-x64')).toBe('msb-windows-x86_64.exe')
    expect(msbAsset('win32-arm64')).toBe('msb-windows-aarch64.exe')
  })

  it('Should_NameTheKrunReleaseAsset_When_EnumeratedPerPlatform', () => {
    expect(krunAsset('darwin-arm64')).toBe('libkrunfw-darwin-aarch64.dylib')
    expect(krunAsset('linux-x64')).toBe('libkrunfw-linux-x86_64.so')
    expect(krunAsset('linux-arm64')).toBe('libkrunfw-linux-aarch64.so')
    expect(krunAsset('win32-x64')).toBe('libkrunfw-windows-x86_64.dll')
    expect(krunAsset('win32-arm64')).toBe('libkrunfw-windows-aarch64.dll')
  })

  it('Should_InstallKrunUnderTheNameMsbResolves_When_EnumeratedPerPlatform', () => {
    expect(krunInstallName('darwin-arm64')).toBe('libkrunfw.5.dylib')
    expect(krunInstallName('linux-x64')).toBe('libkrunfw.so.5.6.1')
    expect(krunInstallName('linux-arm64')).toBe('libkrunfw.so.5.6.1')
    expect(krunInstallName('win32-x64')).toBe('libkrunfw.dll')
    expect(krunInstallName('win32-arm64')).toBe('libkrunfw.dll')
  })

  it('Should_NameTheBinarySuffixlessOrExe_When_PlatformIsWindowsOrPosix', () => {
    expect(msbBinaryName('darwin-arm64')).toBe('msb')
    expect(msbBinaryName('linux-x64')).toBe('msb')
    expect(msbBinaryName('linux-arm64')).toBe('msb')
    expect(msbBinaryName('win32-x64')).toBe('msb.exe')
    expect(msbBinaryName('win32-arm64')).toBe('msb.exe')
  })

  it('Should_DeriveInstallPathsUnderThePinnedVersionDir_When_GivenCacheDirAndPlatform', () => {
    const paths = msbInstallPaths('/cache', 'linux-x64')
    expect(paths.installDir).toBe(path.join('/cache', 'msb', '0.6.9'))
    expect(paths.binDir).toBe(path.join(paths.installDir, 'bin'))
    expect(paths.libDir).toBe(path.join(paths.installDir, 'lib'))
    expect(paths.msbPath).toBe(path.join(paths.binDir, 'msb'))
    expect(paths.krunPath).toBe(path.join(paths.libDir, 'libkrunfw.so.5.6.1'))
    expect(paths.lockPath).toBe(path.join(paths.installDir, '.lock'))
  })

  it('Should_DeriveWindowsInstallPaths_When_PlatformIsWindows', () => {
    const paths = msbInstallPaths('/cache', 'win32-x64')
    expect(paths.msbPath).toBe(path.join(paths.binDir, 'msb.exe'))
    expect(paths.krunPath).toBe(path.join(paths.libDir, 'libkrunfw.dll'))
  })
})

describe('Platform virtualization decision', () => {
  it('Should_ApproveVirtualization_When_PlatformIsDarwinOrWindows', () => {
    // Apple Silicon needs no device-file probe; Windows is attempt-and-report
    // (WHP has no cheap synchronous liveness signal) — both report true as
    // long as the platform itself resolves.
    expect(virtualizationDecision('darwin-arm64', false)).toBe(true)
    expect(virtualizationDecision('win32-x64', false)).toBe(true)
    expect(virtualizationDecision('win32-arm64', false)).toBe(true)
  })

  it('Should_GateVirtualizationOnKvmAccess_When_PlatformIsLinux', () => {
    expect(virtualizationDecision('linux-x64', true)).toBe(true)
    expect(virtualizationDecision('linux-arm64', true)).toBe(true)
    expect(virtualizationDecision('linux-x64', false)).toBe(false)
  })

  it('Should_DenyVirtualization_When_PlatformUndefined', () => {
    expect(virtualizationDecision(undefined, true)).toBe(false)
    expect(virtualizationDecision(undefined, false)).toBe(false)
  })
})
