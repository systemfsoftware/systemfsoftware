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

const main = async (): Promise<number> => {
  const args = parseArgs(Deno.args, { string: ['job'] })
  if (args.job === undefined || args.job === '') {
    console.error('usage: job-attempt --job <job-name-suffix> < rows.tsv')
    return 2
  }
  const verdict = ranIn(parseRows(await new Response(Deno.stdin.readable).text()), args.job)
  if (verdict._tag === 'NeverListed') {
    console.error(`no job of this run ends with ${JSON.stringify(args.job)}`)
    return 1
  }
  console.log(`${verdict.attempt}\t${verdict.conclusion}`)
  return 0
}

if (import.meta.main) Deno.exit(await main())
