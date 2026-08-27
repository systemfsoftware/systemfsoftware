#!/usr/bin/env node
// CI-only. Merges one Stryker JSON report per package from a mutation matrix
// run into a single report: files/testFiles keys prefixed by module, mutant and
// test ids rewritten so killedBy/coveredBy resolve inside the merged report.
// The exit code is never a function of a mutation score or of a part outcome:
// the gate is advisory, the verdicts live in the summary. This is a pointer to
// AGENTS.md (Surface Classes -> Evaluator), not a read of it.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { aggregateResultsByModule, calculateMetrics } from 'mutation-testing-metrics'

const USAGE = `Usage:
  node scripts/tools/merge-mutation-reports.mjs --parts <dir> --out <dir> [--packages <json-array>]
  node scripts/tools/merge-mutation-reports.mjs --selftest

--packages falls back to the PACKAGES env var, then to no missing-package check.`

const SURVIVOR_STATUSES = new Set(['Survived', 'NoCoverage'])
const SURVIVOR_CAP = 100

const parseArgs = (argv) => {
  const opts = { packages: undefined, parts: undefined, out: undefined, selftest: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--selftest') opts.selftest = true
    else if (flag === '--parts' || flag === '--out' || flag === '--packages') {
      opts[flag.slice(2)] = argv[i + 1]
      i += 1
    } else {
      console.error(`merge-mutation-reports: unknown flag ${flag}\n`)
      console.error(USAGE)
      process.exit(1)
    }
  }
  return opts
}

// A part is any directory holding a readable mutation-part.json. The download
// layout of the artifacts varies: one artifact per part extracts each into its
// own subdirectory, a single-artifact download may land its files directly
// under the parts directory, and a zip rooted at the repo checkout nests them
// under the package path. Walking for the marker file accepts every layout.
const findPartDirs = (dir) => {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort(byName)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...findPartDirs(path))
    else if (entry.name === 'mutation-part.json') found.push(dir)
  }
  return found
}

const byName = (a, b) => a.name.localeCompare(b.name)

const readParts = (partsDir) => {
  const parts = []
  const skipped = []
  for (const dir of findPartDirs(partsDir)) {
    let meta
    try {
      meta = JSON.parse(readFileSync(join(dir, 'mutation-part.json'), 'utf8'))
    } catch {
      skipped.push(dir)
      continue
    }
    parts.push({ dir, label: meta.package, outcome: meta.outcome })
  }
  return { parts, skipped }
}

const labelsOf = (parts) => {
  const seen = new Set()
  const duplicates = []
  const unique = []
  for (const part of parts) {
    if (seen.has(part.label)) duplicates.push(part.label)
    else {
      seen.add(part.label)
      unique.push(part)
    }
  }
  return { parts: unique, duplicates }
}

const mergeParts = (parts) => {
  const merged = aggregateResultsByModule(Object.fromEntries(parts.map((part) => [part.label, part.report])))
  // aggregate.js reads resultsByModule[0], undefined for a string-keyed object,
  // so it would otherwise emit {high: 80, low: 60} and mis-band the HTML.
  merged.thresholds = parts[0].report.thresholds
  return merged
}

const reportFromStream = (text) => {
  const files = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.kind !== 'mutant') continue
    const file = event.file ?? 'unknown'
    if (files[file] === undefined) {
      files[file] = { language: 'javascript', source: '', mutants: [] }
    }
    files[file].mutants.push({
      id: String(event.id),
      mutatorName: event.mutator,
      replacement: event.replacement,
      status: event.status,
      location: event.location,
    })
  }
  if (Object.keys(files).length === 0) return undefined
  return { schemaVersion: '1.0', thresholds: { high: 100, low: 80, break: 100 }, files }
}

const verdictOf = ({ metrics, outcome, incomplete }) => {
  if (incomplete) {
    if (outcome !== 'success') return { score: 'incomplete', verdict: '❌' }
    return { score: 'incomplete', verdict: '⚠️' }
  }
  if (metrics === undefined) return { score: 'no report', verdict: '⚠️' }
  if (Number.isNaN(metrics.mutationScore)) return { score: 'n/a', verdict: '⚠️' }
  if (outcome !== 'success') return { score: metrics.mutationScore.toFixed(2), verdict: '❌' }
  if (metrics.mutationScore === 100) return { score: '100.00', verdict: '✅' }
  return { score: metrics.mutationScore.toFixed(2), verdict: '❌' }
}

const missingPackages = (parts, packages) => {
  if (!packages) return []
  const present = new Set(parts.map((part) => part.label))
  return packages.filter((name) => !present.has(name))
}

const survivorsOf = (merged) => {
  if (!merged) return []
  const mutants = []
  for (const [file, fileResult] of Object.entries(merged.files)) {
    for (const mutant of fileResult.mutants) {
      if (SURVIVOR_STATUSES.has(mutant.status)) mutants.push({ file, mutant })
    }
  }
  return mutants.sort(
    (a, b) => a.file.localeCompare(b.file) || a.mutant.location.start.line - b.mutant.location.start.line,
  )
}

const formatSurvivor = ({ file, mutant }) =>
  `- \`${file}:${mutant.location.start.line}:${mutant.location.start.column}\` ${mutant.status} \`${mutant.mutatorName}\` → \`${mutant.replacement}\``

const summaryOf = ({ merged, partsDir, rows, skipped, unreadableCount }) => {
  const packageRows = rows.filter((row) => row.label !== '**all**')
  const lines = [
    '## Mutation',
    '',
    `Merged ${
      packageRows.filter((row) => row.score !== 'no report').length
    } of ${packageRows.length} package report(s).`,
    '',
    '| package | score | killed | survived | no cov | timeout | compile err | verdict |',
    '| --- | --: | --: | --: | --: | --: | --: | :-: |',
    ...rows.map((row) => `| ${row.label} | ${row.score} | ${row.cells.join(' | ')} | ${row.verdict} |`),
  ]
  const survivors = survivorsOf(merged)
  if (survivors.length > 0) {
    lines.push('', '### Survivors', '')
    lines.push(...survivors.slice(0, SURVIVOR_CAP).map(formatSurvivor))
    if (survivors.length > SURVIVOR_CAP) {
      lines.push(`- … and ${survivors.length - SURVIVOR_CAP} more; see mutation-report.html in the run artifact.`)
    }
  }
  if (skipped.length > 0) {
    lines.push('', '### Warnings', '')
    for (const name of skipped) lines.push(`- \`${partsDir}/${name}\`: no readable mutation-part.json`)
  }
  if (unreadableCount > 0) lines.push('', `Report exited non-zero: ${unreadableCount} unreadable part(s).`)
  return `${lines.join('\n')}\n`
}

const reportHtml = (report, bundle) =>
  `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Mutation report</title><script>${bundle}</script></head>
<body>
<mutation-test-report-app titlePostfix="systemfsoftware"></mutation-test-report-app>
<script>
const app = document.querySelector('mutation-test-report-app')
app.report = ${JSON.stringify(report).replace(/</g, '<"+"')}
const updateTheme = () => { document.body.style.backgroundColor = app.themeBackgroundColor }
app.addEventListener('theme-changed', updateTheme)
updateTheme()
</script>
</body>
</html>`

const run = () => {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.parts || !opts.out) {
    console.error(USAGE)
    process.exit(1)
  }
  let packages
  const packagesRaw = opts.packages ?? process.env.PACKAGES
  if (packagesRaw) {
    try {
      packages = JSON.parse(packagesRaw)
      if (!Array.isArray(packages)) throw new Error('not an array')
    } catch {
      console.error(`merge-mutation-reports: --packages is not a JSON array: ${packagesRaw}`)
      process.exit(1)
    }
  }
  if (!existsSync(opts.parts)) {
    console.error(`merge-mutation-reports: no such parts directory ${opts.parts}`)
    process.exit(1)
  }
  const { parts, skipped } = readParts(opts.parts)
  if (parts.length === 0) {
    console.error(`merge-mutation-reports: no mutation report parts under ${opts.parts}`)
    process.exit(1)
  }
  const { parts: labelled, duplicates } = labelsOf(parts)
  if (duplicates.length > 0) {
    console.error(`merge-mutation-reports: duplicate package ${duplicates[0]}`)
    process.exit(1)
  }
  const withReport = []
  const unreadable = []
  for (const part of labelled) {
    let reportText
    try {
      reportText = readFileSync(join(part.dir, 'mutation-report.json'), 'utf8')
    } catch {
      let streamText = ''
      try {
        streamText = readFileSync(join(part.dir, 'mutation-stream.jsonl'), 'utf8')
      } catch {
        continue
      }
      const reconstructed = reportFromStream(streamText)
      if (reconstructed === undefined) continue
      part.report = reconstructed
      part.incomplete = true
      withReport.push(part)
      continue
    }
    try {
      part.report = JSON.parse(reportText)
      withReport.push(part)
    } catch {
      unreadable.push(part)
    }
  }
  const missing = missingPackages(labelled, packages)
  const merged = withReport.length > 0 ? mergeParts(withReport) : undefined
  const rows = []
  if (merged) {
    const allMetrics = calculateMetrics(merged.files).metrics
    const all = verdictOf({ metrics: allMetrics, outcome: 'success' })
    rows.push({
      label: '**all**',
      score: all.score,
      cells: [
        allMetrics.killed,
        allMetrics.survived,
        allMetrics.noCoverage,
        allMetrics.timeout,
        allMetrics.compileErrors,
      ],
      verdict: all.verdict,
    })
  }
  const byLabel = new Map(labelled.map((part) => [part.label, part]))
  for (const label of [...labelled.map((part) => part.label), ...missing].sort()) {
    const part = byLabel.get(label)
    const metrics = part?.report ? calculateMetrics(part.report.files).metrics : undefined
    const verdict = verdictOf({ metrics, outcome: part?.outcome, incomplete: part?.incomplete })
    const cells = metrics
      ? [metrics.killed, metrics.survived, metrics.noCoverage, metrics.timeout, metrics.compileErrors]
      : ['—', '—', '—', '—', '—']
    rows.push({ label, score: verdict.score, cells, verdict: verdict.verdict })
  }
  mkdirSync(opts.out, { recursive: true })
  if (merged) {
    writeFileSync(join(opts.out, 'mutation-report.json'), JSON.stringify(merged))
    const require = createRequire(import.meta.url)
    const bundle = readFileSync(require.resolve('mutation-testing-elements/dist/mutation-test-elements.js'), 'utf8')
    writeFileSync(join(opts.out, 'mutation-report.html'), reportHtml(merged, bundle))
  }
  const summary = summaryOf({ merged, partsDir: opts.parts, rows, skipped, unreadableCount: unreadable.length })
  writeFileSync(join(opts.out, 'summary.md'), summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  process.stdout.write(summary)
  if (unreadable.length > 0) {
    console.error(`merge-mutation-reports: ${unreadable.length} unreadable part(s)`)
    process.exit(1)
  }
}

const syntheticReport = () => ({
  schemaVersion: '1.7',
  thresholds: { high: 100, low: 80, break: 100 },
  projectRoot: 'synthetic',
  files: {
    'src/a.ts': {
      language: 'ts',
      source: 'const a = true',
      mutants: [
        {
          id: '0',
          mutatorName: 'BooleanLiteral',
          replacement: 'false',
          status: 'Killed',
          location: { start: { line: 1, column: 7 }, end: { line: 1, column: 11 } },
          killedBy: ['0'],
        },
      ],
    },
  },
  testFiles: {
    'src/a.test.ts': { tests: [{ id: '0', name: 'test a', status: 'Killing' }] },
  },
})

const selftest = () => {
  const failures = []

  // 1: module-prefixed keys, unique ids, killedBy resolving into testFiles.
  const merged = mergeParts([{ label: 'x', report: syntheticReport() }, { label: 'y', report: syntheticReport() }])
  const fileKeys = Object.keys(merged.files)
  const modulePrefixes = fileKeys.map((key) => key.split('/')[0]).sort()
  const mutantIds = fileKeys.flatMap((key) => merged.files[key].mutants.map((mutant) => mutant.id))
  const testIds = Object.values(merged.testFiles).flatMap((testFile) => testFile.tests.map((test) => test.id))
  const killedByResolves = fileKeys.every((key) => testIds.includes(merged.files[key].mutants[0].killedBy[0]))
  if (fileKeys.length !== 2 || modulePrefixes.join() !== 'x,y' || new Set(mutantIds).size !== 2 || !killedByResolves) {
    failures.push(
      `merge: expected two module-prefixed keys x/,y/ with 2 unique ids and resolving killedBy, got ${fileKeys.join()}/${
        new Set(mutantIds).size
      } unique ids`,
    )
  }

  // 2: the step-7 threshold override, not upstream's {high: 80, low: 60}.
  if (merged.thresholds.break !== 100 || merged.thresholds.low !== 80 || merged.thresholds.high !== 100) {
    failures.push(`thresholds: expected {high: 100, low: 80, break: 100}, got ${JSON.stringify(merged.thresholds)}`)
  }

  // 3: a part with no testFiles merges without throwing and adds no key.
  const reportNoTests = syntheticReport()
  delete reportNoTests.testFiles
  const mergedNoTests = mergeParts([{ label: 'x', report: reportNoTests }])
  if (mergedNoTests.testFiles !== undefined) {
    failures.push('no-testFiles merge: expected no testFiles key on the merged report')
  }

  // 4: score 100 + success -> green.
  const green = verdictOf({ metrics: { mutationScore: 100 }, outcome: 'success' })
  if (green.verdict !== '✅' || green.score !== '100.00') {
    failures.push(`verdict 100+success: expected ✅/100.00, got ${green.verdict}/${green.score}`)
  }

  // 5: score 100 + failure -> red (test contribution can fail a perfect score).
  const red = verdictOf({ metrics: { mutationScore: 100 }, outcome: 'failure' })
  if (red.verdict !== '❌') failures.push(`verdict 100+failure: expected ❌, got ${red.verdict}`)

  // 6: absent report and NaN score -> warning cells.
  const absent = verdictOf({ outcome: 'failure' })
  const nan = verdictOf({ metrics: { mutationScore: NaN }, outcome: 'success' })
  if (absent.verdict !== '⚠️' || absent.score !== 'no report') {
    failures.push(`verdict absent: expected ⚠️/no report, got ${absent.verdict}/${absent.score}`)
  }
  if (nan.verdict !== '⚠️' || nan.score !== 'n/a') {
    failures.push(`verdict NaN: expected ⚠️/n/a, got ${nan.verdict}/${nan.score}`)
  }

  // 7: duplicate labels surface through labelsOf.
  const labelled = labelsOf([{ label: 'x' }, { label: 'y' }, { label: 'x' }])
  if (labelled.duplicates.join() !== 'x' || labelled.parts.length !== 2) {
    failures.push(
      `labelsOf: expected duplicate x and 2 unique parts, got ${labelled.duplicates.join()}/${labelled.parts.length}`,
    )
  }

  // 8: 101 survivors cap at 100 bullets plus the "and N more" line.
  const big = syntheticReport()
  big.files['src/a.ts'].mutants = []
  for (let i = 0; i < 101; i += 1) {
    big.files['src/a.ts'].mutants.push({
      id: String(i),
      mutatorName: 'Block',
      replacement: '{}',
      status: 'Survived',
      location: { start: { line: i + 1, column: 1 }, end: { line: i + 1, column: 1 } },
    })
  }
  const summary = summaryOf({
    merged: mergeParts([{ label: 'x', report: big }]),
    partsDir: 'parts',
    rows: [{ label: '**all**', score: '0.00', cells: ['0', '101', '0', '0', '0'], verdict: '❌' }],
    skipped: [],
    unreadableCount: 0,
  })
  const bullets = summary.split('\n').filter((line) => line.startsWith('- `'))
  if (bullets.length !== 100 || !summary.includes('- … and 1 more; see mutation-report.html in the run artifact.')) {
    failures.push(`survivors cap: expected 100 bullets plus the more-line, got ${bullets.length} bullets`)
  }

  const fromStream = reportFromStream(
    '{"kind":"stream"}\n{"kind":"mutant","id":"m1","status":"Killed","file":"src/a.ts","mutator":"BooleanLiteral","replacement":"false","location":{"start":{"line":1,"column":1},"end":{"line":1,"column":5}}}\n{torn',
  )
  const incomplete = verdictOf({
    metrics: calculateMetrics(fromStream.files).metrics,
    outcome: 'failure',
    incomplete: true,
  })
  if (
    fromStream?.files['src/a.ts']?.mutants.length !== 1 ||
    incomplete.score !== 'incomplete' ||
    incomplete.verdict !== '❌'
  ) {
    failures.push(
      `stream reconstruct: expected 1 mutant and incomplete/❌, got ${
        fromStream?.files['src/a.ts']?.mutants.length
      }/${incomplete.score}/${incomplete.verdict}`,
    )
  }
  if (reportFromStream('') !== undefined) {
    failures.push('empty stream: expected no reconstruction')
  }

  if (failures.length > 0) {
    console.error('merge-mutation-reports: selftest FAILED\n')
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }
  console.log('merge-mutation-reports: selftest ok (10 fixtures)')
}

// Entry point. Runs only when executed directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selftest')) selftest()
  else run()
}

export { labelsOf, mergeParts, missingPackages, reportFromStream, summaryOf, verdictOf }
