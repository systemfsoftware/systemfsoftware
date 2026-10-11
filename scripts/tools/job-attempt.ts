// job-attempt - name the run attempt in which a job of this workflow run last actually ran, and its conclusion.
//
//   gh api --paginate "repos/$REPO/actions/runs/$RUN/jobs?filter=all&per_page=100" \
//     --jq '.jobs[] | [.name, .run_attempt, .started_at, .conclusion] | @tsv' | job-attempt --job "<suffix>"
//
// A re-run of failed jobs lists every job again under the new attempt, but a job that did not re-run is a copy:
// same `started_at`, no new uploads. So the attempt a job ran in is the lowest attempt among the rows that share
// its newest `started_at`, and an artifact a job uploads under `-a<attempt>` is found under that attempt.
// Prints `<attempt>\t<conclusion>` and exits 0, or names the job on stderr and exits 1 when no row matches.
// `--job` matches the end of the job name, since a caller's job name prefixes the reusable workflow's.
//
// `--artifact <prefix> --artifacts <names-file>` also requires `<prefix>-a<attempt>` among the run's artifact
// names (one per line) and prints it as a third column; when it is absent the tool writes the reason code
// `mutation-artifact-missing` to `--reason-file`, names the job, the attempts examined and the next action on
// stderr, and exits 1.
//
// `--all-succeeded` exits 0 only when every job of the run that has concluded did so with `success` (or
// `skipped`, a job whose matrix was empty) in the attempt it last ran in; otherwise it names those jobs on stderr
// and exits 1. A job with no conclusion yet (the caller itself, and jobs waiting on it) is not judged.

import { parseArgs } from '@std/cli/parse-args'

export interface JobRow {
  readonly name: string
  readonly attempt: number
  readonly startedAt: string
  readonly conclusion: string
}

export type RanIn =
  | { readonly _tag: 'Ran'; readonly attempt: number; readonly conclusion: string }
  | { readonly _tag: 'NeverListed' }

export const parseRows = (tsv: string): readonly JobRow[] =>
  tsv.split('\n').filter((line) => line.length > 0).map((line) => {
    const [name = '', attempt = '', startedAt = '', conclusion = ''] = line.split('\t')
    return { name, attempt: Number(attempt), startedAt, conclusion }
  })

export const ranIn = (rows: readonly JobRow[], jobSuffix: string): RanIn => {
  const own = rows.filter((row) => row.name.endsWith(jobSuffix))
  if (own.length === 0) return { _tag: 'NeverListed' }
  const newest = own.reduce((latest, row) => (row.startedAt > latest ? row.startedAt : latest), own[0]!.startedAt)
  const first = own
    .filter((row) => row.startedAt === newest)
    .reduce((lowest, row) => (row.attempt < lowest.attempt ? row : lowest))
  return { _tag: 'Ran', attempt: first.attempt, conclusion: first.conclusion }
}

export const artifactOf = (
  rows: readonly JobRow[],
  jobSuffix: string,
  prefix: string,
  artifacts: readonly string[],
): { readonly _tag: 'Found'; readonly name: string } | { readonly _tag: 'Missing'; readonly examined: number[] } => {
  const verdict = ranIn(rows, jobSuffix)
  const examined = [...new Set(rows.filter((row) => row.name.endsWith(jobSuffix)).map((row) => row.attempt))]
    .sort((a, b) => a - b)
  if (verdict._tag === 'NeverListed') return { _tag: 'Missing', examined }
  const name = `${prefix}-a${verdict.attempt}`
  return artifacts.includes(name) ? { _tag: 'Found', name } : { _tag: 'Missing', examined }
}

/** Concluded jobs whose newest real run was neither `success` nor `skipped`. */
export const unsuccessful = (rows: readonly JobRow[]): readonly string[] =>
  [...new Set(rows.map((row) => row.name))]
    .filter((name) => {
      const verdict = ranIn(rows.filter((row) => row.name === name), name)
      return verdict._tag === 'Ran' && verdict.conclusion !== '' && verdict.conclusion !== 'success' &&
        verdict.conclusion !== 'skipped'
    })
    .sort()

const main = async (): Promise<number> => {
  const args = parseArgs(Deno.args, {
    string: ['job', 'artifact', 'artifacts', 'reason-file'],
    boolean: ['all-succeeded'],
  })
  const rows = parseRows(await new Response(Deno.stdin.readable).text())
  if (args['all-succeeded']) {
    const failed = unsuccessful(rows)
    if (failed.length === 0) return 0
    console.error(`not every job concluded success: ${failed.join(', ')}`)
    return 1
  }
  if (args.job === undefined || args.job === '') {
    console.error('usage: job-attempt --job <job-name-suffix> [--artifact <prefix> --artifacts <file>] < rows.tsv')
    return 2
  }
  const verdict = ranIn(rows, args.job)
  if (verdict._tag === 'NeverListed') {
    console.error(`no job of this run ends with ${JSON.stringify(args.job)}`)
    return 1
  }
  if (args.artifact !== undefined && args.artifact !== '') {
    const names = args.artifacts === undefined ? [] : (await Deno.readTextFile(args.artifacts)).split('\n')
    const found = artifactOf(rows, args.job, args.artifact, names)
    if (found._tag === 'Missing') {
      if (args['reason-file'] !== undefined) {
        await Deno.writeTextFile(args['reason-file'], 'mutation-artifact-missing\n')
      }
      console.error(
        `mutation-artifact-missing: job ${JSON.stringify(args.job)} left no artifact ${args.artifact}-a<attempt> ` +
          `in the attempt it last ran in (attempts examined: ${found.examined.join(', ') || 'none'}). ` +
          `Next: re-run that job so it uploads its artifact, then re-run this one.`,
      )
      return 1
    }
    console.log(`${verdict.attempt}\t${verdict.conclusion}\t${found.name}`)
    return 0
  }
  console.log(`${verdict.attempt}\t${verdict.conclusion}`)
  return 0
}

if (import.meta.main) Deno.exit(await main())
