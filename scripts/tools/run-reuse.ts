import { parseArgs } from '@std/cli/parse-args'

export interface Reuse {
  readonly reused: number
  readonly ran: number
  readonly refused: Readonly<Record<string, number>>
}

export type PriorVerdict =
  | { readonly _tag: 'NothingToRead' }
  | { readonly _tag: 'Read'; readonly named: number; readonly reuse: Reuse }
  | { readonly _tag: 'NoReuseReport'; readonly named: number }
  | { readonly _tag: 'Unread'; readonly named: number; readonly reuse: Reuse }

export interface Digests {
  readonly testClosureDigest: string
  readonly runInputsDigest: string
}

export type CoverageVerdict =
  | { readonly _tag: 'Reused' }
  | { readonly _tag: 'Unreused'; readonly coverage: Digests | undefined; readonly run: Digests | undefined }

/** A test the dry run flagged; `firstPass` is its status in the one pass the record keeps, `undefined` when it ran only in the second. */
export interface FlakyTest {
  readonly id: string
  readonly firstPass: string | undefined
}

const objectOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

const arrayOf = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []

const countOf = (value: unknown): number => typeof value === 'number' && Number.isInteger(value) ? value : 0

const stringsOf = (value: unknown): readonly string[] =>
  arrayOf(value).filter((item): item is string => typeof item === 'string')

export const shardIdsOf = (plan: unknown, index: number): ReadonlySet<string> =>
  new Set(
    arrayOf(objectOf(plan).shards)
      .filter((shard) => objectOf(shard).index === index)
      .flatMap((shard) => arrayOf(objectOf(shard).projects).flatMap((project) => stringsOf(objectOf(project).mutants))),
  )

export const recordIdsOf = (record: unknown): ReadonlySet<string> =>
  new Set(
    Object.values(objectOf(objectOf(record).files)).flatMap((file) =>
      arrayOf(objectOf(file).mutants).flatMap((mutant) => {
        const id = objectOf(mutant).id
        return typeof id === 'string' ? [id] : []
      })
    ),
  )

export const reuseOf = (stream: string): Reuse | undefined => {
  const event = stream.split('\n').flatMap((line) => {
    if (line.trim() === '') return []
    try {
      const parsed = objectOf(JSON.parse(line))
      return parsed._tag === 'reuse' ? [parsed] : []
    } catch {
      return []
    }
  })[0]
  if (event === undefined) return undefined
  const refused = Object.fromEntries(Object.entries(objectOf(event.refused)).map(([reason, n]) => [reason, countOf(n)]))
  return { reused: countOf(event.reused), ran: countOf(event.ran), refused }
}

export const priorVerdictOf = (
  planned: ReadonlySet<string>,
  prior: ReadonlySet<string>,
  reuse: Reuse | undefined,
): PriorVerdict => {
  const named = [...planned].filter((id) => prior.has(id)).length
  if (named === 0) return { _tag: 'NothingToRead' }
  if (reuse === undefined) return { _tag: 'NoReuseReport', named }
  const unread = reuse.reused === 0 && reuse.ran > 0 && (reuse.refused.noPriorRecord ?? 0) === reuse.ran
  return unread ? { _tag: 'Unread', named, reuse } : { _tag: 'Read', named, reuse }
}

export const digestsOf = (record: unknown): Digests | undefined => {
  const coverage = objectOf(objectOf(record).dryRunCoverage)
  const { testClosureDigest, runInputsDigest } = coverage
  return typeof testClosureDigest === 'string' && typeof runInputsDigest === 'string'
    ? { testClosureDigest, runInputsDigest }
    : undefined
}

export const coverageVerdictOf = (coverage: Digests | undefined, run: Digests | undefined): CoverageVerdict =>
  coverage !== undefined && run !== undefined && coverage.testClosureDigest === run.testClosureDigest &&
    coverage.runInputsDigest === run.runInputsDigest
    ? { _tag: 'Reused' }
    : { _tag: 'Unreused', coverage, run }

export const flakyTestsOf = (record: unknown): readonly FlakyTest[] => {
  const coverage = objectOf(objectOf(record).dryRunCoverage)
  const firstPass = new Map(
    arrayOf(coverage.tests).flatMap((test) => {
      const { id, status } = objectOf(test)
      return typeof id === 'string' ? [[id, typeof status === 'string' ? status : 'unknown']] as const : []
    }),
  )
  return [...new Set(stringsOf(coverage.flakyTestIds))].sort().map((id) => ({ id, firstPass: firstPass.get(id) }))
}

const reuseLineOf = (reuse: Reuse): string => {
  const reasons = Object.entries(reuse.refused).filter(([, n]) => n > 0).map(([reason, n]) => `${reason} ${n}`)
  return `reused ${reuse.reused}, ran ${reuse.ran}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`
}

const cellOf = (text: string): string => text.replaceAll('|', '\\|')

const flakyDetailsOf = (label: string, flaky: readonly FlakyTest[]): string =>
  [
    `<details><summary>${label}: ${flaky.length} flaky tests</summary>`,
    '',
    'Stryker re-runs every mutant these tests cover (`flakyDependency`), and every static mutant while any test is ' +
    'flaky. A test is flaky when its status or the mutants it covers differ between the two passes of the dry run. ' +
    'The record keeps only the first pass, so a test with a first-pass status changed status or covered other ' +
    'mutants in the second pass, and a test without one ran only in the second.',
    '',
    '| Test | First pass |',
    '| --- | --- |',
    ...flaky.map((test) => `| ${cellOf(test.id)} | ${test.firstPass ?? 'absent'} |`),
    '',
    '</details>',
    '',
  ].join('\n')

const digestsTextOf = (digests: Digests | undefined): string =>
  digests === undefined
    ? 'no dry-run coverage'
    : `test closure ${digests.testClosureDigest}, run inputs ${digests.runInputsDigest}`

const USAGE = 'usage: run-reuse --plan <plan.json> --shard <k> --prior <record.json> ' +
  '--stream <mutation-stream.jsonl> --record <record.json> [--coverage <record.json>] ' +
  '[--label <text>] [--details <file>] [--reason-file <file>]'

const textOf = (path: string): Promise<string | undefined> =>
  path === '' ? Promise.resolve(undefined) : Deno.readTextFile(path).catch(() => undefined)

const jsonOf = (text: string): { readonly value: unknown } | undefined => {
  try {
    return { value: JSON.parse(text) }
  } catch {
    return undefined
  }
}

const main = async (): Promise<number> => {
  const args = parseArgs(Deno.args, {
    string: ['plan', 'shard', 'prior', 'stream', 'record', 'coverage', 'label', 'details', 'reason-file'],
  })
  const shard = Number(args.shard)
  const required = [args.plan, args.prior, args.stream, args.record]
  if (required.some((value) => value === undefined || value === '') || !(shard >= 1)) {
    console.error(USAGE)
    return 2
  }
  const failures: [code: string, message: string][] = []
  const misused = (what: string, path: string | undefined): void => {
    failures.push([
      'mutation-tool-misused',
      `mutation-tool-misused: cannot read ${what} ${JSON.stringify(path)}. ${USAGE}`,
    ])
  }
  const plan = jsonOf(await textOf(args.plan ?? '') ?? '')
  const record = jsonOf(await textOf(args.record ?? '') ?? '')
  const coverageText = args.coverage === undefined ? undefined : await textOf(args.coverage)
  const coverage = coverageText === undefined ? undefined : jsonOf(coverageText)
  if (plan === undefined) misused('the plan', args.plan)
  if (record === undefined) misused("the run's record", args.record)
  if (args.coverage !== undefined && coverage === undefined) misused('the coverage record', args.coverage)

  const parts: string[] = []
  if (plan !== undefined) {
    const planned = shardIdsOf(plan.value, shard)
    const priorText = await textOf(args.prior ?? '')
    const prior = priorText === undefined ? undefined : jsonOf(priorText)
    if (priorText === undefined) parts.push('no prior record')
    else if (prior === undefined) {
      failures.push([
        'mutation-prior-unread',
        `mutation-prior-unread: the prior record ${JSON.stringify(args.prior)} is not JSON, so stryker read none ` +
        'of it. Next: delete the stryker-incremental cache entry this job restored and re-run the workflow.',
      ])
    } else {
      const verdict = priorVerdictOf(planned, recordIdsOf(prior.value), reuseOf(await textOf(args.stream ?? '') ?? ''))
      if (verdict._tag === 'NothingToRead') {
        parts.push(`the prior record names none of the ${planned.size} planned mutants`)
      } else if (verdict._tag === 'Read') {
        parts.push(`${reuseLineOf(verdict.reuse)}; the prior record names ${verdict.named} of ${planned.size}`)
      } else {
        failures.push([
          'mutation-prior-unread',
          verdict._tag === 'NoReuseReport'
            ? `mutation-prior-unread: ${JSON.stringify(args.stream)} holds no reuse event, so nothing shows the run ` +
              `read the prior record that names ${verdict.named} of its ${planned.size} planned mutants. ` +
              'Next: read the run log for why stryker stopped before planning its mutants.'
            : `mutation-prior-unread: the prior record ${JSON.stringify(args.prior)} names ${verdict.named} of the ` +
              `${planned.size} planned mutants, yet the run found a record for none (${reuseLineOf(verdict.reuse)}). ` +
              "Next: make the project's stryker config read that file: it must be the incremental file or match an " +
              '`incrementalSources` pattern, such as `reports/stryker-incremental-*.json`.',
        ])
      }
    }
  }
  if (record !== undefined) {
    const flaky = flakyTestsOf(record.value)
    parts.push(`flaky tests ${flaky.length}`)
    if (flaky.length > 0 && args.details !== undefined && args.details !== '') {
      await Deno.writeTextFile(args.details, flakyDetailsOf(args.label ?? '', flaky), { append: true })
    }
    if (coverage !== undefined) {
      const verdict = coverageVerdictOf(digestsOf(coverage.value), digestsOf(record.value))
      if (verdict._tag === 'Reused') parts.push('dry run reused from the coverage job')
      else {
        failures.push([
          'mutation-coverage-unreused',
          "mutation-coverage-unreused: the shard ran its own dry run instead of reusing the coverage job's, " +
          `because its digests differ (coverage: ${digestsTextOf(verdict.coverage)}; shard: ` +
          `${digestsTextOf(verdict.run)}). Both jobs check out one commit, so a file one of them wrote under the ` +
          "project entered Stryker's digest, and the same file re-runs the project's unchanged mutants on every " +
          "run. Next: list the project's untracked files with `git status --short --ignored <project>` and keep " +
          "them out of the digest: the project's stryker config must set no `ignorePatterns` of its own, so " +
          '`sharedConfig` ignores `reports/` and `coverage/`.',
        ])
      }
    }
  }

  const [first] = failures
  if (first === undefined) {
    console.log(parts.join('; '))
    return 0
  }
  const reasonFile = args['reason-file']
  if (reasonFile !== undefined && reasonFile !== '') await Deno.writeTextFile(reasonFile, `${first[0]}\n`)
  for (const [, message] of failures) console.error(message)
  return 1
}

if (import.meta.main) Deno.exit(await main())
