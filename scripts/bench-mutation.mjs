#!/usr/bin/env node
/**
 * Mutation throughput benchmark.
 *
 * throughput = (Killed + Survived + Timeout) / wall_seconds
 *
 * Only those three statuses invoke the test runner. Ignored, NoCoverage and CompileError never
 * do, so counting them would let a "speedup" be manufactured by making mutants fail to compile.
 *
 * Measurement is pinned so two runs are comparable:
 *   --force        defeats `incremental` without editing any config. NEVER pass `--incremental
 *                  false`: `--incremental` is a valueless boolean flag, so `false` is parsed as
 *                  the config FILENAME, Stryker dies, and a stale report is read off disk.
 *   --disableBail  every mutant is tested against every test, so two runs do equal work.
 *   --concurrency  pinned; the default (cpuCount - 1) drifts with the host.
 *
 * Usage:
 *   node scripts/bench-mutation.mjs <pkg>...            # measure named packages
 *   node scripts/bench-mutation.mjs --set bench         # the standard 3-package benchmark
 *   node scripts/bench-mutation.mjs --set bench --concurrency 4 --label exp-003
 *   node scripts/bench-mutation.mjs --set bench --repeat 3
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Overhead-dominated / balanced / scale-dominated. A win has to move all three to be real,
 * rather than exploiting one package's shape.
 */
const BENCH_SET = [
  '@systemfsoftware/effect-daemon-spec',
  '@systemfsoftware/stryker-js-core',
  '@systemfsoftware/oxlint-plugin-effect-workflow',
]

const TESTED = new Set(['Killed', 'Survived', 'Timeout'])
const KILLING = new Set(['Killed', 'Timeout'])

const parseArgs = (argv) => {
  const opts = { pkgs: [], concurrency: 11, label: 'baseline', repeat: 1, extra: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--set') {
      if (argv[++i] !== 'bench') throw new Error('only --set bench is defined')
      opts.pkgs.push(...BENCH_SET)
    } else if (a === '--concurrency') opts.concurrency = Number(argv[++i])
    else if (a === '--label') opts.label = argv[++i]
    else if (a === '--repeat') opts.repeat = Number(argv[++i])
    else if (a === '--') opts.extra.push(...argv.slice(i + 1)), (i = argv.length)
    else opts.pkgs.push(a)
  }
  if (opts.pkgs.length === 0) throw new Error('no packages given (use --set bench or name them)')
  if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) throw new Error('bad --concurrency')
  return opts
}

const pkgDirOf = (pkgName) => {
  for (const cfg of fs.globSync('packages/**/package.json', { cwd: ROOT })) {
    if (cfg.includes('node_modules') || cfg.includes('.stryker-tmp')) continue
    try {
      if (JSON.parse(fs.readFileSync(path.join(ROOT, cfg), 'utf8')).name === pkgName) return path.dirname(cfg)
    } catch {}
  }
  throw new Error(`package not found: ${pkgName}`)
}

const reportPathOf = (dir) => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'stryker.config.json'), 'utf8'))
  return path.join(ROOT, dir, cfg.jsonReporter?.fileName ?? 'reports/mutation-report.json')
}

const run = (pkg, opts) =>
  new Promise((resolve) => {
    // Each package's own `mutation` script, NOT `pnpm exec stryker`: the latter resolves to
    // upstream @stryker-mutator/core, which dies on this repo's tsgo-patched tsc with
    // "ts.parseConfigFileTextToJson is not a function". The fork's parse-config-helper is the
    // whole point. pnpm forwards trailing args straight to the script.
    const args = [
      '--filter',
      pkg,
      'run',
      'mutation',
      '--force',
      '--disableBail',
      '--concurrency',
      String(opts.concurrency),
      ...opts.extra,
    ]
    const startedAt = Date.now()
    const child = spawn('pnpm', args, { cwd: ROOT, env: { ...process.env, CI: '1' } })
    let log = ''
    child.stdout.on('data', (d) => (log += d))
    child.stderr.on('data', (d) => (log += d))
    child.on('close', (code) => resolve({ code, log, startedAt, wallMs: Date.now() - startedAt }))
  })

const measureOnce = async (pkg, opts) => {
  const dir = pkgDirOf(pkg)
  const report = reportPathOf(dir)
  const { code, log, startedAt, wallMs } = await run(pkg, opts)

  // A stale report is the single most likely source of a fake result: if the run crashed early,
  // the previous run's report is still sitting on disk and parses perfectly.
  if (!fs.existsSync(report)) {
    return { pkg, error: `no report at ${path.relative(ROOT, report)}`, exitCode: code, wallMs }
  }
  const mtimeMs = fs.statSync(report).mtimeMs
  if (mtimeMs < startedAt) {
    return {
      pkg,
      error: `STALE REPORT: mtime ${new Date(mtimeMs).toISOString()} predates run start ${
        new Date(startedAt).toISOString()
      }`,
      exitCode: code,
      wallMs,
    }
  }

  const r = JSON.parse(fs.readFileSync(report, 'utf8'))
  const statuses = {}
  let tested = 0
  let killed = 0
  let total = 0
  for (const f of Object.values(r.files ?? {})) {
    for (const m of f.mutants ?? []) {
      total++
      statuses[m.status] = (statuses[m.status] ?? 0) + 1
      if (TESTED.has(m.status)) tested++
      if (KILLING.has(m.status)) killed++
    }
  }

  const dry = /Initial test run succeeded\. Ran (\d+) tests in (\d+) seconds \(net ([\d.]+) ms, overhead ([\d.]+) ms\)/
    .exec(log)
  const score = /Final mutation score(?: of)? ([\d.]+)/.exec(log)
  const wallSeconds = wallMs / 1000

  return {
    pkg,
    exitCode: code,
    wallSeconds: Number(wallSeconds.toFixed(2)),
    tested,
    killed,
    total,
    throughput: Number((tested / wallSeconds).toFixed(3)),
    statuses,
    dryRunSeconds: dry ? Number(dry[2]) : null,
    dryRunTests: dry ? Number(dry[1]) : null,
    dryRunNetMs: dry ? Number(Number(dry[3]).toFixed(0)) : null,
    dryRunOverheadMs: dry ? Number(Number(dry[4]).toFixed(0)) : null,
    mutationScore: score ? Number(score[1]) : null,
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const main = async () => {
  const opts = parseArgs(process.argv.slice(2))
  const results = []
  for (const pkg of opts.pkgs) {
    const runs = []
    for (let i = 0; i < opts.repeat; i++) {
      process.stderr.write(`[bench] ${pkg} run ${i + 1}/${opts.repeat} (concurrency=${opts.concurrency}) ...\n`)
      const res = await measureOnce(pkg, opts)
      process.stderr.write(
        `[bench]   ${
          res.error
            ? `ERROR ${res.error}`
            : `${res.wallSeconds}s  tested=${res.tested} killed=${res.killed}  ${res.throughput}/s`
        }\n`,
      )
      runs.push(res)
    }
    const ok = runs.filter((r) => !r.error)
    if (ok.length === 0) {
      results.push({ ...runs[0], repeat: opts.repeat })
      continue
    }
    const tps = ok.map((r) => r.throughput)
    const spread = ok.length > 1 ? (Math.max(...tps) - Math.min(...tps)) / median(tps) : 0
    results.push({
      ...ok[0],
      repeat: opts.repeat,
      throughput: Number(median(tps).toFixed(3)),
      wallSeconds: Number(median(ok.map((r) => r.wallSeconds)).toFixed(2)),
      variance: Number(spread.toFixed(3)),
      runs: ok.length > 1 ? tps : undefined,
    })
  }

  const totalTested = results.reduce((a, r) => a + (r.tested ?? 0), 0)
  const totalWall = results.reduce((a, r) => a + (r.wallSeconds ?? 0), 0)
  const out = {
    label: opts.label,
    at: new Date().toISOString(),
    concurrency: opts.concurrency,
    repeat: opts.repeat,
    packages: results,
    aggregate: {
      tested: totalTested,
      killed: results.reduce((a, r) => a + (r.killed ?? 0), 0),
      wallSeconds: Number(totalWall.toFixed(2)),
      throughput: Number((totalTested / totalWall).toFixed(3)),
    },
  }
  console.log(JSON.stringify(out, null, 2))
}

await main()
