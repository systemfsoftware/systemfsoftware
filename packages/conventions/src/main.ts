#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  composeGritYaml,
  type EnforcementLevel,
  namespaceConsumerRule,
  parsePatternMarkdown,
  type Rule,
} from './compose.js'
import { gatedFindings, parseEngineReport, renderFindings, summarize } from './scan.js'
import { isGlob, selectFiles } from './select.js'

const USAGE = `conventions — a composable, GritQL-first conventions gate

usage: conventions scan [--rules <path>...] [--ignore <glob>...] [--level error|warn|info] [roots-or-files...]

  --rules    a .md or .grit pattern file, or a directory of them, composed into the same scan
  --ignore   a path prefix, prefix/** — excluded from selection
  --level    findings at or above this level fail the run (default: error)

  A positional containing glob characters (* ? [) is a root: it is walked for
  tsconfig.json-style targets. Otherwise it is a literal file path.

exit codes: 0 clean · 1 findings · 2 broken instrument (never green)`

const TARGET_BASENAMES = ['tsconfig.json']

const rulesDir = (): string => path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'rules')

const loadRulesFromDir = (dir: string, transform: (rule: Rule) => Rule = (rule) => rule): readonly Rule[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.grit')))
    .map((entry) => transform(parsePatternMarkdown(fs.readFileSync(path.join(dir, entry.name), 'utf8'), entry.name)))

const loadRulesFromPath = (input: string): readonly Rule[] => {
  const resolved = path.resolve(process.cwd(), input)
  if (fs.statSync(resolved).isDirectory()) return loadRulesFromDir(resolved, namespaceConsumerRule)
  const source = path.basename(resolved)
  const raw = fs.readFileSync(resolved, 'utf8')
  const markdown = source.endsWith('.grit') ? `# ${source}\n\n\`\`\`grit\n${raw}\n\`\`\`\n` : raw
  return [namespaceConsumerRule(parsePatternMarkdown(markdown, source))]
}

/** PATH `grit` first (nix devShell, global installs), then the pinned launcher's bin. */
const resolveEngine = (): string | undefined => {
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (dir === '') continue
    const candidate = path.join(dir, 'grit')
    try {
      if (fs.statSync(candidate).isFile() && fs.accessSync(candidate, fs.constants.X_OK) === undefined) return candidate
    } catch {
      // not present on this PATH entry — keep walking
    }
  }
  try {
    const require = createRequire(import.meta.url)
    const launcherDir = path.dirname(require.resolve('@getgrit/cli/package.json'))
    const bin = path.join(launcherDir, '..', '.bin', 'grit')
    if (fs.existsSync(bin)) return bin
  } catch {
    // launcher not installed — fall through to the loud failure
  }
  return undefined
}

interface ParsedArgs {
  readonly rules: readonly string[]
  readonly ignores: readonly string[]
  readonly level: EnforcementLevel
  readonly positionals: readonly string[]
}

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const rules: string[] = []
  const ignores: string[] = []
  const positionals: string[] = []
  let level: EnforcementLevel = 'error'
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) break
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`)
      process.exit(0)
    }
    const value = argv[index + 1]
    if (arg === '--rules') {
      if (value === undefined) throw new Error('--rules requires a path')
      rules.push(value)
      index += 1
    } else if (arg === '--ignore') {
      if (value === undefined) throw new Error('--ignore requires a glob')
      ignores.push(value)
      index += 1
    } else if (arg === '--level') {
      if (value !== 'error' && value !== 'warn' && value !== 'info') {
        throw new Error(`--level must be error|warn|info, got ${value}`)
      }
      level = value
      index += 1
    } else {
      positionals.push(arg)
    }
  }
  return { rules, ignores, level, positionals }
}

const main = (): number => {
  const argv = process.argv.slice(2)
  const args = parseArgs(argv[0] === 'scan' ? argv.slice(1) : argv)
  let yaml: string
  try {
    const bundled = loadRulesFromDir(rulesDir())
    const consumer = args.rules.flatMap(loadRulesFromPath)
    yaml = composeGritYaml([...bundled, ...consumer])
  } catch (composeError) {
    process.stderr.write(`conventions: ${String(composeError)}\n`)
    return 2
  }
  const globPositionals = args.positionals.filter(isGlob)
  const filePositionals = args.positionals.filter((positional) => !isGlob(positional))
  const selected = [
    ...filePositionals.map((file) => path.resolve(process.cwd(), file)),
    ...globPositionals.flatMap((root) =>
      TARGET_BASENAMES.flatMap((target) =>
        selectFiles({ roots: [root], target, ignores: args.ignores, cwd: process.cwd() })
      )
    ),
  ]
  const uniqueSelected = [...new Set(selected)]
  if (globPositionals.length > 0 && uniqueSelected.length === 0) {
    process.stdout.write(`${summarize(0, [])}\n`)
    return 2
  }
  if (uniqueSelected.length === 0) {
    process.stdout.write(`${summarize(0, [])}\n`)
    return 0
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'conventions-'))
  try {
    const configDir = path.join(workspace, '.grit')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'grit.yaml'), yaml)

    const engine = resolveEngine()
    if (engine === undefined) {
      process.stderr.write(
        'conventions: no grit engine found. Resolution chain: PATH grit -> @getgrit/cli launcher bin.\n' +
          'Fix: install the grit engine on PATH (e.g. a nix devShell), or install @getgrit/cli with its postinstall allowed.\n',
      )
      return 2
    }
    const run = spawnSync(engine, ['check', '--json', '--no-cache', ...uniqueSelected], {
      cwd: workspace,
      encoding: 'utf8',
    })
    if (run.error !== undefined) {
      process.stderr.write(`conventions: engine failed to start (${run.error.message})\n`)
      return 2
    }
    if (process.env['CONVENTIONS_DEBUG_DUMP'] === '1') {
      process.stdout.write(
        `[debug] engine=${engine} workspace=${workspace} status=${String(run.status)} stderr=${
          run.stderr.slice(0, 400)
        }\n`,
      )
    }
    const findings = parseEngineReport(run.stderr)
    const gated = gatedFindings(findings, args.level)
    for (const line of renderFindings(gated)) process.stdout.write(`${line}\n`)
    process.stdout.write(`${summarize(uniqueSelected.length, gated)}\n`)
    if (run.status !== 0 && run.status !== null && findings.length === 0) {
      process.stderr.write(
        `conventions: engine exited ${run.status} with no findings — treated as a broken instrument\n`,
      )
      return 2
    }
    return gated.length > 0 ? 1 : 0
  } finally {
    if (process.env['CONVENTIONS_DEBUG_KEEP'] !== '1') fs.rmSync(workspace, { recursive: true, force: true })
  }
}

process.exitCode = main()
