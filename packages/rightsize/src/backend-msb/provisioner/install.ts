import { dirname } from 'node:path'

/**
 * Atomic binary-last install planning for the msb provisioner. Behavioral
 * source: upstream rightsize-node `src/backend-msb/provisioner.ts`
 * `downloadAndInstall` (Apache-2.0). The DECISION (what steps, in what order)
 * is pure; the adapter executes the steps as effects.
 *
 * Invariant: both downloads are verified BEFORE either rename, and the krun
 * library is renamed into `lib/` BEFORE the `msb` binary into `bin/`. msb's
 * presence is therefore the commit marker for a complete install — a crash
 * between the two renames can never leave a present-msb/missing-krun state,
 * because `isInstalled` requires both files and whichever half is missing is
 * re-downloaded on the next call.
 */

/** One downloaded-and-verified asset awaiting its rename into place. */
export interface InstallArtifact {
  /** Which install slot the artifact fills. */
  readonly asset: 'msb' | 'krun'
  /** The release asset filename (what it was downloaded as, e.g. `msb-linux-x86_64`). */
  readonly assetName: string
  /** The staged temp file the verified bytes were written to. */
  readonly tempFile: string
  /** The final install path (under `bin/` or `lib/`). */
  readonly finalPath: string
  /** The manifest-pinned SHA-256 of the asset — re-checked against the on-disk temp file immediately before rename. */
  readonly sha256: string
}

export type InstallStep =
  | { readonly _tag: 'ensure-dir'; readonly path: string }
  | {
    readonly _tag: 'fetch-verified'
    readonly asset: 'msb' | 'krun'
    readonly url: string
    readonly tempFile: string
  }
  | {
    readonly _tag: 'rename'
    readonly asset: 'msb' | 'krun'
    readonly from: string
    readonly to: string
    /** The manifest digest the on-disk temp bytes must match at rename time. */
    readonly expectedSha256: string
    /** The release asset name, for the mismatch failure's message. */
    readonly assetName: string
  }

export interface InstallPlan {
  /** The ordered step list the adapter must execute top-to-bottom. */
  readonly steps: readonly InstallStep[]
}

/** Builds the ordered install decision list for both assets of one release. */
export function installPlan(baseUrl: string, msb: InstallArtifact, krun: InstallArtifact): InstallPlan {
  const steps: readonly InstallStep[] = [
    { _tag: 'ensure-dir', path: dirname(msb.tempFile) },
    {
      _tag: 'fetch-verified',
      asset: 'msb',
      // URL, not a filesystem path — `path.join` would collapse the scheme's `//`.
      url: `${baseUrl}/${msb.assetName}`,
      tempFile: msb.tempFile,
    },
    { _tag: 'ensure-dir', path: dirname(krun.tempFile) },
    {
      _tag: 'fetch-verified',
      asset: 'krun',
      url: `${baseUrl}/${krun.assetName}`,
      tempFile: krun.tempFile,
    },
    // The rename sequence is fixed: krun first, msb last (binary-last).
    // Each rename re-verifies the on-disk temp bytes against the manifest
    // digest immediately before the move (see the adapter's rename step).
    {
      _tag: 'rename',
      asset: 'krun',
      from: krun.tempFile,
      to: krun.finalPath,
      expectedSha256: krun.sha256,
      assetName: krun.assetName,
    },
    {
      _tag: 'rename',
      asset: 'msb',
      from: msb.tempFile,
      to: msb.finalPath,
      expectedSha256: msb.sha256,
      assetName: msb.assetName,
    },
  ]
  return { steps }
}

/**
 * "Is this a usable, already-provisioned msb install?" — both halves must be
 * present: the msb binary usable (executable on POSIX, existing file on
 * Windows) AND the krun library present. The host-appropriate usability probe
 * is injected by the adapter (U9b); this kernel only combines the verdicts.
 */
export function isInstalled(input: { readonly msbUsable: boolean; readonly krunPresent: boolean }): boolean {
  return input.msbUsable && input.krunPresent
}
