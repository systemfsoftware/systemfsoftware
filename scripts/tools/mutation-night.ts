// mutation-night - the Mutation lane's own night (compound-packs/ci-wall-clock/mutation-runs-nightly-on-main.md).
//
//   mutation-night guard --ref <ref> --default <branch> [--sha <sha>]
//     fails a run off the default branch, or a `sha` the default branch's tip does not contain (:23).
//   mutation-night packages --enrolled <tsv> --packages <json>
//     prints the enrolled rows a dispatch's `packages` names, or fails when it is not a non-empty JSON array of
//     enrolled names (:24).
//   mutation-night base --repo <owner/name> --workflow <file> --branch <branch> --before <run id>
//     prints the commit of the newest scheduled night whose record says green, or nothing when there is none (:26).
//   mutation-night night --repo <r> --workflow <file> --branch <b> --run <id> --sha <sha> --needs <json>
//     --planned <json> --reports <dir> --out <file>
//     writes this night's record, prints the green line or files the red night's fix task as one comment on each
//     candidate merge's pull request, edited in place on later nights (:27-29).
//
// The decisions are pure and exported; the commands are the thin shell that reads git, the GitHub API and files.

import { parseArgs } from '@std/cli/parse-args'
import { expandGlob } from '@std/fs/expand-glob'
import { basename, dirname, join } from '@std/path'

export type GuardVerdict =
  | { readonly _tag: 'Allowed' }
  | {
    readonly _tag: 'Refused'
    readonly reason: 'mutation-off-main' | 'mutation-sha-off-main'
    readonly detail: string
  }

/** `ancestor` is the exit of `git merge-base --is-ancestor -- <sha> origin/<default>`, null when no `sha` is set. */
export const guardVerdictOf = (
  ref: string,
  defaultBranch: string,
  sha: string,
  ancestor: boolean | null,
): GuardVerdict => {
  if (defaultBranch === '' || ref !== defaultBranch) {
    return {
      _tag: 'Refused',
      reason: 'mutation-off-main',
      detail: `the run's ref ${ref || '(none)'} is not the default branch ${defaultBranch || '(unknown)'}`,
    }
  }
  if (sha !== '' && ancestor !== true) {
    return {
      _tag: 'Refused',
      reason: 'mutation-sha-off-main',
      detail: `sha ${sha} is not a commit on ${defaultBranch}'s tip`,
    }
  }
  return { _tag: 'Allowed' }
}

export interface Enrolled {
  readonly label: string
  readonly name: string
}

export type PackagesDecision =
  | { readonly _tag: 'All' }
  | { readonly _tag: 'Named'; readonly rows: readonly Enrolled[] }
  | { readonly _tag: 'Refused'; readonly detail: string }

export const packagesDecisionOf = (enrolled: readonly Enrolled[], raw: string): PackagesDecision => {
  if (raw.trim() === '') return { _tag: 'All' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { _tag: 'Refused', detail: `packages ${raw} is not JSON` }
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((name) => typeof name === 'string')) {
    return { _tag: 'Refused', detail: `packages ${raw} is not a non-empty JSON array of package names` }
  }
  const byName = new Map(enrolled.map((row) => [row.name, row]))
  const unknown = parsed.filter((name) => !byName.has(name))
  if (unknown.length > 0) {
    return { _tag: 'Refused', detail: `packages names ${unknown.join(', ')}, which no package with a mutation task is` }
  }
  return { _tag: 'Named', rows: [...new Set(parsed as string[])].map((name) => byName.get(name)!) }
}

export type Item =
  | {
    readonly _tag: 'Survivor'
    readonly label: string
    readonly id: string
    readonly at: string
    readonly mutator: string
    readonly reproduce: string
  }
  | { readonly _tag: 'Failure'; readonly job: string; readonly reason: string; readonly message: string }

export const keyOf = (item: Item): string =>
  item._tag === 'Survivor' ? `survivor ${item.label} ${item.id}` : `failure ${item.job} ${item.reason}`

export interface Candidate {
  readonly sha: string
  readonly pr: number | null
  readonly author: string | null
}

/** An open fix task: the comment on one pull request, and the items it names. */
export interface Task {
  readonly pr: number
  readonly keys: readonly string[]
}

export interface NightRecord {
  readonly schemaVersion: 1
  readonly run: number
  readonly from: string | null
  readonly to: string
  readonly verdict: 'green' | 'red'
  readonly conclusion: string
  readonly planned: readonly string[]
  readonly reported: readonly string[]
  readonly items: readonly Item[]
  readonly candidates: readonly Candidate[]
  readonly tasks: readonly Task[]
}

/**
 * Where a night's range starts: the last green night's commit, else the previous scheduled night's, so a lane with
 * no green night yet still bounds its candidates; a start this night's commit does not contain is skipped.
 */
export const rangeStartOf = (
  green: string | null,
  previous: string | null,
  contains: (sha: string) => boolean,
): string | null => [green, previous].find((sha): sha is string => sha !== null && contains(sha)) ?? null

/** A run that ended `success` and reported every planned package with no survivor or failure is green. */
export const verdictOf = (
  conclusion: string,
  planned: readonly string[],
  reported: readonly string[],
  items: readonly Item[],
): 'green' | 'red' =>
  conclusion === 'success' && planned.every((label) => reported.includes(label)) && items.length === 0
    ? 'green'
    : 'red'

/** One job conclusion for the run from its jobs' results: any cancellation first, then any failure. */
export const conclusionOf = (results: readonly string[]): string =>
  results.includes('cancelled') ? 'cancelled' : results.includes('failure') ? 'failure' : 'success'

export interface Comment {
  readonly pr: number
  readonly body: string
}

export const MARKER = '<!-- mutation-night -->'

const describe = (item: Item): string =>
  item._tag === 'Survivor'
    ? `- survivor \`${item.id}\` (${item.mutator}) in ${item.label} at \`${item.at}\`; reproduce: \`${item.reproduce}\``
    : `- \`${item.job}\` failed (\`${item.reason}\`): ${item.message}`

/**
 * The fix tasks of a red night. An item an open task already names updates that task and is never filed again; a
 * task none of whose items this night shows says so and closes. Items no task names go to every candidate merge
 * with a pull request, mentioning every candidate's opener, since a lane with no triage never names a culprit.
 */
export const routeOf = (
  runUrl: string,
  range: string,
  previous: readonly Task[],
  items: readonly Item[],
  candidates: readonly Candidate[],
): { readonly tasks: readonly Task[]; readonly comments: readonly Comment[] } => {
  const byKey = new Map(items.map((item) => [keyOf(item), item]))
  const owned = new Set(previous.flatMap((task) => task.keys))
  const fresh = items.map(keyOf).filter((key) => !owned.has(key))
  const authors = [...new Set(candidates.flatMap((c) => (c.author === null ? [] : [`@${c.author}`])))]
  const merges = candidates.map((c) => (c.pr === null ? c.sha.slice(0, 10) : `#${c.pr}`)).join(', ')
  const head = [
    MARKER,
    `Mutation night ${runUrl} (${range}) is red.`,
    `Candidates (attribution ambiguous; the lane has no triage): ${merges || 'none'}. ${authors.join(' ')}`.trimEnd(),
  ]
  const tasks = new Map<number, string[]>()
  const closed = new Map<number, readonly string[]>()
  for (const task of previous) {
    const shown = task.keys.filter((key) => byKey.has(key))
    if (shown.length > 0) tasks.set(task.pr, [...shown])
    else closed.set(task.pr, task.keys)
  }
  if (fresh.length > 0) {
    for (const candidate of candidates) {
      if (candidate.pr === null) continue
      tasks.set(candidate.pr, [...new Set([...(tasks.get(candidate.pr) ?? []), ...fresh])])
      closed.delete(candidate.pr)
    }
  }
  const comments: Comment[] = [...tasks].map(([pr, keys]) => ({
    pr,
    body: [...head, '', ...keys.map((key) => describe(byKey.get(key)!))].join('\n'),
  }))
  for (const [pr, keys] of closed) {
    comments.push({
      pr,
      body: [
        MARKER,
        `Mutation night ${runUrl} (${range}) no longer shows what this task named:`,
        '',
        ...keys.map((key) => `- ${key}`),
      ]
        .join('\n'),
    })
  }
  return { tasks: [...tasks].map(([pr, keys]) => ({ pr, keys })), comments }
}

const objectOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

const arrayOf = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []

/** Survived and NoCoverage mutants of one project's merged report; `stryker gate` rejects both. */
export const survivorsOf = (label: string, report: unknown, reproduce: string): Item[] =>
  Object.entries(objectOf(objectOf(report).files)).flatMap(([file, entry]) =>
    arrayOf(objectOf(entry).mutants).map(objectOf)
      .filter((mutant) => mutant.status === 'Survived' || mutant.status === 'NoCoverage')
      .map((mutant): Item => ({
        _tag: 'Survivor',
        label,
        id: String(mutant.id),
        at: `${file}:${String(objectOf(objectOf(mutant.location).start).line ?? 0)}`,
        mutator: typeof mutant.mutatorName === 'string' ? mutant.mutatorName : 'unknown',
        reproduce,
      }))
  )

const run = async (command: string, args: readonly string[]): Promise<{ code: number; stdout: string }> => {
  const out = await new Deno.Command(command, { args: [...args], stdout: 'piped', stderr: 'inherit' }).output()
  return { code: out.code, stdout: new TextDecoder().decode(out.stdout) }
}

const gh = async (args: readonly string[]): Promise<string> => {
  const out = await run('gh', args)
  if (out.code !== 0) throw new Error(`gh ${args.join(' ')} exited ${out.code}`)
  return out.stdout
}

const recordOf = async (repo: string, id: number): Promise<NightRecord | null> => {
  const dir = await Deno.makeTempDir()
  const out = await run('gh', ['run', 'download', String(id), '-R', repo, '-n', `mutation-night-${id}`, '-D', dir])
  if (out.code !== 0) return null
  try {
    return JSON.parse(await Deno.readTextFile(join(dir, 'night.json'))) as NightRecord
  } catch {
    return null
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
}

interface Night {
  readonly id: number
  readonly sha: string
}

/** Scheduled runs of the workflow on the branch, newest first, completed, other than `before`. */
const nightsOf = async (repo: string, workflow: string, branch: string, before: number): Promise<Night[]> => {
  const text = await gh([
    'api',
    `repos/${repo}/actions/workflows/${workflow}/runs?event=schedule&branch=${branch}&status=completed&per_page=30`,
    '--jq',
    '.workflow_runs[] | "\\(.id) \\(.head_sha)"',
  ])
  return text.split('\n').filter((line) => line !== '').map((line) => {
    const [id, sha] = line.split(' ')
    return { id: Number(id), sha }
  }).filter((night) => night.id !== before)
}

const baseOf = async (repo: string, workflow: string, branch: string, before: number) => {
  const nights = await nightsOf(repo, workflow, branch, before)
  let green: string | null = null
  for (const night of nights) {
    if ((await recordOf(repo, night.id))?.verdict === 'green') {
      green = night.sha
      break
    }
  }
  return { green, previous: nights[0] ?? null }
}

const isAncestor = async (sha: string, of: string): Promise<boolean> =>
  (await run('git', ['merge-base', '--is-ancestor', '--', sha, of])).code === 0

const candidatesOf = async (repo: string, from: string | null, to: string): Promise<Candidate[]> => {
  const shas = from === null
    ? [to]
    : (await run('git', ['rev-list', '--first-parent', `${from}..${to}`, '--'])).stdout.split('\n').filter((s) => s)
  return await Promise.all(shas.map(async (sha) => {
    const text = await gh(['api', `repos/${repo}/commits/${sha}/pulls`, '--jq', '.[0] | "\\(.number) \\(.user.login)"'])
    const [pr, author] = text.trim().split(' ')
    return pr === undefined || pr === '' || pr === 'null'
      ? { sha, pr: null, author: null }
      : { sha, pr: Number(pr), author: author ?? null }
  }))
}

const failuresOf = async (repo: string, id: number): Promise<Item[]> => {
  const jobs = await gh([
    'api',
    '--paginate',
    `repos/${repo}/actions/runs/${id}/jobs?per_page=100`,
    '--jq',
    '.jobs[] | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out") | "\\(.id)\\t\\(.conclusion)\\t\\(.name)"',
  ])
  return await Promise.all(
    jobs.split('\n').filter((line) => line !== '').map(async (line) => {
      const [jobId, conclusion, name] = line.split('\t')
      const notes = await gh([
        'api',
        `repos/${repo}/check-runs/${jobId}/annotations`,
        '--jq',
        '[.[] | select(.annotation_level == "failure" and .title != null and .title != "")][0] | "\\(.title)\\t\\(.message)"',
      ])
      const [title, message] = notes.trim().split('\t')
      return title === undefined || title === '' || title === 'null'
        ? {
          _tag: 'Failure',
          job: name,
          reason: conclusion === 'failure' ? 'unclassified' : 'timed-out',
          message: `concluded ${conclusion}`,
        }
        : { _tag: 'Failure', job: name, reason: title, message: message ?? '' }
    }),
  )
}

/** Every planned project's merged report under `dir`, as `<slug>/mutation.json` at any depth. */
const reportsOf = async (dir: string): Promise<Map<string, unknown>> => {
  const out = new Map<string, unknown>()
  for await (const entry of expandGlob('**/mutation.json', { root: dir })) {
    const parent = basename(dirname(entry.path))
    const slug = parent.startsWith('mutation-report-') ? parent.slice('mutation-report-'.length) : parent
    out.set(slug, JSON.parse(await Deno.readTextFile(entry.path)))
  }
  return out
}

/** Annotates a refusal and names its reason code for the failure summary, which reads `$RUNNER_TEMP/sfs-reason`. */
const refuse = async (reason: string, detail: string): Promise<never> => {
  console.log(`::error title=${reason}::${detail}`)
  const temp = Deno.env.get('RUNNER_TEMP')
  if (temp) await Deno.writeTextFile(join(temp, 'sfs-reason'), `${reason}\n`)
  Deno.exit(1)
}

const main = async (): Promise<void> => {
  const [command, ...rest] = Deno.args
  const args = parseArgs(rest, {
    string: [
      'ref',
      'default',
      'sha',
      'enrolled',
      'packages',
      'repo',
      'workflow',
      'branch',
      'before',
      'run',
      'needs',
      'planned',
      'reports',
      'out',
    ],
    default: { sha: '', packages: '', before: '0' },
  })
  if (command === 'guard') {
    const sha = args.sha ?? ''
    const ancestor = sha === '' ? null : await isAncestor(sha, `origin/${args.default ?? ''}`)
    const verdict = guardVerdictOf(args.ref ?? '', args.default ?? '', sha, ancestor)
    if (verdict._tag === 'Refused') {
      await refuse(verdict.reason, `${verdict.detail}. Mutation runs only on main.`)
    }
    return
  }
  if (command === 'packages') {
    const enrolled = (await Deno.readTextFile(args.enrolled!)).split('\n').filter((line) => line !== '').map((line) => {
      const [label, name] = line.split('\t')
      return { label, name }
    })
    const decision = packagesDecisionOf(enrolled, args.packages ?? '')
    if (decision._tag === 'Refused') {
      return await refuse('mutation-packages-invalid', decision.detail)
    }
    const rows = decision._tag === 'All' ? enrolled : decision.rows
    console.log(rows.map((row) => `${row.label}\t${row.name}`).join('\n'))
    return
  }
  if (command === 'base') {
    const { green } = await baseOf(args.repo!, args.workflow!, args.branch!, Number(args.before))
    console.log(green ?? '')
    return
  }
  if (command === 'night') {
    const repo = args.repo!
    const id = Number(args.run)
    const sha = args.sha!
    const runUrl = `https://github.com/${repo}/actions/runs/${id}`
    const { green, previous } = await baseOf(repo, args.workflow!, args.branch!, id)
    const contained = new Set<string>()
    for (const start of [green, previous?.sha ?? null]) {
      if (start !== null && await isAncestor(start, sha)) contained.add(start)
    }
    const from = rangeStartOf(green, previous?.sha ?? null, (start) => contained.has(start))
    const prior = previous === null ? null : await recordOf(repo, previous.id)
    const needs = JSON.parse(args.needs!) as Record<string, { readonly result: string }>
    const conclusion = conclusionOf(Object.values(needs).map((need) => need.result))
    const planned = JSON.parse(args.planned! || '[]') as readonly {
      readonly slug: string
      readonly label: string
      readonly name: string
    }[]
    const reports = await reportsOf(args.reports!)
    const reported = planned.filter((p) => reports.has(p.slug)).map((p) => p.label)
    const items = [
      ...planned.flatMap((p) =>
        reports.has(p.slug)
          ? survivorsOf(
            p.label,
            reports.get(p.slug),
            `gh workflow run Mutation --ref ${args.branch} -f sha=${sha} -f packages='["${p.name}"]'`,
          )
          : []
      ),
      ...(await failuresOf(repo, id)),
    ]
    const verdict = verdictOf(conclusion, planned.map((p) => p.label), reported, items)
    const range = `${from ?? '(none)'}..${sha}`
    const candidates = await candidatesOf(repo, from, sha)
    const route = verdict === 'green'
      ? routeOf(runUrl, range, prior?.tasks ?? [], [], [])
      : routeOf(runUrl, range, prior?.tasks ?? [], items, candidates)
    const record: NightRecord = {
      schemaVersion: 1,
      run: id,
      from,
      to: sha,
      verdict,
      conclusion,
      planned: planned.map((p) => p.label),
      reported,
      items,
      candidates,
      tasks: route.tasks,
    }
    await Deno.writeTextFile(args.out!, JSON.stringify(record, null, 2) + '\n')
    const summary = Deno.env.get('GITHUB_STEP_SUMMARY')
    const line = verdict === 'green'
      ? `${id} ${from ?? '(none)'}..${sha} green`
      : route.comments.map((c) => `#${c.pr}:\n${c.body}`).join('\n\n')
    if (summary) {
      await Deno.writeTextFile(
        summary,
        (verdict === 'red' ? `Red night ${range} (${conclusion}).\n\n` : '') + line + '\n',
        { append: true },
      )
    }
    for (const comment of route.comments) {
      const existing = (await gh([
        'api',
        '--paginate',
        `repos/${repo}/issues/${comment.pr}/comments?per_page=100`,
        '--jq',
        `.[] | select(.user.login == "github-actions[bot]" and (.body | startswith("${MARKER}"))) | .id`,
      ])).split('\n').find((line) => line !== '')
      const body = JSON.stringify({ body: comment.body })
      const file = await Deno.makeTempFile()
      await Deno.writeTextFile(file, body)
      await gh(
        existing === undefined
          ? ['api', '-X', 'POST', `repos/${repo}/issues/${comment.pr}/comments`, '--input', file]
          : ['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing}`, '--input', file],
      )
      await Deno.remove(file)
    }
    if (verdict === 'red' && route.comments.length === 0) {
      await refuse(
        'mutation-night-unrouted',
        `red night ${range} has no candidate merge with a pull request to carry its fix task; the step summary holds it`,
      )
    }
    return
  }
  throw new Error(`unknown command ${command ?? '(none)'}: expected guard, packages, base or night`)
}

if (import.meta.main) await main()
