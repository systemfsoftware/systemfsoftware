import { join } from 'node:path'

/**
 * Platform asset tables and pure platform resolution for the microsandbox
 * (`msb`) backend. Behavioral source: upstream rightsize-node
 * `src/backend-msb/platform.ts` (Apache-2.0) — the five platform strings,
 * asset names and install names are copied verbatim and MUST be re-verified
 * against the release when the pinned `msb` version is bumped.
 *
 * All functions here are pure data derivations: the `/dev/kvm` probe and the
 * Windows-availability report are EFFECTS that land in the adapter layer
 * (U9b) — this module takes probe results as inputs and decides.
 */

/** The five platforms the pinned microsandbox release ships a build for. */
export type Platform = 'darwin-arm64' | 'linux-x64' | 'linux-arm64' | 'win32-x64' | 'win32-arm64'

/** Every platform the pinned release ships, used as the completeness enumeration. */
export const PLATFORMS: readonly Platform[] = [
  'darwin-arm64',
  'linux-x64',
  'linux-arm64',
  'win32-x64',
  'win32-arm64',
]

/** The pinned msb release. The asset/install tables below are tied to this pin: re-verify every name when bumping it. */
export const MSB_VERSION = '0.6.9'

/** The msb release asset filename per platform. */
export const MSB_ASSETS: Record<Platform, string> = {
  'darwin-arm64': 'msb-darwin-aarch64',
  'linux-x64': 'msb-linux-x86_64',
  'linux-arm64': 'msb-linux-aarch64',
  'win32-x64': 'msb-windows-x86_64.exe',
  'win32-arm64': 'msb-windows-aarch64.exe',
}

/** The libkrunfw release asset filename per platform (what it is downloaded as). */
export const KRUN_ASSETS: Record<Platform, string> = {
  'darwin-arm64': 'libkrunfw-darwin-aarch64.dylib',
  'linux-x64': 'libkrunfw-linux-x86_64.so',
  'linux-arm64': 'libkrunfw-linux-aarch64.so',
  'win32-x64': 'libkrunfw-windows-x86_64.dll',
  'win32-arm64': 'libkrunfw-windows-aarch64.dll',
}

// The exact filename msb resolves the library under: it probes `../lib/` next to its
// own binary for `libkrunfw.so.<version>` on Linux, `libkrunfw.<abi>.dylib` on macOS,
// and unversioned `libkrunfw.dll` on Windows (confirmed against install.ps1, the
// upstream Windows installer's own copy step: it moves the extracted bundle's
// `libkrunfw.dll` straight to `lib\libkrunfw.dll`, no version suffix) — never the
// release-asset name — so the provisioner installs the downloaded asset under this
// name. The embedded libkrunfw version/ABI is part of the pinned msb release;
// re-verify all names when bumping the pin.
/** The filename the library must be installed under for msb to resolve it, per platform. */
export const KRUN_INSTALL_NAMES: Record<Platform, string> = {
  'darwin-arm64': 'libkrunfw.5.dylib',
  'linux-x64': 'libkrunfw.so.5.6.1',
  'linux-arm64': 'libkrunfw.so.5.6.1',
  'win32-x64': 'libkrunfw.dll',
  'win32-arm64': 'libkrunfw.dll',
}

/** Maps a `process.platform`/`process.arch` triple to an msb platform, or `undefined` if msb ships no build for it. */
export function platformFor(processPlatform: string, processArch: string): Platform | undefined {
  if (processPlatform === 'darwin' && processArch === 'arm64') return 'darwin-arm64'
  if (processPlatform === 'linux' && processArch === 'x64') return 'linux-x64'
  if (processPlatform === 'linux' && processArch === 'arm64') return 'linux-arm64'
  if (processPlatform === 'win32' && processArch === 'x64') return 'win32-x64'
  if (processPlatform === 'win32' && processArch === 'arm64') return 'win32-arm64'
  return undefined
}

/** The `msb` release asset filename for this platform (what it is downloaded as). */
export function msbAsset(platform: Platform): string {
  return MSB_ASSETS[platform]
}

/** The libkrunfw release asset filename for this platform — what it is downloaded as. */
export function krunAsset(platform: Platform): string {
  return KRUN_ASSETS[platform]
}

/** The filename the library must be installed under for msb to resolve it (never the release-asset name). */
export function krunInstallName(platform: Platform): string {
  return KRUN_INSTALL_NAMES[platform]
}

/**
 * The basename the msb binary must be installed under inside `bin/` —
 * suffixless (`msb`) on macOS/Linux, `msb.exe` on Windows (Windows resolves
 * executables by extension, not an executable permission bit).
 */
export function msbBinaryName(platform: Platform): string {
  return platform.startsWith('win32-') ? 'msb.exe' : 'msb'
}

/**
 * "Can this machine actually run msb's microVMs right now?" — a pure decision
 * over the RESOLVED platform and an injected KVM probe result:
 *
 * - Linux needs `/dev/kvm` open for read+write; the probe (an effect — U9b)
 *   supplies `kvmAccessible`.
 * - Apple Silicon's Virtualization.framework needs no device-file probe, so
 *   availability is "the platform itself resolved".
 * - Windows is ATTEMPT-AND-REPORT, never probed: there is no cheap, reliable
 *   no-spawn signal for Windows Hypervisor Platform availability, and the
 *   upstream windows-spike findings (msb 0.6.3 on windows-2022/2025 hosted
 *   runners) showed WHP already enabled out of the box on both — so a detected
 *   Windows platform reports true and a genuinely WHP-less host finds out from
 *   msb's own loud error at boot, not a silent Docker downgrade.
 */
export function virtualizationDecision(platform: Platform | undefined, kvmAccessible: boolean): boolean {
  if (platform === undefined) return false
  if (platform.startsWith('linux-')) return kvmAccessible
  // darwin-* and win32-*: platform resolved implies virtualization available.
  return true
}

/** The on-disk layout of one version-pinned msb install inside the cache dir. */
export interface MsbInstallPaths {
  /** `<cacheDir>/msb/<MSB_VERSION>` — the atomic-install unit the lock protects. */
  readonly installDir: string
  /** Where the extracted downloads are staged and the msb binary lands. */
  readonly binDir: string
  /** Where libkrunfw lands under its msb-resolved name. */
  readonly libDir: string
  /** The runnable msb binary: `<installDir>/bin/<msb|msb.exe>`. */
  readonly msbPath: string
  /** The library under its msb-resolved name: `<installDir>/lib/<krunInstallName>`. */
  readonly krunPath: string
  /** The cross-process install lock guarding this install directory. */
  readonly lockPath: string
}

/** Derives every install path for a platform from the cache dir. Pure path derivation (no I/O). */
export function msbInstallPaths(cacheDir: string, platform: Platform): MsbInstallPaths {
  const installDir = join(cacheDir, 'msb', MSB_VERSION)
  const binDir = join(installDir, 'bin')
  const libDir = join(installDir, 'lib')
  return {
    installDir,
    binDir,
    libDir,
    msbPath: join(binDir, msbBinaryName(platform)),
    krunPath: join(libDir, krunInstallName(platform)),
    lockPath: join(installDir, '.lock'),
  }
}
