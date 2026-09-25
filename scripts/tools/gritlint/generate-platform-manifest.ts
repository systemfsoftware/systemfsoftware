#!/usr/bin/env -S deno run --allow-read --allow-write
import { join } from '@std/path'
import {
  assertVersion,
  die,
  LAUNCHER_MANIFEST_PATH,
  type LauncherManifest,
  launcherVersion,
  parseCliArgs,
  readJson,
  type Target,
  TARGETS_PATH,
} from './shared.ts'

export interface PlatformPackageManifest {
  name: string
  version: string
  description: string
  license: string
  repository: { type: string; url: string }
  os: [string]
  cpu: [string]
  files: [string]
  /** The launcher this package belongs to, at the same exact version. */
  peerDependencies: Record<string, string>
  publishConfig: { access: 'public'; provenance: true }
  libc?: [string]
  binarySha256?: string
}

export function buildPlatformManifest(
  launcher: LauncherManifest,
  entry: Target,
  version: string,
  binarySha256?: string,
): PlatformPackageManifest {
  const pkg: PlatformPackageManifest = {
    name: `${launcher.name}-${entry.suffix}`,
    version,
    description: `${launcher.name} ${entry.suffix} platform package (${entry.target})`,
    license: launcher.license,
    repository: { type: launcher.repository.type, url: launcher.repository.url },
    os: [entry.os],
    cpu: [entry.cpu],
    files: [entry.bin],
    peerDependencies: { [launcher.name]: version },
    publishConfig: { access: 'public', provenance: true },
  }
  if (entry.libc !== undefined) {
    pkg.libc = [entry.libc]
  }
  if (binarySha256 !== undefined) {
    pkg.binarySha256 = binarySha256
  }
  return pkg
}

const flags = parseCliArgs({
  alias: { 'binary-sha256': 'binarySha256', 'dry-run': 'dryRun' },
  boolean: ['dry-run'],
  string: ['suffix', 'version', 'out', 'binary-sha256'],
})

if (typeof flags.suffix !== 'string') die('generate-platform-manifest: missing required --suffix')
const suffix = flags.suffix as string
const version = assertVersion(
  typeof flags.version === 'string' ? flags.version : await launcherVersion(),
)
const binarySha256 = typeof flags.binarySha256 === 'string' ? flags.binarySha256 : undefined

if (flags.dryRun !== true && typeof flags.out !== 'string') {
  die('generate-platform-manifest: missing required --out')
}
const out = typeof flags.out === 'string' ? flags.out : ''

const targets = await readJson<Target[]>(TARGETS_PATH, 'targets file')
if (!Array.isArray(targets) || targets.length === 0) {
  die(`generate-platform-manifest: ${TARGETS_PATH} must be a non-empty array`)
}
const launcher = await readJson<LauncherManifest>(LAUNCHER_MANIFEST_PATH, 'launcher manifest')

const entry = targets.find((candidate) => candidate.suffix === suffix)
if (entry === undefined) {
  die(
    `generate-platform-manifest: unknown suffix "${suffix}"; supported suffixes: ${
      targets.map((candidate) => candidate.suffix).join(', ')
    }`,
  )
}

const manifest = buildPlatformManifest(launcher, entry, version, binarySha256)
const output = `${JSON.stringify(manifest, null, 2)}\n`

if (flags.dryRun === true) {
  await Deno.stdout.write(new TextEncoder().encode(output))
  Deno.exit(0)
}

const manifestPath = join(out, 'package.json')
await Deno.mkdir(out, { recursive: true })
await Deno.writeTextFile(manifestPath, output)

const written = await readJson<PlatformPackageManifest>(manifestPath, 'generated manifest')
if (JSON.stringify(written) !== JSON.stringify(manifest)) {
  die(`generate-platform-manifest: ${manifestPath} does not carry the manifest that was generated`)
}
