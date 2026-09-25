import { type Args, parseArgs, type ParseOptions } from '@std/cli/parse-args'
import { join } from '@std/path'

// Every gritlint release script resolves the repository the same way, so one
// set of constants describes what the pipeline reads (KTD9: one targets table,
// one launcher manifest, one release workflow). The scripts live at
// scripts/tools/gritlint/ and are invoked from the repository root.
const GRITLINT_DIR = import.meta.dirname!
export const REPO_ROOT = join(GRITLINT_DIR, '..', '..', '..')

export const TARGETS_PATH = join(GRITLINT_DIR, 'targets.json')
export const LAUNCHER_MANIFEST_PATH = join(REPO_ROOT, 'npm', 'gritlint', 'package.json')
export const RELEASE_WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'release.yml')
export const WORKSPACE_CARGO_PATH = join(REPO_ROOT, 'Cargo.toml')

/** The workflow job whose `strategy.matrix.include` must mirror the table. */
export const MATRIX_JOB = 'gritlint-build'

/** One row of `scripts/tools/gritlint/targets.json`: the platform contract (R33, R35). */
export interface Target {
  /** Rust target triple the release lane builds. */
  target: string
  /** `<os>-<cpu>`, the platform package suffix and the npm identity suffix. */
  suffix: string
  os: string
  cpu: string
  /** Only linux rows carry a libc; the npm platform packages are glibc-only. */
  libc?: string
  /** The hosted runner that builds this row natively. */
  runner: string
  /** Binary file name the release lane builds. */
  bin: string
}

/** The npm launcher manifest (`npm/gritlint/package.json`). */
export interface LauncherManifest {
  name: string
  version: string
  license: string
  repository: { type: string; url: string; directory?: string }
  optionalDependencies?: Record<string, string>
}

export function die(message: string): never {
  console.error(message)
  Deno.exit(1)
}

/** Parsed release-script flags: one `string | boolean | undefined` per name, plus `_`. */
export type ParsedFlags = Args<Record<string, unknown>>

// @std/cli parses a string flag given without a value as "", so an empty
// string is the missing-value signal. Unknown flags and positionals are never
// silently dropped: a typo must fail the run, not change the behaviour.
export function parseCliArgs(
  options: ParseOptions<string | undefined, string | undefined>,
): ParsedFlags {
  const flags = parseArgs(Deno.args, {
    ...options,
    unknown: (arg: string) => die(`unknown argument: ${arg}`),
  })
  if (flags._.length > 0) {
    die(`unknown argument: ${flags._[0]}`)
  }
  for (const name of stringFlags(options.string)) {
    if (flags[name] === '') {
      die(`missing value for --${name}`)
    }
  }
  return flags
}

function stringFlags(names: string | readonly string[] | undefined): string[] {
  if (names === undefined) return []
  return typeof names === 'string' ? [names] : [...names]
}

export async function readJson<T>(path: string, label: string): Promise<T> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as T
  } catch (error) {
    return die(
      `cannot read ${label} ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** The release version: the launcher's own version, never a second source (R35). */
export const launcherVersion = async (manifestPath = LAUNCHER_MANIFEST_PATH): Promise<string> =>
  (await readJson<LauncherManifest>(manifestPath, 'launcher manifest')).version

const VERSION_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/

export function assertVersion(version: string): string {
  if (!VERSION_RE.test(version) || version.includes('\n')) {
    die(`invalid version: ${JSON.stringify(version)}`)
  }
  return version
}

/** A non-empty targets table, or refuse the empty verdict. */
export async function readTargets(path = TARGETS_PATH): Promise<Target[]> {
  const targets = await readJson<Target[]>(path, 'targets file')
  if (!Array.isArray(targets) || targets.length === 0) {
    die(`targets table ${path} is not a non-empty array`)
  }
  return targets
}
