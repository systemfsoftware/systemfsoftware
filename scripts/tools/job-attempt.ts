// job-attempt - name the run attempt in which a job of this workflow run last actually ran, and its conclusion.
//
//   gh api --paginate "repos/$REPO/actions/runs/$RUN/jobs?filter=all&per_page=100" \
//     --jq '.jobs[] | [.name, .run_attempt, .started_at, .conclusion] | @tsv' | job-attempt --job "<suffix>"
//
// A re-run of failed jobs lists every job again under the new attempt, but a job that did not re-run is a copy:
// same `started_at`, no new uploads. So the attempt a job ran in is the lowest attempt among the rows that share
// its newest `started_at`. Prints `<attempt>\t<conclusion>` and exits 0, or names the job on stderr and exits 1
// when no row matches. `--job` matches the end of the job name, since a caller's job name prefixes the reusable
// workflow's.
//
// `--artifact <prefix> --artifacts <file> --reason-file <file>` also finds `<prefix>-a<attempt>` among the run's
// unexpired artifacts (`<file>` holds `<name>\t<expired>` lines), searching every attempt the job is listed in,
// newest first, and prints it as a third column. When none of them holds it the tool writes
// `mutation-artifact-missing` to the reason file, names the job and the attempts it searched on stderr, and
// exits 1. `--artifact` without `--artifacts`, or a names file it cannot read, writes `mutation-tool-misused`.
//
// `--all-succeeded` exits 0 only when the run lists at least one job and every concluded job did so with
// `success` (or `skipped`, a job whose matrix was empty) in the attempt it last ran in; an empty list, or any
// other conclusion, exits 1 naming the cause. A job with no conclusion yet (the caller itself, and jobs waiting
// on it) is not judged.

import { parseArgs } from '@std/cli/parse-args'

export interface JobRow {
  readonly name: string
  readonly attempt: number
  readonly startedAt: string
  readonly conclusion: string
}

export interface ArtifactRow {
  readonly name: string
  readonly expired: boolean
}

export type RanIn =
  | { readonly _tag: 'Ran'; readonly attempt: number; readonly conclusion: string }
  | { readonly _tag: 'NeverListed' }

export type ArtifactLookup =
  | { readonly _tag: 'Found'; readonly name: string }
  | { readonly _tag: 'Missing'; readonly searched: readonly number[] }

export type RunVerdict =
  | { readonly _tag: 'AllSucceeded' }
  | { readonly _tag: 'NoJobs' }
  | { readonly _tag: 'Unsuccessful'; readonly jobs: readonly string[] }

export const parseRows = (tsv: string): readonly JobRow[] =>
  tsv.split('\n').filter((line) => line.length > 0).map((line) => {
    const [name = '', attempt = '', startedAt = '', conclusion = ''] = line.split('\t')
    return { name, attempt: Number(attempt), startedAt, conclusion }
  })

export const parseArtifacts = (tsv: string): readonly ArtifactRow[] =>
  tsv.split('\n').filter((line) => line.length > 0).map((line) => {
    const [name = '', expired = ''] = line.split('\t')
    return { name, expired: expired === 'true' }
  })

const ownRows = (rows: readonly JobRow[], jobSuffix: string): readonly JobRow[] =>
  rows.filter((row) => row.name.endsWith(jobSuffix))

export const ranIn = (rows: readonly JobRow[], jobSuffix: string): RanIn => {
  const own = ownRows(rows, jobSuffix)
  const [head] = own
  if (head === undefined) return { _tag: 'NeverListed' }
  const newest = own.reduce((latest, row) => (row.startedAt > latest ? row.startedAt : latest), head.startedAt)
  const first = own
    .filter((row) => row.startedAt === newest)
    .reduce((lowest, row) => (row.attempt < lowest.attempt ? row : lowest))
  return { _tag: 'Ran', attempt: first.attempt, conclusion: first.conclusion }
}

/** The job's artifact from the newest attempt it is listed in that still holds an unexpired one. */
export const artifactOf = (
  rows: readonly JobRow[],
  jobSuffix: string,
  prefix: string,
  artifacts: readonly ArtifactRow[],
): ArtifactLookup => {
  const live = artifacts.filter((artifact) => !artifact.expired).map((artifact) => artifact.name)
  const searched = [...new Set(ownRows(rows, jobSuffix).map((row) => row.attempt))].sort((a, b) => b - a)
  const attempt = searched.find((candidate) => live.includes(`${prefix}-a${candidate}`))
  return attempt === undefined ? { _tag: 'Missing', searched } : { _tag: 'Found', name: `${prefix}-a${attempt}` }
}

export const runVerdict = (rows: readonly JobRow[]): RunVerdict => {
  if (rows.length === 0) return { _tag: 'NoJobs' }
  const jobs = [...new Set(rows.map((row) => row.name))]
    .filter((name) => {
      const verdict = ranIn(rows.filter((row) => row.name === name), name)
      return verdict._tag === 'Ran' && verdict.conclusion !== '' && verdict.conclusion !== 'success' &&
        verdict.conclusion !== 'skipped'
    })
    .sort()
  return jobs.length === 0 ? { _tag: 'AllSucceeded' } : { _tag: 'Unsuccessful', jobs }
}

const USAGE = 'usage: job-attempt (--all-succeeded | --job <suffix> ' +
  '[--artifact <prefix> --artifacts <file> --reason-file <file>]) < rows.tsv'

const writeReason = async (reasonFile: string | undefined, code: string): Promise<void> => {
  if (reasonFile !== undefined && reasonFile !== '') await Deno.writeTextFile(reasonFile, `${code}\n`)
}

const readRows = async (): Promise<readonly JobRow[]> => parseRows(await new Response(Deno.stdin.readable).text())

const main = async (): Promise<number> => {
  const args = parseArgs(Deno.args, {
    string: ['job', 'artifact', 'artifacts', 'reason-file'],
    boolean: ['all-succeeded'],
  })
  const reasonFile = args['reason-file']
  const wantsArtifact = args.artifact !== undefined && args.artifact !== ''
  if (args['all-succeeded']) {
    const verdict = runVerdict(await readRows())
    if (verdict._tag === 'AllSucceeded') return 0
    console.error(
      verdict._tag === 'NoJobs'
        ? 'the run lists no jobs, so nothing proves every job passed'
        : `not every job concluded success: ${verdict.jobs.join(', ')}`,
    )
    return 1
  }
  if (args.job === undefined || args.job === '') {
    console.error(USAGE)
    return 2
  }
  if (wantsArtifact && (args.artifacts === undefined || args.artifacts === '')) {
    await writeReason(reasonFile, 'mutation-tool-misused')
    console.error(`mutation-tool-misused: --artifact needs --artifacts. ${USAGE}`)
    return 2
  }
  const artifacts = wantsArtifact
    ? await Deno.readTextFile(args.artifacts ?? '').then(parseArtifacts, () => undefined)
    : []
  if (artifacts === undefined) {
    await writeReason(reasonFile, 'mutation-tool-misused')
    console.error(`mutation-tool-misused: cannot read the artifact names file ${JSON.stringify(args.artifacts)}`)
    return 1
  }
  const rows = await readRows()
  const verdict = ranIn(rows, args.job)
  if (verdict._tag === 'NeverListed') {
    console.error(`no job of this run ends with ${JSON.stringify(args.job)}`)
    return 1
  }
  if (!wantsArtifact) {
    console.log(`${verdict.attempt}\t${verdict.conclusion}`)
    return 0
  }
  const found = artifactOf(rows, args.job, args.artifact ?? '', artifacts)
  if (found._tag === 'Missing') {
    await writeReason(reasonFile, 'mutation-artifact-missing')
    console.error(
      `mutation-artifact-missing: job ${JSON.stringify(args.job)} left no unexpired artifact ` +
        `${args.artifact}-a<attempt> (attempts searched: ${found.searched.join(', ')}). ` +
        'Next: re-run that job so it uploads its artifact, then re-run this one.',
    )
    return 1
  }
  console.log(`${verdict.attempt}\t${verdict.conclusion}\t${found.name}`)
  return 0
}

if (import.meta.main) Deno.exit(await main())
