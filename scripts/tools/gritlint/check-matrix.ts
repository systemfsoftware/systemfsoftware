#!/usr/bin/env -S deno run --allow-read
import { resolve } from '@std/path'
import { parse as parseYaml } from '@std/yaml'
import {
  die,
  LAUNCHER_MANIFEST_PATH,
  type LauncherManifest,
  MATRIX_JOB,
  parseCliArgs,
  readJson,
  RELEASE_WORKFLOW_PATH,
  type Target,
  TARGETS_PATH,
} from './shared.ts'

const EXPECTED_SUFFIXES = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64']
const KNOWN_RUNNERS: Record<string, true> = {
  'ubuntu-latest': true,
  'ubuntu-24.04-arm': true,
  'macos-14': true,
  'windows-2022': true,
}

interface MatrixRow {
  target: string
  suffix: string
  runner: string
  bin: string
}

function matrixRows(workflowText: string, jobName = MATRIX_JOB): MatrixRow[] {
  const doc: unknown = parseYaml(workflowText)
  if (typeof doc !== 'object' || doc === null) throw new Error('workflow document is not a mapping')
  const jobs = (doc as Record<string, unknown>).jobs
  if (typeof jobs !== 'object' || jobs === null) throw new Error('workflow has no jobs mapping')
  const job = (jobs as Record<string, unknown>)[jobName]
  if (typeof job !== 'object' || job === null) throw new Error(`workflow has no ${jobName} job`)
  const strategy = (job as Record<string, unknown>).strategy
  if (typeof strategy !== 'object' || strategy === null) {
    throw new Error(`${jobName} job has no strategy`)
  }
  const matrix = (strategy as Record<string, unknown>).matrix
  if (typeof matrix !== 'object' || matrix === null) {
    throw new Error(`${jobName} job has no strategy.matrix`)
  }
  const include = (matrix as Record<string, unknown>).include
  if (!Array.isArray(include)) throw new Error(`${jobName} job has no strategy.matrix.include`)
  if (include.length === 0) throw new Error(`${jobName} matrix include is empty`)
  const rows: MatrixRow[] = []
  for (const row of include) {
    if (typeof row !== 'object' || row === null) {
      throw new Error(`malformed include row (not a mapping): ${JSON.stringify(row)}`)
    }
    const record = row as Record<string, unknown>
    const { target, suffix, runner, bin } = record
    if (
      typeof target !== 'string' || typeof suffix !== 'string' || typeof runner !== 'string' ||
      typeof bin !== 'string'
    ) {
      throw new Error(
        `malformed include row: target/suffix/runner/bin must be strings, got ${JSON.stringify(record)}`,
      )
    }
    rows.push({ target, suffix, runner, bin })
  }
  return rows
}

const failures: string[] = []
const fail = (reason: string) => failures.push(reason)
const note = (message: string) => console.error(`check-matrix: note: ${message}`)

const flags = parseCliArgs({
  alias: { 'manifest-path': 'manifestPath', 'workflow-path': 'workflowPath' },
  string: ['targets', 'manifest-path', 'workflow-path'],
})
const targetsPath = typeof flags.targets === 'string' ? resolve(flags.targets) : TARGETS_PATH
const manifestPath = typeof flags.manifestPath === 'string'
  ? resolve(flags.manifestPath)
  : LAUNCHER_MANIFEST_PATH
const workflowPath = typeof flags.workflowPath === 'string'
  ? resolve(flags.workflowPath)
  : RELEASE_WORKFLOW_PATH

function checkTable(targets: Target[]) {
  const suffixes = targets.map((entry) => entry.suffix)
  const missing = EXPECTED_SUFFIXES.filter((suffix) => !suffixes.includes(suffix))
  const extra = suffixes.filter((suffix) => !EXPECTED_SUFFIXES.includes(suffix))
  if (missing.length > 0 || extra.length > 0) {
    fail(
      `targets table must name exactly the supported platform set; missing: ${missing.join(', ') || 'none'}, extra: ${
        extra.join(', ') || 'none'
      }`,
    )
  }
  for (const entry of targets) {
    if (entry.suffix !== `${entry.os}-${entry.cpu}`) {
      fail(
        `target ${entry.target}: suffix "${entry.suffix}" must equal os-cpu "${entry.os}-${entry.cpu}"`,
      )
    }
    if (KNOWN_RUNNERS[entry.runner] !== true) {
      fail(
        `target ${entry.target}: runner "${entry.runner}" is not a known runner; known are ${
          Object.keys(KNOWN_RUNNERS).join(', ')
        }`,
      )
    }
    if ((entry.os === 'win32') !== (entry.bin === 'gritlint.exe')) {
      fail(
        `target ${entry.target}: bin must be gritlint.exe iff os is win32 (os: ${entry.os}, bin: ${entry.bin})`,
      )
    }
    if (entry.os === 'linux' && entry.libc !== 'glibc') {
      fail(
        `target ${entry.target}: linux targets must carry libc "glibc", got ${JSON.stringify(entry.libc)}`,
      )
    }
    if (entry.os !== 'linux' && entry.libc !== undefined) {
      fail(
        `target ${entry.target}: non-linux targets must not carry libc, got ${JSON.stringify(entry.libc)}`,
      )
    }
  }
}

function checkManifest(manifest: LauncherManifest, targets: Target[]) {
  const expectedNames = targets.map((entry) => `${manifest.name}-${entry.suffix}`)
  const declaredNames = Object.keys(manifest.optionalDependencies ?? {})
  if (declaredNames.length === 0) {
    note(
      'launcher manifest carries no optionalDependencies (pre-publish); sync-version.ts --pins injects the five platform pins from targets.json at release time',
    )
    return
  }
  const missingNames = expectedNames.filter((name) => !declaredNames.includes(name))
  const extraNames = declaredNames.filter((name) => !expectedNames.includes(name))
  if (missingNames.length > 0 || extraNames.length > 0) {
    fail(
      `launcher manifest optionalDependencies must be exactly the platform packages from the table; missing: ${
        missingNames.join(', ') || 'none'
      }, extra: ${extraNames.join(', ') || 'none'}`,
    )
  }
  for (const name of expectedNames) {
    const pin = manifest.optionalDependencies?.[name]
    if (pin !== manifest.version) {
      fail(
        `optionalDependency ${name} must be pinned to the launcher version ${manifest.version}, got ${
          JSON.stringify(pin)
        }`,
      )
    }
  }
}

async function checkWorkflow(workflowPath: string, targets: Target[]) {
  let content: string
  try {
    content = await Deno.readTextFile(workflowPath)
  } catch (error) {
    fail(
      `cannot read the release workflow ${workflowPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return
  }
  let workflowRows: MatrixRow[]
  try {
    workflowRows = matrixRows(content, MATRIX_JOB)
  } catch (error) {
    fail(`${workflowPath} matrix is unusable: ${error instanceof Error ? error.message : error}`)
    return
  }
  const tableRow = (target: string): Target | undefined => targets.find((entry) => entry.target === target)
  if (workflowRows.length !== targets.length) {
    fail(`release.yml lists ${workflowRows.length} matrix rows; targets.json has ${targets.length}`)
  }
  for (const row of workflowRows) {
    const entry = tableRow(row.target)
    if (entry === undefined) {
      fail(`release.yml lists ${row.target}, which is not a row in targets.json`)
      continue
    }
    if (row.suffix !== entry.suffix) {
      fail(`release.yml lists ${row.target} with suffix ${row.suffix}, table says ${entry.suffix}`)
    }
    if (row.runner !== entry.runner) {
      fail(`release.yml lists ${row.target} on runner ${row.runner}, table says ${entry.runner}`)
    }
    if (row.bin !== entry.bin) {
      fail(`release.yml lists ${row.target} with bin ${row.bin}, table says ${entry.bin}`)
    }
  }
  for (const entry of targets) {
    if (!workflowRows.some((row) => row.target === entry.target)) {
      fail(`release.yml does not list release target ${entry.target}`)
    }
  }
}

const targets = await readJson<Target[]>(targetsPath, 'targets file')
if (!Array.isArray(targets) || targets.length === 0) {
  die('check-matrix: targets table is not a non-empty array')
}
checkTable(targets)
const manifest = await readJson<LauncherManifest>(manifestPath, 'launcher manifest')
checkManifest(manifest, targets)
await checkWorkflow(workflowPath, targets)

if (failures.length > 0) {
  for (const reason of failures) {
    console.error(`check-matrix: FAIL: ${reason}`)
  }
  Deno.exit(1)
}

console.error('check-matrix: ok')
