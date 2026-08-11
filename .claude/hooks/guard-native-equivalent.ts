#!/usr/bin/env -S deno run
// PreToolUse hook contract: exit 0 allows the call, exit 2 refuses it and the
// stderr text reaches the agent. Neither code is inferable from the source.
// Behaviour only -- this guard reads no doctrine file, so REPO-S6 holds.
//
// A call that re-implements a native OMP tool is refused, and the refusal names
// the tool to use instead. Two carve-outs keep the shell everything it is
// better at: a pipeline ending in a count, frequency, checksum or set
// difference computes a fact, and a stage fed by a pipe filters another
// command's output, which no read or grep tool can do.

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

const SEPARATORS = /(&&|\|\||[|;\n])/
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const BACKGROUNDED = /(?:^|\s)&$/
const BABYSIT = /(?:^|[/:@\s])ce-babysit-pr\b/

// Prefixes carrying no meaning of their own: the guard judges what they run.
// nohup, setsid, screen and tmux are deliberately absent -- they ARE the
// offence, so they must stay visible as the segment's own name.
const WRAPPERS: Record<string, true> = {
  sudo: true,
  env: true,
  command: true,
  exec: true,
  time: true,
  nice: true,
  ionice: true,
  stdbuf: true,
  xargs: true,
  builtin: true,
}

const AGGREGATORS: Record<string, true> = {
  wc: true,
  md5sum: true,
  sha1sum: true,
  sha224sum: true,
  sha256sum: true,
  sha384sum: true,
  sha512sum: true,
  b2sum: true,
  cksum: true,
  comm: true,
  diff: true,
  cmp: true,
}

const MUTATORS: Record<string, true> = {
  rm: true,
  cp: true,
  mv: true,
  chmod: true,
  chown: true,
  touch: true,
  ln: true,
  mkdir: true,
  tar: true,
  zip: true,
  gzip: true,
  sed: true,
}

const PAGERS: Record<string, true> = { cat: true, head: true, tail: true, less: true, more: true, bat: true, nl: true }
const LISTERS: Record<string, true> = { ls: true, tree: true, dir: true, vdir: true }
const FINDERS: Record<string, true> = { find: true, fd: true, fdfind: true }
const SEARCHERS: Record<string, true> = {
  grep: true,
  egrep: true,
  fgrep: true,
  rg: true,
  ag: true,
  ack: true,
  ugrep: true,
}
// These walk the tree with no path operand, so a bare invocation is already a
// file search rather than a stdin filter.
const TREE_SEARCHERS: Record<string, true> = { rg: true, ag: true, ack: true, ugrep: true }
const FETCHERS: Record<string, true> = { curl: true, wget: true, xh: true, http: true, https: true, httpie: true }
const DETACHERS: Record<string, true> = { nohup: true, setsid: true, screen: true, tmux: true, disown: true }
const DEBUGGERS: Record<string, true> = { gdb: true, lldb: true, cgdb: true, debugpy: true, dlv: true, rdbg: true }
const INTERPRETERS: Record<string, true> = {
  python: true,
  python3: true,
  uv: true,
  sh: true,
  bash: true,
  zsh: true,
  node: true,
  bun: true,
  deno: true,
}
const BROWSER_VERBS: Record<string, true> = {
  open: true,
  codegen: true,
  screenshot: true,
  pdf: true,
  cr: true,
  wk: true,
  ff: true,
}

const LOCAL_HOSTS = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1|host\.docker\.internal)(?::\d+)?$/
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
    'the listing, `pr://<N>/diff/<i>` for one file and `pr://<N>/diff/all` for the whole diff all share a single gh call',
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
  readonly raw: string
  readonly name: string
  readonly args: readonly string[]
  readonly piped: boolean
}

const basename = (word: string): string => {
  const bare = word.replace(/^["']|["']$/g, '')
  return bare.slice(bare.lastIndexOf('/') + 1)
}

const parse = (raw: string, piped: boolean): Segment => {
  const tokens = raw.trim().split(/\s+/).filter((token) => token.length > 0)
  const start = tokens.findIndex((token) => !ASSIGNMENT.test(token) && WRAPPERS[basename(token)] !== true)
  if (start === -1) return { raw: raw.trim(), name: '', args: [], piped }
  return { raw: raw.trim(), name: basename(tokens[start] ?? ''), args: tokens.slice(start + 1), piped }
}

export const segments = (command: string): readonly Segment[] => {
  const parts = command.split(SEPARATORS)
  return parts
    .map((part, index) => parse(part, (parts[index - 1] ?? '') === '|'))
    .filter((_, index) => index % 2 === 0)
    .filter((segment) => segment.name.length > 0)
}

const flag = (args: readonly string[], ...names: readonly string[]): boolean =>
  args.some((arg) => names.includes(arg) || names.some((name) => name.startsWith('--') && arg.startsWith(`${name}=`)))

const shortFlag = (args: readonly string[], letter: string): boolean =>
  args.some((arg) => /^-[A-Za-z]+$/.test(arg) && arg.slice(1).includes(letter))

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
      'the GitHub tool is required over curl or wget for anything GitHub hosts',
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

const inspectSegment = (segment: Segment, downstream: readonly Segment[]): Verdict => {
  if (flag(segment.args, '-h', '--help', 'help')) return ALLOWED

  if (BABYSIT.test(segment.name)) return refuse('ce-babysit-pr', BABYSIT_NATIVE, BABYSIT_WHY)

  const runsSnapshot = basename(segment.name) === 'pr-snapshot' ||
    (INTERPRETERS[segment.name] === true && operands(segment.args).some((arg) => basename(arg) === 'pr-snapshot'))
  if (runsSnapshot) return refuse('ce-babysit-pr pr-snapshot', BABYSIT_NATIVE, BABYSIT_WHY)

  if (BACKGROUNDED.test(segment.raw) || DETACHERS[segment.name] === true) {
    return refuse(
      segment.raw,
      'hub { op: "start" }',
      'a service, watcher or REPL started this way outlives the call unsupervised; hub gives it a name, a readiness probe, logs and a stop',
    )
  }

  if (segment.name === 'gh') return inspectGh(segment)
  if (FETCHERS[segment.name] === true) return inspectFetch(segment)

  if (
    DEBUGGERS[segment.name] === true || (segment.name === 'node' && flag(segment.args, '--inspect', '--inspect-brk'))
  ) {
    return refuse(
      segment.raw,
      'the debug tool',
      'it drives the same adapters (gdb, lldb-dap, debugpy, dlv, rdbg) with breakpoints, stepping and variable reads',
    )
  }

  if (
    (segment.name === 'playwright' || segment.name === 'puppeteer') &&
    operands(segment.args).some((arg) => BROWSER_VERBS[arg] === true)
  ) {
    return refuse(
      segment.raw,
      'the browser tool',
      'it keeps a real Chromium tab across calls, with full puppeteer access',
    )
  }

  if (
    (segment.name === 'sed' && (flag(segment.args, '-i', '--in-place') || shortFlag(segment.args, 'i'))) ||
    (segment.name === 'perl' && shortFlag(segment.args, 'i'))
  ) {
    return refuse(
      segment.raw,
      'the edit tool, or ast_edit for a codemod',
      'a line-anchored edit fails loudly on a stale snapshot instead of silently rewriting the wrong lines',
    )
  }

  const computesAFact = downstream.some((later) =>
    AGGREGATORS[later.name] === true || (later.name === 'uniq' && shortFlag(later.args, 'c'))
  )
  if (computesAFact) return ALLOWED

  if (PAGERS[segment.name] === true) {
    if (segment.piped) return ALLOWED
    if (flag(segment.args, '-f', '-F', '--follow')) return ALLOWED
    if (operands(segment.args, ['-n', '-c', '--lines', '--bytes']).length === 0) return ALLOWED
    return refuse(
      segment.raw,
      'the read tool',
      'it takes line selectors (`file.ts:50-200`) and returns anchored, numbered lines you can edit from',
    )
  }

  if (LISTERS[segment.name] === true && !segment.piped) {
    return refuse(
      segment.raw,
      '`read <dir>`, or the glob tool for a pattern',
      'read lists a directory directly and glob returns matches newest-first',
    )
  }

  if (FINDERS[segment.name] === true && !segment.piped) {
    const doesWork = flag(segment.args, '-delete', '-exec', '-execdir', '-ok', '-okdir') ||
      downstream.some((later) => MUTATORS[later.name] === true)
    if (doesWork) return ALLOWED
    return refuse(
      segment.raw,
      'the glob tool',
      'it takes the same patterns, honours gitignore, and groups matches by directory',
    )
  }

  if (SEARCHERS[segment.name] === true) {
    if (flag(segment.args, '-c', '--count') || shortFlag(segment.args, 'c')) return ALLOWED
    const paths = operands(segment.args, [
      '-e',
      '--regexp',
      '-m',
      '--max-count',
      '-A',
      '-B',
      '-C',
      '--glob',
      '-g',
      '--type',
      '-t',
      '-f',
      '--file',
    ])
    const searchesTree = shortFlag(segment.args, 'r') || shortFlag(segment.args, 'R') ||
      flag(segment.args, '--recursive') || paths.length > 1 ||
      (TREE_SEARCHERS[segment.name] === true && paths.length > 0 && !segment.piped)
    if (!searchesTree) return ALLOWED
    return refuse(
      segment.raw,
      'the grep tool',
      'same regex engine with a PCRE2 fallback, plus path, glob and line-range scoping',
    )
  }

  return ALLOWED
}

export const decideCommand = (command: string): Verdict => {
  const parsed = segments(command)
  for (const [index, segment] of parsed.entries()) {
    const verdict = inspectSegment(segment, parsed.slice(index + 1))
    if (verdict.refused) return verdict
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
