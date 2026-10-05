import { type Args, parseArgs, type ParseOptions } from '@std/cli/parse-args'
import { join } from '@std/path'

const GRITLINT_DIR = import.meta.dirname!
export const REPO_ROOT = join(GRITLINT_DIR, '..', '..', '..')

export interface VersionCarrierManifest {
  name: string
  version: string
}

export function die(message: string): never {
  console.error(message)
  Deno.exit(1)
}

export type ParsedFlags = Args<Record<string, unknown>>

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

const VERSION_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/

export function assertVersion(version: string): string {
  if (!VERSION_RE.test(version) || version.includes('\n')) {
    die(`invalid version: ${JSON.stringify(version)}`)
  }
  return version
}
