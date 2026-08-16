/**
 * Pure msb CLI argv construction. Behavioral source: upstream rightsize-node
 * `src/backend-msb/commands.ts` (Apache-2.0) — every spelling below was
 * checked against the real `msb` binary and is pinned byte-for-byte by the
 * recorded-vector tests in `commands/__tests__/commands.kernel.test.ts`.
 *
 * ATTACHED mode (no `-d`) is the whole ballgame: `msb run -d` boots the
 * microVM but never runs the image's own ENTRYPOINT/CMD, only attached mode
 * does — the CLI driver (U9b) supervises the attached child.
 *
 * Total functions: data in, argv out, never throws.
 */

/** A published container port: a host port already chosen, mapped to the port the workload listens on inside the guest. */
export interface MsbPortBinding {
  readonly hostPort: number
  readonly guestPort: number
}

/** A host path mounted into the guest before boot. */
export interface MsbFileMount {
  readonly hostPath: string
  readonly guestPath: string
  readonly readOnly: boolean
}

/** The slice of the domain `ContainerSpec` the msb run argv is built from (U2's schema feeds U9b's adapter). */
export interface MsbRunSpec {
  readonly name: string
  readonly image: string
  /** Array of pairs, insertion-ordered with last-write-wins dedup — a Map would reorder. */
  readonly env: ReadonlyArray<readonly [string, string]>
  /** `undefined` means the image's own ENTRYPOINT/CMD runs unmodified. */
  readonly command: ReadonlyArray<string> | undefined
  readonly ports: ReadonlyArray<MsbPortBinding>
  readonly mounts: ReadonlyArray<MsbFileMount>
  readonly memoryLimitMb: number | undefined
  /**
   * `--root-disk <mb>M` vs `tmpfs:<mb>M`: the start()-time validation
   * (RootDiskConflictError) guarantees diskLimitMb and tmpfsRootMb are never
   * both set, so at most one of the two fires.
   */
  readonly diskLimitMb: number | undefined
  readonly tmpfsRootMb: number | undefined
  readonly networkDisabled: boolean
  /** Boots via `--from-snapshot` instead of the image positional. */
  readonly checkpointRef: string | undefined
}

export const MsbCommands = {
  run(spec: MsbRunSpec): readonly string[] {
    const argv: string[] = ['run', '--name', spec.name]
    if (spec.memoryLimitMb !== undefined) {
      // `-m`/`--memory` immediately after `--name`: msb's parser accepts any
      // flag order, but the position matches captured real invocations so
      // the argv can be compared against them verbatim.
      argv.push('-m', `${spec.memoryLimitMb}M`)
    }
    if (spec.diskLimitMb !== undefined) {
      argv.push('--root-disk', `${spec.diskLimitMb}M`)
    }
    if (spec.tmpfsRootMb !== undefined) {
      argv.push('--root-disk', `tmpfs:${spec.tmpfsRootMb}M`)
    }
    if (spec.networkDisabled) {
      argv.push('--net', 'private')
    }
    for (const port of spec.ports) {
      argv.push('-p', `${port.hostPort}:${port.guestPort}`)
    }
    for (const [key, value] of spec.env) {
      argv.push('-e', `${key}=${value}`)
    }
    // The option block is always spelled out, never left to msb's defaults:
    // the access token (`ro`/`rw`) carries FileMount.readOnly, which msb
    // enforces as a genuine guest-side write block — and it keeps OUR spec
    // parseable on Windows: msb stages each mount into a temp directory and
    // canonicalizes it, which there yields the extended-length `\\?\C:\...`
    // form, and its splitter skips a drive prefix only for a bare drive
    // letter, so a spec with no option block splits at the drive's colon and
    // rejects the path tail as options. `nodev` exists because msb then
    // rebuilds an INTERNAL `tag:staged_path[:opts]` spec for the same mount,
    // carrying over only NON-DEFAULT option tokens — `rw` is its default and
    // is dropped, which on Windows strips the internal spec's option block
    // and re-creates the same misparse one layer down. `nodev` always
    // survives the carry-over, and for a single-file mount it is meaningless
    // (no device nodes to block) — verified against a real msb 0.6.8.
    for (const mount of spec.mounts) {
      argv.push('--mount-file', `${mount.hostPath}:${mount.guestPath}:${mount.readOnly ? 'ro' : 'rw'},nodev`)
    }
    if (spec.checkpointRef !== undefined) {
      // `--from-snapshot` is mutually exclusive with the IMAGE positional —
      // the snapshot itself pins the image.
      argv.push('--from-snapshot', spec.checkpointRef)
    } else {
      argv.push(spec.image)
    }
    if (spec.command !== undefined) {
      argv.push('--', ...spec.command)
    }
    return argv
  },

  /** `msb snapshot create --from <sandbox> <name>` — requires sandbox STOPPED; sparse disk snapshot under `<destDir>/<name>` when given. */
  snapshotCreate(sandbox: string, name: string, destDir?: string): readonly string[] {
    const argv: string[] = ['snapshot', 'create', '--from', sandbox, name]
    if (destDir !== undefined) {
      argv.push('--dest-dir', destDir)
    }
    return argv
  },

  /** `msb snapshot rm <name>` — best-effort; "not found" is fine. */
  snapshotRemove(name: string): readonly string[] {
    return ['snapshot', 'rm', name]
  },

  /** `msb snapshot inspect <name>` — exit 0 means the snapshot exists. */
  snapshotInspect(name: string): readonly string[] {
    return ['snapshot', 'inspect', name]
  },

  /** `msb snapshot save <ref> <dest>` — writes a `.tar.zst` artifact; deliberately never `--with-image` (its import fails an integrity check in 0.6.6). */
  snapshotExport(ref: string, dest: string): readonly string[] {
    return ['snapshot', 'save', ref, dest]
  },

  /** `msb snapshot load <archive>` — unpacks into a digest-derived dir under `~/.microsandbox/snapshots/`, never the original name. */
  snapshotImport(archive: string): readonly string[] {
    return ['snapshot', 'load', archive]
  },

  /** `msb snapshot list --format json` — used to confirm an imported snapshot's digest-dir basename is present (the basename, not the `digest` field, is the effective ref). */
  snapshotList(): readonly string[] {
    return ['snapshot', 'list', '--format', 'json']
  },

  /** `msb copy -q <hostPath> <name>:<containerPath>` — host-to-guest transfer, `cp -r`-style destination naming for a directory source. */
  copyIn(hostPath: string, name: string, containerPath: string): readonly string[] {
    return ['copy', '-q', hostPath, `${name}:${containerPath}`]
  },

  /** `msb copy -q <name>:<containerPath> <hostPath>` — the reverse direction of `copyIn`. */
  copyOut(name: string, containerPath: string, hostPath: string): readonly string[] {
    return ['copy', '-q', `${name}:${containerPath}`, hostPath]
  },

  exec(name: string, cmd: readonly string[]): readonly string[] {
    return ['exec', name, '--', ...cmd]
  },

  execStream(name: string, cmd: readonly string[]): readonly string[] {
    return ['exec', '--stream', name, '--', ...cmd]
  },

  logs(name: string): readonly string[] {
    return ['logs', name, '--tail', '1000']
  },

  followLogs(name: string): readonly string[] {
    return ['logs', name, '-f']
  },

  stop(name: string): readonly string[] {
    return ['stop', name]
  },

  rm(name: string): readonly string[] {
    return ['rm', name]
  },

  ls(): readonly string[] {
    // No `--json` flag exists on `ls` — that spelling belongs to `logs`.
    return ['ls', '--format', 'json']
  },

  /**
   * `msb image remove <reference>` deletes one cached image's entry (manifest
   * + layer bookkeeping) so the next run/pull re-fetches it from scratch.
   * Scoped to the single image reference; never touches sandbox state or any
   * other cached image.
   */
  imageRemove(reference: string): readonly string[] {
    return ['image', 'remove', reference]
  },
}
