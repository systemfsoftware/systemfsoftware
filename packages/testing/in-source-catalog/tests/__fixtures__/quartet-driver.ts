/// <reference types="node" />
// Sabotage-quartet evidence driver: mutates a scratch copy of the harness,
// requires vitest to fail naming the catching law, then requires the
// unmutated harness to pass. Appends a dated section to log.md.
// Scratch goes under src/.quartet-scratch/ because in-source collection
// covers src/**/*.ts only.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = '@systemfsoftware/in-source-catalog'
const HARNESS_REL = join('src', 'internal', 'decide-registry-slot.workflow.ts')

const driverDir = dirname(fileURLToPath(import.meta.url))
const testsDir = dirname(driverDir)
const quartetDir = join(testsDir, '.quartet')
const pkgDir = dirname(testsDir)
const harnessFile = join(pkgDir, HARNESS_REL)
const scratchDir = join(pkgDir, 'src', '.quartet-scratch')
const testsScratchDir = join(quartetDir, 'scratch')
const logFile = join(quartetDir, 'log.md')

const findRepoRoot = (start: string) => {
  let dir = start
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('quartet: pnpm-workspace.yaml not found above ' + start)
}

const rebaseRelativeImports = (source: string, oldDir: string, newDir: string) => {
  let count = 0
  const text = source.replace(/from\s*(['"])(\.[^'"]*)\1/g, (whole: string, quote: string, spec: string) => {
    const absolute = resolve(oldDir, spec)
    let next = relative(newDir, absolute).split(sep).join('/')
    if (next !== '' && next.startsWith('.') === false) next = './' + next
    count += 1
    return 'from ' + quote + next + quote
  })
  return { text, count }
}

const countOccurrences = (source: string, needle: string) => source.split(needle).length - 1

const mutateRefuseArm = (source: string) => {
  const oldBlock = "      Match.when({ slot: (slot: string) => slot.endsWith('.env') }, () =>\n" +
    "        Result.fail(SlotRefused.make({ why: 'reserved environment file' }))),\n"
  if (countOccurrences(source, oldBlock) !== 1) {
    throw new Error('quartet refuse-arm: expected exactly one refuse block, check harness shape')
  }
  return {
    mutated: source.replace(oldBlock, ''),
    oldText: "Match.when refuse arm returning SlotRefused for '.env' slots (present)",
    newText: 'refuse arm deleted, reserved env-file inputs fall through to tier branches (absent)',
  }
}

const mutateProductionLiteral = (source: string) => {
  const needle = "root: '/var/lib/registry'"
  if (countOccurrences(source, needle) !== 2) {
    throw new Error('quartet production-literal: expected 2 root literals (branch + table)')
  }
  return {
    mutated: source.replace(needle, "root: '/var/lib/registr'"),
    oldText: "'/var/lib/registry' -> '/var/lib/registr' in the production (primary tier) branch",
    newText: "table expectation left at '/var/lib/registry'",
  }
}

const mutateTableLiteral = (source: string) => {
  const needle = "root: '/var/lib/registry'"
  const first = source.indexOf(needle)
  const second = source.indexOf(needle, first + 1)
  if (first === -1 || second === -1 || source.indexOf(needle, second + 1) !== -1) {
    throw new Error('quartet table-literal: expected exactly 2 root literals (branch + table)')
  }
  return {
    mutated: source.slice(0, second) + "root: '/var/lib/registr'" + source.slice(second + needle.length),
    oldText: "'/var/lib/registry' -> '/var/lib/registr' in the published table expectation",
    newText: "production branch left at '/var/lib/registry'",
  }
}

const mutateInverse = (source: string) => {
  const oldLookup = "testCase.expect['root'] === result.success.root"
  if (countOccurrences(source, oldLookup) !== 1) {
    throw new Error('quartet inverse: expected exactly one tier lookup comparison')
  }
  return {
    mutated: source.replace(oldLookup, "testCase.expect['root'] !== result.success.root"),
    oldText: "inverse lookup '===' (result maps back to its own tier input)",
    newText: "inverse lookup '!==' (primary/secondary tiers invert)",
  }
}

const DIRECTIONS = [
  {
    key: 'refuse-arm',
    title: 'refuse-arm deletion',
    mutate: mutateRefuseArm,
  },
  {
    key: 'production-literal',
    title: 'production literal typo',
    mutate: mutateProductionLiteral,
  },
  {
    key: 'table-literal',
    title: 'published table literal typo',
    mutate: mutateTableLiteral,
  },
  {
    key: 'inverse',
    title: 'inverse tier swap',
    mutate: mutateInverse,
  },
]

interface QuartetSabotage {
  restore?: undefined
  direction: (typeof DIRECTIONS)[number]
  oldText: string
  newText: string
  ok: boolean
  laws: string[]
  detail: string
  output: string
}

interface QuartetRestore {
  restore: true
  ok: boolean
  detail: string
  output: string
  laws?: string[]
}

type QuartetObservation = QuartetSabotage | QuartetRestore

const runVitest = (repoRoot: string, entryRel: string) => {
  const result = spawnSync(
    'pnpm',
    ['--filter', PKG, 'exec', 'vitest', 'run', entryRel, '--reporter=verbose'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 },
  )
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  return { status: result.status, output }
}

const LAW_PATTERN = /∀?decideRegistrySlot_[A-Za-z_]+/g
const FAIL_HINT = /FAIL|×|✗|✘|❯|→|AssertionError|expected|failed/i

const extractFailingLaws = (output: string) => {
  const fromFailLines: string[] = []
  for (const line of output.split('\n')) {
    if (FAIL_HINT.test(line) === false) continue
    for (const match of line.match(LAW_PATTERN) ?? []) {
      if (fromFailLines.includes(match) === false) fromFailLines.push(match)
    }
  }
  if (fromFailLines.length > 0) return fromFailLines
  const fallback: string[] = []
  for (const match of output.match(LAW_PATTERN) ?? []) {
    if (fallback.includes(match) === false) fallback.push(match)
  }
  return fallback
}

const extractPassSummary = (output: string) => {
  const lines = output.split('\n').filter((line: string) => /Tests?\s+\d+\s+passed/i.test(line))
  return lines.length > 0 ? lines.join(' / ') : 'vitest exited 0 (pass)'
}

const excerpt = (output: string, limit: number) => {
  const lines = output.split('\n').filter((line: string) => line.trim() !== '')
  const tail = lines.slice(-limit)
  return '```\n' + tail.join('\n').slice(0, 4000) + '\n```'
}

const main = (): void => {
  const repoRoot = findRepoRoot(pkgDir)
  const harnessSource = readFileSync(harnessFile, 'utf8')
  const harnessDir = dirname(harnessFile)

  mkdirSync(scratchDir, { recursive: true })
  writeFileSync(join(scratchDir, '.gitignore'), '*\n')
  mkdirSync(testsScratchDir, { recursive: true })

  const observations: QuartetObservation[] = []
  let failed = false

  try {
    for (const direction of DIRECTIONS) {
      const { mutated, oldText, newText } = direction.mutate(harnessSource)
      const rebased = rebaseRelativeImports(mutated, harnessDir, scratchDir)
      const lawsTarget = resolve(scratchDir, '..', 'laws.js')
      if (existsSync(lawsTarget) === false && existsSync(join(pkgDir, 'src', 'laws.ts')) === false) {
        throw new Error('quartet ' + direction.key + ': rebased laws import does not resolve')
      }
      const scratchFile = join(scratchDir, 'quartet-' + direction.key + '.workflow.ts')
      writeFileSync(scratchFile, rebased.text)
      const entryRel = relative(pkgDir, scratchFile).split(sep).join('/')

      const run = runVitest(repoRoot, entryRel)
      const laws = extractFailingLaws(run.output)
      rmSync(scratchFile, { force: true })

      if (run.status === 0) {
        failed = true
        observations.push({
          direction,
          oldText,
          newText,
          ok: false,
          laws: [],
          detail: 'RED FAILED TO FAIL: vitest exited 0, no law caught the sabotage',
          output: run.output,
        })
        console.error('RED MISSING ' + direction.key + ': vitest passed, expected failure')
        continue
      }
      if (laws.length === 0) {
        failed = true
        observations.push({
          direction,
          oldText,
          newText,
          ok: false,
          laws: [],
          detail: 'RED UNNAMED: vitest failed but no law name was captured',
          output: run.output,
        })
        console.error('RED UNNAMED ' + direction.key + ': failure without a captured law name')
        continue
      }
      observations.push({
        direction,
        oldText,
        newText,
        ok: true,
        laws,
        detail: 'RED (expected failure)',
        output: run.output,
      })
      console.log('RED ' + direction.key + ': ' + laws.join(', ') + ' (rebased ' + rebased.count + ' imports)')
    }

    rmSync(scratchDir, { recursive: true, force: true })
    const restore = runVitest(repoRoot, HARNESS_REL.split(sep).join('/'))
    const restoreLaws = restore.output.match(LAW_PATTERN) ?? []
    if (restore.status !== 0) {
      failed = true
      observations.push({
        restore: true,
        ok: false,
        detail: 'GREEN RESTORATION FAILED: unmutated harness did not pass',
        output: restore.output,
      })
      console.error('GREEN MISSING: unmutated harness failed')
    } else {
      observations.push({
        restore: true,
        ok: true,
        detail: 'GREEN (restoration passes): ' + extractPassSummary(restore.output),
        output: restore.output,
        laws: [...new Set(restoreLaws)],
      })
      console.log('GREEN restoration: ' + extractPassSummary(restore.output))
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }

  const stamp = new Date().toISOString()
  let section = '\n## ' + stamp + ' — sabotage quartet\n\n'
  section += 'Harness: `src/internal/decide-registry-slot.workflow.ts`. '
  section += 'Each direction mutates a scratch copy under `src/.quartet-scratch/` (removed after the run) '
  section += 'and runs `pnpm --filter ' + PKG + ' exec vitest run <scratch-entry>`; '
  section += 'the scratch copy is collected because the package includes in-source tests from `src/**/*.ts`.\n\n'
  let index = 0
  for (const obs of observations) {
    if (obs.restore === true) {
      section += '### 5. restoration (unmutated harness) — ' + (obs.ok ? 'GREEN' : 'RED') + '\n\n'
      section += '- ' + obs.detail + '\n'
      if (obs.laws !== undefined && obs.laws.length > 0) {
        section += '- Laws observed passing: ' + obs.laws.map((law) => '`' + law + '`').join(', ') + '\n'
      }
      section += '\n' + excerpt(obs.output, 12) + '\n\n'
      continue
    }
    index += 1
    section += '### ' + index + '. ' + obs.direction.title + ' — ' + (obs.ok ? 'RED' : 'BROKEN') + '\n\n'
    section += '- Mutation: ' + obs.oldText + '; ' + obs.newText + '.\n'
    if (obs.laws.length > 0) {
      section += '- Failing ' + (obs.laws.length === 1 ? 'law' : 'laws') + ': '
      section += obs.laws.map((law) => '`' + law + '`').join(', ') + '\n'
    } else {
      section += '- Failing law: (none captured)\n'
    }
    section += '- Result: ' + obs.detail + '\n\n' + excerpt(obs.output, 16) + '\n\n'
  }
  appendFileSync(logFile, section)

  if (failed) {
    console.error('quartet: evidence incomplete, see ' + logFile)
    process.exit(1)
  }
  console.log('quartet: 4 red observations + green restoration appended to ' + logFile)
}

main()
