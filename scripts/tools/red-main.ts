import { parseArgs } from '@std/cli/parse-args'

export type Verdict = 'culprit' | 'already-red' | 'undecided'

export interface RunState {
  readonly status: string
  readonly conclusion: string | null
}

export interface FailedJob {
  readonly job: string
  readonly name: string
  readonly reason: string | null
}

export interface PullRequest {
  readonly number: number
  readonly author: string | null
  readonly mergedBy: string | null
}

export type PrLookup = 'ok' | 'refused' | 'none'

export interface Facts {
  readonly repository: string
  readonly defaultBranch: string
  readonly workflowRef: string
  readonly commit: { readonly sha: string; readonly message: string }
  readonly firstParents: readonly string[]
  readonly runs: Readonly<Record<string, RunState>>
  readonly failedJobs: readonly FailedJob[]
  readonly pr: PullRequest | null
  readonly prLookup: PrLookup
}

export interface Revert {
  readonly git: string
  readonly ghPr: string
}

export interface RedMainResult {
  readonly version: 1
  readonly verdict: Verdict
  readonly reason: string | null
  readonly workflow: string | null
  readonly commit: { readonly sha: string; readonly subject: string } | null
  readonly firstRed: string | null
  readonly firstRedExact: boolean | null
  readonly pr: PullRequest | null
  readonly notices: readonly string[]
  readonly failedJobs: readonly FailedJob[]
  readonly verdictReason: boolean
  readonly isRevert: boolean
  readonly revert: Revert | null
  readonly message: string
}

const WORKFLOW_MARKER = '.github/workflows/'
const MALFORMED_REASON = 'culprit-lookup-failed'
const PR_REFUSED = 'the pull request read was refused'
const NO_PR = 'no associated pull request'

export const REUSABLE_WORKFLOWS: Readonly<Record<string, true>> = {
  'reusable-checks.yml': true,
  'reusable-nix.yml': true,
  'reusable-commitlint.yml': true,
  'reusable-mutation.yml': true,
}

export const VERDICT_REASONS: Readonly<Record<string, true>> = {
  'test-failed': true,
  'lane-failed': true,
  'build-failed': true,
  'hook-verdict-failed': true,
  'nix-eval-failed': true,
  'nix-build-failed': true,
  'outputs-differ-across-systems': true,
  'mutation-failed': true,
}

export const deriveWorkflowFile = (workflowRef: string): string | null => {
  const at = workflowRef.indexOf(WORKFLOW_MARKER)
  if (at === -1) return null
  let tail = workflowRef.slice(at + WORKFLOW_MARKER.length)
  const hash = tail.indexOf('@')
  if (hash !== -1) tail = tail.slice(0, hash)
  const slash = tail.lastIndexOf('/')
  const name = slash === -1 ? tail : tail.slice(slash + 1)
  return name === '' ? null : name
}

export const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

const firstLine = (message: string): string => {
  const newline = message.indexOf('\n')
  return newline === -1 ? message : message.slice(0, newline)
}

const REVERT_SUBJECT = /^revert(\([^)]*\))?!?:/i
const REVERT_TRAILER = /^Reverts: [0-9a-f]{7,40}$/im

const isRevert = (subject: string, message: string): boolean =>
  REVERT_SUBJECT.test(subject) || subject.startsWith('Revert "') || REVERT_TRAILER.test(message)

const shortSha = (sha: string): string => sha.slice(0, 7)

const gitCommand = (facts: Facts, revertSubject: string): string =>
  `git fetch origin ${facts.defaultBranch}` +
  ` && git switch -c revert-${shortSha(facts.commit.sha)} origin/${facts.defaultBranch}` +
  ` && git revert --no-commit ${facts.commit.sha}` +
  ` && git commit -m ${shellQuote(revertSubject)} -m ${shellQuote(`Reverts: ${facts.commit.sha}`)}`

const ghPrCommand = (facts: Facts, revertSubject: string, pr: PullRequest | null): string => {
  const sha = facts.commit.sha
  const body = pr === null
    ? `Revert ${sha}: main went red at ${sha}`
    : `Revert ${sha} (PR #${pr.number}): main went red at ${sha}`
  return `gh pr create -R ${facts.repository} --base ${facts.defaultBranch}` +
    ` --head revert-${shortSha(sha)} --title ${shellQuote(revertSubject)} --body ${shellQuote(body)}`
}

const resolvePr = (facts: Facts, subject: string): { pr: PullRequest | null; notices: string[] } => {
  if (facts.prLookup === 'ok') {
    return facts.pr === null ? { pr: null, notices: [NO_PR] } : { pr: facts.pr, notices: [] }
  }
  if (facts.prLookup === 'refused') {
    const match = /\(#(\d+)\)\s*$/.exec(subject)
    if (match === null || match[1] === undefined) return { pr: null, notices: [PR_REFUSED, NO_PR] }
    return { pr: { number: Number(match[1]), author: null, mergedBy: null }, notices: [PR_REFUSED] }
  }
  return { pr: null, notices: [NO_PR] }
}

export const decide = (facts: Facts): RedMainResult => {
  const workflow = deriveWorkflowFile(facts.workflowRef)
  const subject = firstLine(facts.commit.message)
  const commit = { sha: facts.commit.sha, subject }
  const failedJobs = facts.failedJobs
  const verdictReason = failedJobs.some(
    (job) => job.reason !== null && Object.hasOwn(VERDICT_REASONS, job.reason),
  )
  const common = {
    version: 1 as const,
    workflow,
    commit,
    failedJobs,
    verdictReason,
    isRevert: isRevert(subject, facts.commit.message),
  }

  const undecided = (reason: string): RedMainResult => ({
    ...common,
    verdict: 'undecided',
    reason,
    firstRed: null,
    firstRedExact: null,
    pr: null,
    notices: [],
    revert: null,
    message: reason,
  })

  if (workflow === null || Object.hasOwn(REUSABLE_WORKFLOWS, workflow)) return undecided('culprit-workflow-unknown')

  const parent: string | undefined = facts.firstParents[0]
  if (parent === undefined) return undecided('parent-run-missing')
  const parentRun: RunState | undefined = facts.runs[parent]
  if (parentRun === undefined) return undecided('parent-run-missing')
  if (parentRun.status !== 'completed') return undecided('parent-run-in-progress')
  if (parentRun.conclusion === 'success') {
    const { pr, notices } = resolvePr(facts, subject)
    const revertSubject = `revert: ${subject}`
    return {
      ...common,
      verdict: 'culprit',
      reason: null,
      firstRed: null,
      firstRedExact: null,
      pr,
      notices,
      revert: { git: gitCommand(facts, revertSubject), ghPr: ghPrCommand(facts, revertSubject, pr) },
      message: `culprit ${facts.commit.sha}`,
    }
  }
  if (parentRun.conclusion !== 'failure') return undecided('parent-run-inconclusive')

  let lastFailed = parent
  let index = 1
  while (index < facts.firstParents.length) {
    const sha: string | undefined = facts.firstParents[index]
    if (sha === undefined) break
    const run: RunState | undefined = facts.runs[sha]
    if (run === undefined || run.status !== 'completed' || run.conclusion !== 'failure') break
    lastFailed = sha
    index++
  }
  let exact = false
  if (index < facts.firstParents.length) {
    const sha: string | undefined = facts.firstParents[index]
    const run: RunState | undefined = sha === undefined ? undefined : facts.runs[sha]
    exact = run !== undefined && run.status === 'completed' && run.conclusion === 'success'
  }
  return {
    ...common,
    verdict: 'already-red',
    reason: null,
    firstRed: lastFailed,
    firstRedExact: exact,
    pr: null,
    notices: [],
    revert: null,
    message: exact ? `main already red since ${lastFailed}` : `main already red since at or before ${lastFailed}`,
  }
}

export const parseFacts = (raw: unknown): Facts | undefined => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const { repository, defaultBranch, workflowRef, commit, firstParents, runs, failedJobs, pr, prLookup } = o
  if (typeof repository !== 'string' || typeof defaultBranch !== 'string' || typeof workflowRef !== 'string') {
    return undefined
  }
  if (typeof commit !== 'object' || commit === null || Array.isArray(commit)) return undefined
  const { sha, message } = commit as Record<string, unknown>
  if (typeof sha !== 'string' || typeof message !== 'string') return undefined
  if (!Array.isArray(firstParents) || !firstParents.every((entry) => typeof entry === 'string')) return undefined
  if (typeof runs !== 'object' || runs === null || Array.isArray(runs)) return undefined
  if (!Array.isArray(failedJobs)) return undefined
  if (prLookup !== 'ok' && prLookup !== 'refused' && prLookup !== 'none') return undefined

  let resolvedPr: PullRequest | null = null
  if (pr !== null && pr !== undefined) {
    if (typeof pr !== 'object' || Array.isArray(pr)) return undefined
    const e = pr as Record<string, unknown>
    if (typeof e.number !== 'number') return undefined
    resolvedPr = {
      number: e.number,
      author: typeof e.author === 'string' ? e.author : null,
      mergedBy: typeof e.mergedBy === 'string' ? e.mergedBy : null,
    }
  }

  const state: Record<string, RunState> = {}
  for (const [key, value] of Object.entries(runs as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const e = value as Record<string, unknown>
    state[key] = {
      status: typeof e.status === 'string' ? e.status : '',
      conclusion: typeof e.conclusion === 'string' ? e.conclusion : null,
    }
  }

  const jobs: FailedJob[] = []
  for (const value of failedJobs) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const e = value as Record<string, unknown>
    jobs.push({
      job: typeof e.job === 'string' ? e.job : '',
      name: typeof e.name === 'string' ? e.name : '',
      reason: typeof e.reason === 'string' ? e.reason : null,
    })
  }

  return {
    repository,
    defaultBranch,
    workflowRef,
    commit: { sha, message },
    firstParents: firstParents as string[],
    runs: state,
    failedJobs: jobs,
    pr: resolvedPr,
    prLookup,
  }
}

const malformed = (): RedMainResult => ({
  version: 1,
  verdict: 'undecided',
  reason: MALFORMED_REASON,
  workflow: null,
  commit: null,
  firstRed: null,
  firstRedExact: null,
  pr: null,
  notices: [],
  failedJobs: [],
  verdictReason: false,
  isRevert: false,
  revert: null,
  message: MALFORMED_REASON,
})

export const decideFromJson = (raw: unknown): RedMainResult => {
  const facts = parseFacts(raw)
  return facts === undefined ? malformed() : decide(facts)
}

const deMention = (text: string): string => text.replaceAll('@', '@\u200b')
const fence = (body: string, language = ''): string => `\`\`\`${language}\n${body}\n\`\`\``

export const renderMarkdown = (result: RedMainResult): string => {
  const lines: string[] = [`## red-main — ${result.verdict}`, '']
  if (result.commit !== null) {
    lines.push(fence(deMention(result.commit.subject)), '')
  }
  lines.push(`- verdict: ${result.verdict}`)
  lines.push(`- reason: ${result.reason ?? 'none'}`)
  lines.push(`- workflow: ${result.workflow ?? 'unknown'}`)
  lines.push(`- commit: ${result.commit?.sha ?? 'unknown'}`)
  lines.push(`- verdict-reason: ${result.verdictReason ? 'yes' : 'no'}`)
  lines.push(`- is-revert: ${result.isRevert ? 'yes' : 'no'}`)
  lines.push(
    `- first-red: ${
      result.firstRed === null ? 'none' : `${result.firstRed} (${result.firstRedExact ? 'exact' : 'at or before'})`
    }`,
  )
  if (result.pr !== null) {
    lines.push(
      '',
      fence(
        deMention(
          `PR #${result.pr.number} author=${result.pr.author ?? 'unknown'} mergedBy=${result.pr.mergedBy ?? 'none'}`,
        ),
      ),
    )
  }
  if (result.failedJobs.length > 0) {
    lines.push('', 'Failed jobs:')
    for (const job of result.failedJobs) lines.push(`- ${deMention(job.name)} [${job.reason ?? 'none'}]`)
  }
  for (const notice of result.notices) lines.push(`> ${deMention(notice)}`)
  lines.push('', deMention(result.message))
  if (result.revert !== null) {
    lines.push(
      '',
      '### revert',
      '',
      fence(deMention(result.revert.git), 'sh'),
      '',
      fence(deMention(result.revert.ghPr), 'sh'),
    )
  }
  return `${lines.join('\n')}\n`
}

const readFacts = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await Deno.readTextFile(path))
  } catch {
    return undefined
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, { string: ['facts', 'out'] })
  const factsPath = typeof args.facts === 'string' ? args.facts : ''
  const outPath = typeof args.out === 'string' ? args.out : ''
  const result = decideFromJson(factsPath === '' ? undefined : await readFacts(factsPath))
  if (outPath !== '') await Deno.writeTextFile(outPath, `${JSON.stringify(result, null, 2)}\n`)
  const summary = Deno.env.get('GITHUB_STEP_SUMMARY')
  if (summary === undefined) console.log(renderMarkdown(result))
  else await Deno.writeTextFile(summary, renderMarkdown(result), { append: true })
  console.log(`verdict=${result.verdict} reason=${result.reason ?? 'null'}`)
  const output = Deno.env.get('GITHUB_OUTPUT')
  if (output !== undefined) await Deno.writeTextFile(output, `verdict=${result.verdict}\n`, { append: true })
}
