#!/usr/bin/env -S deno run
// PreToolUse hook contract: exit 0 allows the call, exit 2 refuses it and the
// stderr text reaches the agent. Neither code is inferable from the source.
// Behaviour only -- this guard reads no doctrine file, so REPO-S6 holds.
//
// Scope boundary. bashInterceptor is enabled in ~/.omp/agent/config.yml, so
// omp's own DEFAULT_BASH_INTERCEPTOR_RULES already route cat/head/tail/less/
// more, grep/rg/ripgrep/ag/ack, find/fd/locate, sed -i, perl -i, awk -i
// inplace, echo/printf redirection, nohup and a trailing &, and services,
// watchers and debuggers including gdb, lldb and tail -f. Repeating any of it
// here would be a second implementation of a live rule. This guard covers only
// what no built-in rule reaches: gh subcommands with a native OMP counterpart,
// GitHub and plain-URL content fetches, and ce-babysit-pr, whose poller wraps
// gh and whose skill load is not a Bash call at all.

import { toText } from '@std/streams'

export interface ToolPayload {
  readonly tool_input?: Record<string, unknown>
}

export interface Refusal {
  readonly offender: string
  readonly native: string
  readonly why: string
}

export type Verdict =
  | { readonly refused: false }
  | { readonly refused: true; readonly refusal: Refusal }

const ALLOWED: Verdict = { refused: false }

const refuse = (offender: string, native: string, why: string): Verdict => ({
  refused: true,
  refusal: { offender, native, why },
})

const SEPARATORS = /&&|\|\||[|;\n]/
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const BABYSIT = /(?:^|[/:@\s])ce-babysit-pr\b/

const WRAPPERS: Record<string, true> = {
  sudo: true,
  env: true,
  command: true,
  exec: true,
  time: true,
  nice: true,
  stdbuf: true,
  xargs: true,
}

const INTERPRETERS: Record<string, true> = {
  python: true,
  python3: true,
  uv: true,
  sh: true,
  bash: true,
  node: true,
  bun: true,
  deno: true,
}

const FETCHERS: Record<string, true> = { curl: true, wget: true, xh: true, http: true, httpie: true }

const LOCAL_HOSTS = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)(?::\d+)?$/
const GITHUB_HOSTS = /^(?:[\w.-]+\.)?(?:github\.com|githubusercontent\.com|github\.dev)$/

const BABYSIT_NATIVE = 'github { op: "run_watch" } for CI plus `read pr://<N>` for the thread state'
const BABYSIT_WHY =
  "run_watch streams every check for the head, fast-fails on the first failing job and saves full failed-job logs to an artifact; pr:// serves the body, comments, reviews and review comments from OMP's own cache, which pr_push invalidates on every push"

const GH_NATIVE: Record<string, readonly [string, string]> = {
  'pr view': [
    '`read pr://<N>`',
    'it serves the body, comments, reviews and review comments from the cache gh would refetch',
  ],
  'pr list': ['`read pr://?state=open`', 'the same listing, with state, limit, author and label as query params'],
  'pr diff': [
    '`read pr://<N>/diff`',
    'the listing, `pr://<N>/diff/<i>` for one file and `pr://<N>/diff/all` for the whole diff share a single gh call',
  ],
  'pr checks': [
    'github { op: "run_watch" }',
    'it streams check state, fast-fails on the first failing job and saves full failed-job logs to an artifact',
  ],
  'pr create': ['github { op: "pr_create" }', 'same flags, and it reads the created PR back for the summary'],
  'pr checkout': [
    'github { op: "pr_checkout" }',
    'it lands the PR in its own worktree and records the branch metadata pr_push needs',
  ],
  'issue view': ['`read issue://<N>`', 'the cached issue view, comments included'],
  'issue list': ['`read issue://?state=open`', 'the same listing, with state, limit, author and label as query params'],
  'run watch': [
    'github { op: "run_watch" }',
    'it polls every 3s for the first minute, backs off after, and returns the failed-job tail inline',
  ],
  'run view': [
    'github { op: "run_watch", run: "<id>" }',
    'it reports the same run and persists the full failed-job logs as an artifact',
  ],
  'run list': ['github { op: "run_watch" }', 'omitting run watches every run for the current HEAD'],
  'repo view': ['github { op: "repo_view" }', 'the same fields in one call'],
  'search issues': ['github { op: "search_issues" }', 'repo scope defaults to the current checkout'],
  'search prs': ['github { op: "search_prs" }', 'repo scope defaults to the current checkout'],
  'search code': ['github { op: "search_code" }', 'it returns the text-match fragment alongside each hit'],
  'search commits': ['github { op: "search_commits" }', 'since and until accept relative durations like 3d or 2w'],
  'search repos': ['github { op: "search_repos" }', 'scope it with org: or language: in the query'],
}

export interface Segment {
  readonly name: string
  readonly args: readonly string[]
}

const basename = (word: string): string => {
  const bare = word.replace(/^["']|["']$/g, '')
  return bare.slice(bare.lastIndexOf('/') + 1)
}

export const segments = (command: string): readonly Segment[] =>
  command
    .split(SEPARATORS)
    .map((raw) => {
      const tokens = raw.trim().split(/\s+/).filter((token) => token.length > 0)
      const start = tokens.findIndex((token) => !ASSIGNMENT.test(token) && WRAPPERS[basename(token)] !== true)
      if (start === -1) return { name: '', args: [] }
      return { name: basename(tokens[start] ?? ''), args: tokens.slice(start + 1) }
    })
    .filter((segment) => segment.name.length > 0)

const flag = (args: readonly string[], ...names: readonly string[]): boolean =>
  args.some((arg) => names.includes(arg) || names.some((name) => name.startsWith('--') && arg.startsWith(`${name}=`)))

const operands = (args: readonly string[], valueFlags: readonly string[] = []): readonly string[] => {
  const out: string[] = []
  let skipNext = false
  for (const arg of args) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (arg === '--') continue
    if (arg.length > 1 && arg.startsWith('-')) {
      skipNext = valueFlags.includes(arg)
      continue
    }
    out.push(arg)
  }
  return out
}

const inspectGh = (segment: Segment): Verdict => {
  const args = operands(segment.args, ['--repo', '-R', '--json', '-q', '--jq', '--limit', '-L', '--template', '-t'])
  const [noun = '', verb = '', ...rest] = args
  const mapped = GH_NATIVE[`${noun} ${verb}`]
  if (mapped !== undefined) return refuse(`gh ${noun} ${verb}`, mapped[0], mapped[1])
  if (noun === 'api' && [verb, ...rest].some((arg) => arg.includes('/contents/'))) {
    return refuse(
      'gh api .../contents/...',
      'github { op: "file_read" }',
      'it reads a repository file through the same contents API and preserves the bytes',
    )
  }
  return ALLOWED
}

const inspectFetch = (segment: Segment): Verdict => {
  const url = operands(segment.args, [
    '-o',
    '--output',
    '-H',
    '--header',
    '-d',
    '--data',
    '-X',
    '--request',
    '-u',
    '-A',
    '-e',
    '-b',
    '-T',
    '--upload-file',
    '-F',
    '--form',
  ]).find((arg) => /^https?:\/\//.test(arg))
  if (url === undefined) return ALLOWED

  const host = url.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  if (LOCAL_HOSTS.test(host)) return ALLOWED
  if (GITHUB_HOSTS.test(host)) {
    return refuse(
      `${segment.name} ${url}`,
      'github { op: "file_read" }, `read pr://<N>`, or `read issue://<N>`',
      'the GitHub tool is required over an HTTP client for anything GitHub hosts',
    )
  }

  // A request that writes, uploads, downloads to disk or only probes status is
  // not a content read, and `read` cannot express it.
  const sideEffecting = flag(
    segment.args,
    '-X',
    '--request',
    '-d',
    '--data',
    '--data-raw',
    '--data-binary',
    '--data-urlencode',
    '-F',
    '--form',
    '-T',
    '--upload-file',
    '-I',
    '--head',
    '-o',
    '--output',
    '-O',
    '--remote-name',
    '-w',
    '--write-out',
    '-P',
    '--directory-prefix',
  )
  if (sideEffecting) return ALLOWED
  if (segment.name === 'wget' && !flag(segment.args, '-O-', '--output-document=-') && !segment.args.includes('-')) {
    return ALLOWED
  }
  return refuse(
    `${segment.name} ${url}`,
    `\`read ${url}\``,
    'it returns reader-mode text or markdown, and `:raw` gives the untouched body',
  )
}

export const decideCommand = (command: string): Verdict => {
  for (const segment of segments(command)) {
    if (flag(segment.args, '-h', '--help', 'help')) continue

    if (BABYSIT.test(segment.name)) return refuse('ce-babysit-pr', BABYSIT_NATIVE, BABYSIT_WHY)

    const runsSnapshot = basename(segment.name) === 'pr-snapshot' ||
      (INTERPRETERS[segment.name] === true && operands(segment.args).some((arg) => basename(arg) === 'pr-snapshot'))
    if (runsSnapshot) return refuse('ce-babysit-pr pr-snapshot', BABYSIT_NATIVE, BABYSIT_WHY)

    if (segment.name === 'gh') {
      const verdict = inspectGh(segment)
      if (verdict.refused) return verdict
    }

    if (FETCHERS[segment.name] === true) {
      const verdict = inspectFetch(segment)
      if (verdict.refused) return verdict
    }
  }
  return ALLOWED
}

export const decide = (payload: ToolPayload): Verdict => {
  const input = payload.tool_input ?? {}
  const command = input['command']
  if (typeof command === 'string' && command.length > 0) return decideCommand(command)

  const loadsBabysit = Object.values(input).some((value) => typeof value === 'string' && BABYSIT.test(value))
  if (!loadsBabysit) return ALLOWED
  return refuse(
    'ce-babysit-pr',
    BABYSIT_NATIVE,
    "the skill's watch loop is a gh wrapper around CI polling and PR reads, and both are native here; the half that is not a wrapper is ce-resolve-pr-feedback and ce-debug, which are reachable directly",
  )
}

if (import.meta.main) {
  const raw = await toText(Deno.stdin.readable)
  let payload: ToolPayload
  try {
    payload = JSON.parse(raw) as ToolPayload
  } catch {
    Deno.exit(0)
  }

  const verdict = decide(payload)
  if (!verdict.refused) Deno.exit(0)

  console.error(
    [
      `Native OMP equivalent exists: ${verdict.refusal.offender}`,
      `Use ${verdict.refusal.native} instead - ${verdict.refusal.why}.`,
      'Refused by .claude/hooks/guard-native-equivalent.ts. Reshaping the command to slip past this guard is never the right response: if the native tool genuinely cannot express the call, say so in chat.',
    ].join('\n'),
  )
  Deno.exit(2)
}
