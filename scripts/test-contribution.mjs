import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { relative, resolve } from 'node:path'

/**
 * Mutation score is killed/total *mutants* — a property of the mutant set, never of the
 * test set. Adding a test that kills nothing new leaves numerator, denominator, and score
 * untouched, so `break: 100` is satisfiable by tautology and no other gate in this repo can
 * decline a worthless test.
 *
 * Measured 2026-08-01 on omp-claude-compat: two tautological tests (an inequality over three
 * constants declared in the same change; an `fc.constant(30_000)` pinning a constant to
 * itself) scored 100.00 present and 100.00 deleted.
 *
 * The report cannot answer this statically. Stryker stops a mutant at its first failing
 * test, so `killedBy` holds exactly one id for every killed mutant and names whichever test
 * ran first, not every test that would have caught it — measured on this package, all 20
 * killed mutants carry a single killer while `testsCompleted` peaks at 61 of 124. Any
 * "unique kills" figure derived from it is test-ordering noise. `coveredBy` comes from the
 * dry run and is sound, so it is used only to decide scope, never contribution.
 *
 * Contribution is therefore measured the one way it is real: remove the test file, run the
 * gate again, compare the set of killed mutants. If the same mutants die without it, it
 * defends nothing. That costs one mutation run per changed test file, which is why scope is
 * what this change touched rather than the whole suite.
 *
 * Scope is narrow on purpose. Only a colocated `src/X.workflow.property.test.ts` is judged,
 * because only `src/*.workflow.ts` is mutated: a feature or integration test can defend real
 * behaviour in an executor or handler and still kill zero mutants, so "removing it changes
 * nothing" indicts the mutate glob rather than the test. Measured here — dropping
 * `hook-timeout.integration.test.ts`, which holds a SIGKILL regression proven red when its
 * finalizer is gutted, moves no mutant at all.
 *
 * The granularity is the file. A tautology smuggled into a property file that also holds
 * real properties survives this gate; only a wholly worthless file is caught.
 *
 * Stryker exits non-zero whenever the score falls under `break`, which is precisely what a
 * successful probe causes, so its exit status is ignored and the verdict is read from the
 * report it writes either way.
 */

const PROPERTY_SUFFIX = '.property.test.ts'
const REPORT = 'reports/mutation-report.json'

const parseArgs = (argv) => {
  const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  return {
    packageDir: resolve(argv.find((a) => !a.startsWith('--')) ?? '.'),
    since: flag('since'),
    all: argv.includes('--all'),
  }
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

/**
 * Every git read runs from the repo root with an explicit pathspec. `git diff --name-only`
 * prints root-relative paths while `git ls-files` prints them relative to the cwd, so
 * mixing working directories silently drops whichever set was resolved against the wrong
 * base — untracked files vanish through the existence filter and the scope looks smaller
 * than it is.
 */
const changedTestFiles = ({ packageDir, since, all }) => {
  const root = git(['rev-parse', '--show-toplevel'], packageDir).trim()
  const pathspec = relative(root, packageDir) || '.'
  const read = (args) => git([...args, '--', pathspec], root).split('\n')
  const pick = (paths) =>
    [
      ...new Set(
        paths.filter((p) => p !== '' && p.endsWith(PROPERTY_SUFFIX)).map((p) => relative(packageDir, resolve(root, p))),
      ),
    ]
      .filter((p) => !p.startsWith('..') && existsSync(resolve(packageDir, p)))
      .sort()

  if (all) return { base: 'every tracked property test', files: pick(read(['ls-files'])) }

  const untracked = read(['ls-files', '--others', '--exclude-standard'])
  for (const base of since !== undefined ? [since] : ['origin/main', 'main']) {
    try {
      git(['rev-parse', '--verify', '--quiet', base], root)
      return { base, files: pick([...read(['diff', '--name-only', base]), ...untracked]) }
    } catch {
      continue
    }
  }
  return { base: null, files: pick(untracked) }
}

const runMutation = (packageDir) => {
  try {
    execFileSync('pnpm', ['exec', 'stryker', 'run'], { cwd: packageDir, stdio: ['ignore', 'ignore', 'inherit'] })
  } catch {
    // A probe that lets mutants survive drops the score under `break` and exits non-zero.
    // That is the signal, not a failure; the report is written either way and decides.
  }
  const report = JSON.parse(readFileSync(resolve(packageDir, REPORT), 'utf8'))
  const killed = new Set()
  for (const [file, { mutants }] of Object.entries(report.files)) {
    for (const m of mutants) {
      if (m.status === 'Killed' || m.status === 'Timeout') killed.add(`${file}#${m.id}`)
    }
  }
  return { killed, mutatedSources: new Set(Object.keys(report.files)) }
}

const setsEqual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const { packageDir } = args
  const { base, files } = changedTestFiles(args)
  const label = base ?? 'the working tree'

  if (files.length === 0) {
    console.log(`[contribution] no property test changed against ${label} — nothing to measure`)
    return
  }

  console.log(`[contribution] ${files.length} property test(s) changed against ${label}`)
  for (const f of files) console.log(`  ${f}`)

  const reportPath = resolve(packageDir, REPORT)
  const baselineCopy = `${reportPath}.baseline`

  console.log('\n[contribution] baseline')
  const { killed: baseline, mutatedSources } = runMutation(packageDir)
  copyFileSync(reportPath, baselineCopy)

  const sourceOf = (f) => f.slice(0, -PROPERTY_SUFFIX.length) + '.ts'
  const inScope = files.filter((f) => mutatedSources.has(sourceOf(f)))
  for (const f of files) {
    if (!mutatedSources.has(sourceOf(f))) {
      console.log(
        `[contribution] skipping ${f} — ${sourceOf(f)} is outside the mutate glob, nothing to measure against`,
      )
    }
  }
  console.log(`[contribution] baseline kills ${baseline.size} mutants; ${inScope.length} file(s) to probe\n`)

  const freeloaders = []
  try {
    for (const file of inScope) {
      const abs = resolve(packageDir, file)
      const stashed = `${abs}.contribution-stash`
      console.log(`[contribution] without ${file}`)
      renameSync(abs, stashed)
      try {
        const { killed: without } = runMutation(packageDir)
        const lost = [...baseline].filter((m) => !without.has(m))
        if (setsEqual(baseline, without)) freeloaders.push(file)
        console.log(
          `  ${
            lost.length === 0
              ? 'no change — its cell is fully defended without it'
              : `${lost.length} mutant(s) survive without it`
          }\n`,
        )
      } finally {
        renameSync(stashed, abs)
      }
    }
  } finally {
    copyFileSync(baselineCopy, reportPath)
    rmSync(baselineCopy)
  }

  if (freeloaders.length > 0) {
    console.error(`[contribution] ${freeloaders.length} property test file(s) defend nothing:`)
    for (const f of freeloaders) console.error(`  ${f} — every mutant of ${sourceOf(f)} still dies without it`)
    console.error(
      `\nSharpen these until removing one lets a mutant survive, or delete them.\nA passing mutation score is not evidence that a test earns its place.`,
    )
    process.exit(1)
  }
  console.log('[contribution] ok — removing any changed property test lets a mutant survive')
}

main()
