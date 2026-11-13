#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run --allow-net=api.github.com

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { basename, join, relative, resolve } from '@std/path'

type Tool = 'stryker' | 'cargo-mutants'
type Mode = 'diff' | 'full'
type Scope = 'diff' | 'full' | 'bootstrap'
type Outcome = 'tested' | 'unchanged' | 'deferred' | 'invalid' | 'crash'

export type Counts = {
  readonly tested: number
  readonly killed: number
  readonly survived: number
  readonly noCoverage: number
  readonly timedOut: number
  readonly deferred: number
  readonly compileErrors: number
  readonly runtimeErrors: number
  readonly ignored: number
}

export type Survivor = {
  readonly fingerprint: string
  readonly status: 'Survived' | 'NoCoverage'
  readonly file: string
  readonly line: number
  readonly mutator: string
  readonly symbol: string
  readonly original: string
  readonly replacement: string
}

export type MutationReport = {
  readonly schema: 1
  readonly tool: Tool
  readonly package: string
  readonly dir: string
  readonly commit: string
  readonly base: string | null
  readonly scope: Scope
  readonly outcome: Outcome
  readonly reason: string
  readonly plannedMutants: number
  readonly plannedSeconds: number
  readonly budgetSeconds: number
  readonly durationSeconds: number
  readonly counts: Counts
  readonly killRate: number | null
  readonly timedOutShare: number | null
  readonly survivors: readonly Survivor[]
}

const TIMED_OUT_LIMIT = 0.05

const zeroCounts: Counts = {
  tested: 0,
  killed: 0,
  survived: 0,
  noCoverage: 0,
  timedOut: 0,
  deferred: 0,
  compileErrors: 0,
  runtimeErrors: 0,
  ignored: 0,
}

const repository = Deno.env.get('GITHUB_REPOSITORY') ?? ''
const token = Deno.env.get('GITHUB_TOKEN') ?? ''

const github = async (method: string, path: string, body?: unknown): Promise<unknown> => {
  for (let attempt = 1;; attempt++) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.ok) return response.status === 204 ? null : await response.json()
    const text = await response.text()
    if (attempt < 3 && response.status >= 500) {
      await new Promise((r) => setTimeout(r, attempt * 2000))
      continue
    }
    throw new Error(`GitHub ${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`)
  }
}

type CheckConclusion = 'success' | 'failure' | 'neutral' | 'cancelled'

const postCheck = async (
  sha: string,
  name: string,
  conclusion: CheckConclusion,
  title: string,
  summary: string,
): Promise<void> => {
  const runUrl = `${Deno.env.get('GITHUB_SERVER_URL')}/${repository}/actions/runs/${Deno.env.get('GITHUB_RUN_ID')}`
  await github('POST', `/repos/${repository}/check-runs`, {
    name,
    head_sha: sha,
    status: 'completed',
    conclusion,
    details_url: runUrl,
    output: { title: title.slice(0, 255), summary: summary.slice(0, 60000) },
  })
  console.log(`check ${name} ${conclusion} on ${sha.slice(0, 12)}: ${title}`)
}

const latestCheckConclusion = async (sha: string, name: string): Promise<string | null> => {
  const answer = await github(
    'GET',
    `/repos/${repository}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&filter=latest&per_page=1`,
  ) as { check_runs: { conclusion: string | null; completed_at: string | null }[] }
  return answer.check_runs[0]?.conclusion ?? null
}

type Exit = { readonly code: number; readonly stdout: string }

const run = async (cmd: string, args: readonly string[], cwd: string, capture = false): Promise<Exit> => {
  console.log(`$ (${relative(Deno.cwd(), cwd) || '.'}) ${cmd} ${args.join(' ')}`)
  const child = new Deno.Command(cmd, {
    args: [...args],
    cwd,
    stdout: capture ? 'piped' : 'inherit',
    stderr: 'inherit',
  }).spawn()
  const out = await child.output()
  return { code: out.code, stdout: capture ? new TextDecoder().decode(out.stdout) : '' }
}

const gitStatus = async (label: string): Promise<void> => {
  console.log(`::group::git status --porcelain --ignored (${label})`)
  await run('git', ['status', '--porcelain', '--ignored'], Deno.cwd())
  console.log('::endgroup::')
}

const firstParents = async (sha: string, limit: number): Promise<string[]> => {
  const out = await run('git', ['rev-list', '--first-parent', `--max-count=${limit + 1}`, sha], Deno.cwd(), true)
  if (out.code !== 0) throw new Error(`git rev-list --first-parent ${sha} exited ${out.code}`)
  return out.stdout.split('\n').filter(Boolean).slice(1)
}

export const topLevelSymbols = (source: string): readonly (readonly [number, string])[] => {
  const symbols: [number, string][] = []
  const decl =
    /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/
  let depth = 0
  let i = 0
  let lineStart = true
  const templateDepths: number[] = []
  while (i < source.length) {
    const c = source[i]!
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
      continue
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    if (c === '"' || c === "'") {
      i++
      while (i < source.length && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1
      i++
      lineStart = false
      continue
    }
    if (c === '`' || (c === '}' && templateDepths.at(-1) === depth)) {
      if (c === '}') templateDepths.pop()
      i++
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          templateDepths.push(depth)
          i += 2
          break
        }
        i++
      }
      if (source[i] === '`') i++
      lineStart = false
      continue
    }
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth = Math.max(0, depth - 1)
    if (c === '\n') {
      lineStart = true
      i++
      continue
    }
    if (lineStart && depth === 0 && c !== ' ' && c !== '\t') {
      const m = decl.exec(source.slice(i, i + 300))
      if (m) symbols.push([i, m[1]!])
      lineStart = false
    }
    i++
  }
  return symbols
}

const offsetOf = (source: string, line: number, column: number): number => {
  let offset = 0
  for (let l = 1; l < line; l++) {
    const nl = source.indexOf('\n', offset)
    if (nl === -1) return source.length
    offset = nl + 1
  }
  return offset + column - 1
}

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

const sha256 = async (text: string): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')

type StrykerMutant = {
  readonly id: string
  readonly mutatorName: string
  readonly replacement?: string
  readonly status: string
  readonly location: {
    readonly start: { line: number; column: number }
    readonly end: { line: number; column: number }
  }
}

type StrykerReport = { readonly files: Readonly<Record<string, { source: string; mutants: readonly StrykerMutant[] }>> }

const countsAndSurvivors = async (
  report: StrykerReport,
  pkg: string,
  pkgDir: string,
): Promise<{ counts: Counts; survivors: Survivor[] }> => {
  const tally = { killed: 0, survived: 0, noCoverage: 0, timedOut: 0, compileErrors: 0, runtimeErrors: 0, ignored: 0 }
  const survivors: Survivor[] = []
  for (const [reportPath, file] of Object.entries(report.files)) {
    const absolute = [resolve(pkgDir, reportPath), resolve(reportPath)].find((p) => {
      try {
        return Deno.statSync(p).isFile
      } catch {
        return false
      }
    }) ?? resolve(pkgDir, reportPath)
    const repoPath = relative(Deno.cwd(), absolute)
    const symbols = topLevelSymbols(file.source)
    const seen = new Map<string, number>()
    const ordered = [...file.mutants].sort((a, b) =>
      a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column
    )
    for (const m of ordered) {
      switch (m.status) {
        case 'Killed':
          tally.killed++
          break
        case 'Survived':
          tally.survived++
          break
        case 'NoCoverage':
          tally.noCoverage++
          break
        case 'Timeout':
          tally.timedOut++
          break
        case 'CompileError':
          tally.compileErrors++
          break
        case 'RuntimeError':
          tally.runtimeErrors++
          break
        default:
          tally.ignored++
      }
      if (m.status !== 'Survived' && m.status !== 'NoCoverage') continue
      const start = offsetOf(file.source, m.location.start.line, m.location.start.column)
      const end = offsetOf(file.source, m.location.end.line, m.location.end.column)
      const symbol = symbols.filter(([at]) => at <= start).at(-1)?.[1] ?? '<module>'
      const original = squash(file.source.slice(start, end))
      const replacement = squash(m.replacement ?? '')
      const key = JSON.stringify([pkg, repoPath, m.mutatorName, symbol, original, replacement])
      const rank = seen.get(key) ?? 0
      seen.set(key, rank + 1)
      survivors.push({
        fingerprint: (await sha256(`${key}#${rank}`)).slice(0, 24),
        status: m.status,
        file: repoPath,
        line: m.location.start.line,
        mutator: m.mutatorName,
        symbol,
        original: original.slice(0, 400),
        replacement: replacement.slice(0, 400),
      })
    }
  }
  return {
    counts: { ...zeroCounts, ...tally, tested: tally.killed + tally.survived + tally.timedOut },
    survivors,
  }
}

type Options = {
  readonly tool: Tool
  readonly mode: Mode
  readonly commit: string
  readonly budgetSeconds: number
  readonly walk: number
  readonly out: string
}

type PlanFile = { readonly shards: readonly { predictedSeconds: number; projects: { mutants: string[] }[] }[] }

const findBase = async (pkg: string, commit: string, walk: number): Promise<string | null> => {
  for (const sha of await firstParents(commit, walk)) {
    const conclusion = await latestCheckConclusion(sha, `mutation/${pkg}`)
    if (conclusion === 'success' || conclusion === 'neutral') return sha
  }
  return null
}

const changedPackageDirs = async (base: string): Promise<Set<string>> => {
  const out = await run(
    'corepack',
    ['pnpm', 'list', '--recursive', '--depth', '-1', '--json', '--filter', `...[${base}]`],
    Deno.cwd(),
    true,
  )
  if (out.code !== 0) throw new Error(`pnpm list --filter ...[${base}] exited ${out.code}`)
  const rows = JSON.parse(out.stdout || '[]') as { path: string }[]
  return new Set(rows.map((r) => relative(Deno.cwd(), r.path)))
}

const summaryOf = (r: MutationReport): string => {
  const c = r.counts
  const rate = r.killRate === null ? 'n/a' : `${(r.killRate * 100).toFixed(1)}%`
  const share = r.timedOutShare === null ? 'n/a' : `${(r.timedOutShare * 100).toFixed(1)}%`
  const lines = [
    `**${r.outcome}** (${r.scope}${r.base ? ` since ${r.base.slice(0, 12)}` : ''}): ${r.reason}`,
    '',
    '| tested | killed | survived | noCoverage | timedOut | deferred | kill rate | timedOut share | planned s | budget s |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${c.tested} | ${c.killed} | ${c.survived} | ${c.noCoverage} | ${c.timedOut} | ${c.deferred} | ${rate} | ${share} | ${
      r.plannedSeconds.toFixed(0)
    } | ${r.budgetSeconds} |`,
  ]
  if (r.survivors.length > 0) {
    lines.push(
      '',
      '| fingerprint | status | file:line | mutator | symbol | original -> replacement |',
      '| --- | --- | --- | --- | --- | --- |',
    )
    for (const s of r.survivors.slice(0, 100)) {
      const code = `\`${s.original.slice(0, 60).replaceAll('|', '\\|')}\` -> \`${
        s.replacement.slice(0, 60).replaceAll('|', '\\|')
      }\``
      lines.push(`| ${s.fingerprint} | ${s.status} | ${s.file}:${s.line} | ${s.mutator} | ${s.symbol} | ${code} |`)
    }
  }
  return lines.join('\n')
}

const conclusionOf = (outcome: Outcome): CheckConclusion =>
  outcome === 'crash' ? 'failure' : outcome === 'deferred' ? 'neutral' : outcome === 'invalid' ? 'cancelled' : 'success'

const strykerPackage = async (dir: string, opts: Options): Promise<MutationReport> => {
  const pkg = basename(dir)
  const pkgDir = resolve(dir)
  const outDir = resolve(opts.out, pkg)
  await Deno.mkdir(outDir, { recursive: true })
  const started = Date.now()
  let base: string | null = null
  let scope: Scope = opts.mode
  const report = (fields: Partial<MutationReport> & Pick<MutationReport, 'outcome' | 'reason'>): MutationReport => ({
    schema: 1,
    tool: opts.tool,
    package: pkg,
    dir,
    commit: opts.commit,
    base,
    scope,
    plannedMutants: 0,
    plannedSeconds: 0,
    budgetSeconds: opts.budgetSeconds,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    counts: zeroCounts,
    killRate: null,
    timedOutShare: null,
    survivors: [],
    ...fields,
  })

  if (opts.mode === 'diff') {
    base = await findBase(pkg, opts.commit, opts.walk)
    if (base === null) {
      scope = 'bootstrap'
      console.log(`${pkg}: no green mutation/${pkg} within ${opts.walk} first-parent commits; bootstrapping a full run`)
    } else {
      console.log(`${pkg}: base ${base}`)
      if (!(await changedPackageDirs(base)).has(dir)) {
        return report({ outcome: 'unchanged', reason: `neither ${dir} nor a dependency changed since the base` })
      }
    }
  }

  console.log(`::group::${pkg}: build upstream workspace packages`)
  const build = await run('corepack', ['pnpm', 'exec', 'turbo', 'run', 'build', `--filter=./${dir}^...`], Deno.cwd())
  console.log('::endgroup::')
  if (build.code !== 0) return report({ outcome: 'crash', reason: `upstream build exited ${build.code}` })

  const planFile = join(outDir, 'plan.json')
  const planArgs = ['plan', '--target-seconds', String(opts.budgetSeconds), '--max-shards', '1', '--out', planFile]
  if (scope === 'diff') planArgs.push('--since', base!)
  else planArgs.push('--full')
  const plan = await run('stryker', planArgs, pkgDir)
  if (plan.code !== 0) return report({ outcome: 'crash', reason: `stryker plan exited ${plan.code}` })
  const planned = JSON.parse(await Deno.readTextFile(planFile)) as PlanFile
  const plannedMutants = planned.shards.reduce((n, s) => n + s.projects.reduce((m, p) => m + p.mutants.length, 0), 0)
  const plannedSeconds = planned.shards.reduce((n, s) => n + s.predictedSeconds, 0)
  if (plannedMutants === 0) {
    return report({ outcome: 'unchanged', reason: 'the plan holds no mutant', plannedSeconds })
  }
  if (scope === 'diff' && plannedSeconds > opts.budgetSeconds) {
    return report({
      outcome: 'deferred',
      reason: `planned ${
        plannedSeconds.toFixed(0)
      } s exceeds the ${opts.budgetSeconds} s budget; deferred to the weekly full run`,
      plannedMutants,
      plannedSeconds,
      counts: { ...zeroCounts, deferred: plannedMutants },
    })
  }

  await gitStatus(`${pkg}, before run`)
  const shardDir = join(outDir, 'shards', '1')
  const runExit = await run('stryker', ['run', '--plan', planFile, '--shard', '1/1', '--out', shardDir], pkgDir)
  if (runExit.code !== 0) {
    await gitStatus(`${pkg}, after a failed run`)
    const reason = runExit.code === 2 ? 'stryker run exited 2 (crash)' : `stryker run exited ${runExit.code}`
    return report({ outcome: 'crash', reason, plannedMutants, plannedSeconds })
  }
  const mergedDir = join(outDir, 'merged')
  const merge = await run('stryker', ['merge', '--plan', planFile, '--out', mergedDir, shardDir], pkgDir)
  if (merge.code !== 0) {
    await gitStatus(`${pkg}, after a failed merge`)
    return report({ outcome: 'crash', reason: `stryker merge exited ${merge.code}`, plannedMutants, plannedSeconds })
  }
  for await (const entry of expandGlob('**/stryker-incremental.json', { root: mergedDir })) {
    await Deno.mkdir(join(pkgDir, 'reports'), { recursive: true })
    await Deno.copyFile(entry.path, join(pkgDir, 'reports', 'stryker-incremental.json'))
  }
  const stryker = JSON.parse(await Deno.readTextFile(join(mergedDir, 'mutation.json'))) as StrykerReport
  const { counts, survivors } = await countsAndSurvivors(stryker, pkg, pkgDir)
  const valid = counts.killed + counts.survived + counts.noCoverage + counts.timedOut
  const killRate = valid - counts.timedOut > 0 ? counts.killed / (valid - counts.timedOut) : null
  const timedOutShare = counts.tested > 0 ? counts.timedOut / counts.tested : null
  if (counts.tested === 0) {
    return report({
      outcome: 'crash',
      reason: `the run planned ${plannedMutants} mutants and tested none`,
      plannedMutants,
      plannedSeconds,
      counts,
    })
  }
  const invalid = timedOutShare !== null && timedOutShare > TIMED_OUT_LIMIT
  return report({
    outcome: invalid ? 'invalid' : 'tested',
    reason: invalid
      ? `host starvation: ${counts.timedOut} of ${counts.tested} tested mutants timed out (over ${
        TIMED_OUT_LIMIT * 100
      }%)`
      : `${counts.survived + counts.noCoverage} survivors (report-only)`,
    plannedMutants,
    plannedSeconds,
    counts,
    killRate,
    timedOutShare,
    survivors,
  })
}

const runCommand = async (opts: Options & { packages: readonly string[] }): Promise<number> => {
  if (opts.tool !== 'stryker') {
    console.log(`::error title=mutation-tool-unimplemented::tool '${opts.tool}' is not implemented; only stryker runs`)
    return 1
  }
  const crashed: string[] = []
  const summary: string[] = []
  for (const dir of opts.packages) {
    const pkg = basename(dir)
    console.log(`::group::mutation ${pkg} (${opts.mode})`)
    let r: MutationReport
    try {
      r = await strykerPackage(dir, opts)
    } catch (error) {
      await gitStatus(`${pkg}, after an error`)
      r = {
        schema: 1,
        tool: opts.tool,
        package: pkg,
        dir,
        commit: opts.commit,
        base: null,
        scope: opts.mode,
        outcome: 'crash',
        reason: error instanceof Error ? error.message : String(error),
        plannedMutants: 0,
        plannedSeconds: 0,
        budgetSeconds: opts.budgetSeconds,
        durationSeconds: 0,
        counts: zeroCounts,
        killRate: null,
        timedOutShare: null,
        survivors: [],
      }
    }
    console.log('::endgroup::')
    await Deno.mkdir(join(opts.out, pkg), { recursive: true })
    await Deno.writeTextFile(join(opts.out, pkg, 'report.json'), JSON.stringify(r, null, 2))
    const c = r.counts
    const title =
      `${pkg}: ${r.outcome}; ${c.tested} tested, ${c.killed} killed, ${c.survived} survived, ${c.noCoverage} no coverage, ${c.timedOut} timed out`
    await postCheck(opts.commit, `mutation/${pkg}`, conclusionOf(r.outcome), title, summaryOf(r))
    if (r.outcome === 'crash') {
      crashed.push(pkg)
      console.log(`::error title=mutation-crash ${pkg}::${r.reason}`)
    }
    if (r.outcome === 'invalid') console.log(`::warning title=mutation-invalid ${pkg}::${r.reason}`)
    summary.push(`### ${pkg}\n\n${summaryOf(r)}\n`)
  }
  const stepSummary = Deno.env.get('GITHUB_STEP_SUMMARY')
  if (stepSummary) await Deno.writeTextFile(stepSummary, summary.join('\n'), { append: true })
  if (crashed.length > 0 && opts.mode === 'full') {
    const head = (await github('GET', `/repos/${repository}/commits/${Deno.env.get('DEFAULT_BRANCH') ?? 'main'}`)) as {
      sha: string
    }
    await postCheck(
      head.sha,
      'mutation-health',
      'failure',
      `weekly mutation crashed on ${crashed.join(', ')} (tested ${opts.commit.slice(0, 12)})`,
      `The weekly full mutation run of ${opts.commit} crashed for: ${crashed.join(', ')}. See the run for the cause.`,
    )
  }
  return crashed.length > 0 ? 1 : 0
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ['tool', 'mode', 'packages', 'commit', 'budget-seconds', 'walk', 'out'],
    default: { walk: '200', out: 'mutation-out' },
  })
  const [command] = args._
  if (command !== 'run') {
    console.error(
      'usage: mutation run --tool stryker --mode diff|full --packages <json> --commit <sha> --budget-seconds <n>',
    )
    Deno.exit(2)
  }
  const tool = args.tool as Tool
  const mode = args.mode as Mode
  if (tool !== 'stryker' && tool !== 'cargo-mutants') {
    throw new Error(`--tool must be stryker or cargo-mutants, got ${tool}`)
  }
  if (mode !== 'diff' && mode !== 'full') throw new Error(`--mode must be diff or full, got ${mode}`)
  const packages = JSON.parse(args.packages ?? '[]') as string[]
  if (!Array.isArray(packages) || packages.length === 0) throw new Error('--packages must be a non-empty JSON array')
  if (!args.commit) throw new Error('--commit is required')
  const budgetSeconds = Number(args['budget-seconds'])
  if (!(budgetSeconds > 0)) throw new Error('--budget-seconds must be positive')
  Deno.exit(
    await runCommand({
      tool,
      mode,
      packages,
      commit: args.commit,
      budgetSeconds,
      walk: Number(args.walk),
      out: resolve(args.out),
    }),
  )
}
