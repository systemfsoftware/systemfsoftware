#!/usr/bin/env -S deno run
// PreToolUse hook contract: exit 0 allows the call, exit 2 refuses it and the
// stderr text reaches the agent. Neither code is inferable from the source.
//
// The mistake this guard prevents, observed 2026-08-16: an agent launched ten
// package mutation runs in three background batches during the effect v4
// cut-over. They saturated the machine, starved each other and the foreground
// gate, one hit a 3600s timeout, and not one produced a verdict before the PR
// opened. A mutation run costs minutes to hours of every core; an agent that
// starts one has spent the session's wall clock on a number nothing reads.
//
// Precision matters more than reach here. `mutation` appears inside package
// names (@systemfsoftware/stryker-js-mutation-run), report paths
// (reports/mutation-report.json) and script names that are not mutation runs
// (merge-mutation-reports.mjs). Only a bare script operand or the stryker
// binary itself is a run, so the matcher works on the operand list rather than
// on a substring of the command.

// stdin is read without a dependency so `deno check` passes on this file alone.

export interface ToolPayload {
  readonly tool_input?: Record<string, unknown>
}

export type Verdict =
  | { readonly refused: false }
  | { readonly refused: true; readonly offender: string }

const ALLOWED: Verdict = { refused: false }

// `$(`, backtick and the parens are boundaries too: `r=$(pnpm … mutation)` hides
// a run inside an assignment, and that is the shape the originating mistake used
// to capture a score.
const SEPARATORS = /&&|\|\||[|;\n]|\$\(|`|[()]/
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

/** A leader's own argument: a flag, or a duration/count like `1500` or `30s`. */
const LEADER_ARG = /^(?:-|\d+[smhd]?$)/

/** The human escape hatch: a person may still run one deliberately. */
const OVERRIDE = /^ALLOW_LOCAL_MUTATION=(1|true)$/

/** Script runners whose bare operand names a package script. */
const RUNNERS: Record<string, true> = {
  pnpm: true,
  npm: true,
  npx: true,
  yarn: true,
  bun: true,
  bunx: true,
  turbo: true,
  nx: true,
  moon: true,
}

/** Runner flags that consume the token after them, which is never a script name. */
const VALUE_FLAGS: Record<string, true> = {
  '--filter': true,
  '-F': true,
  '--scope': true,
  '--dir': true,
  '-C': true,
  '--workspace': true,
  '-w': true,
  '--concurrency': true,
  '--cache-dir': true,
}

/** Script names that start a mutation run. */
const MUTATION_SCRIPTS: Record<string, true> = {
  mutation: true,
  'mutation:full': true,
  'mutation:ci': true,
  'mutation:incremental': true,
}

const basename = (word: string): string => {
  const cut = word.lastIndexOf('/')
  return cut === -1 ? word : word.slice(cut + 1)
}

/**
 * Words that can precede the real executable inside one segment. `for p in …; do
 * pnpm … mutation; done` is the shape that slipped past the first cut of this
 * guard, and it is the exact shape the originating mistake used.
 */
const LEADERS: Record<string, true> = {
  do: true,
  then: true,
  else: true,
  elif: true,
  '{': true,
  '(': true,
  '!': true,
  time: true,
  exec: true,
  command: true,
  nohup: true,
  env: true,
  sudo: true,
  timeout: true,
  xargs: true,
}

/** Shells that carry a whole command line in an argument. */
const SHELLS: Record<string, true> = { bash: true, sh: true, zsh: true, dash: true, ksh: true }

const MUTATION_WORD = /(?:^|[\s;&|"'(])(?:stryker\b|mutation(?::[a-z-]+)?(?:\s|$|;|&|\||"|'))/

export interface Segment {
  readonly name: string
  readonly args: readonly string[]
  readonly overridden: boolean
}

/**
 * A heredoc body is data, not commands: a commit message or a doc that quotes
 * `pnpm --filter <pkg> mutation` reaches the shell as one `git`/`cat` call, but
 * its lines segment exactly like a run. Stripping the body is what keeps this
 * guard from refusing the sentence that documents it. `… <<EOF | bash` stays out
 * of reach by construction — this guard refuses accidents, not adversaries.
 */
export const withoutHeredocs = (command: string): string => {
  const start = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/
  let out = command
  for (;;) {
    const match = start.exec(out)
    if (match === null) return out
    const terminator = match[2] ?? ''
    const after = match.index + match[0].length
    const rest = out.slice(after)
    const end = new RegExp(`^\\s*${terminator}\\s*$`, 'm').exec(rest)
    out = out.slice(0, match.index) + (end === null ? '' : rest.slice(end.index + end[0].length))
  }
}

export const segments = (command: string): readonly Segment[] =>
  withoutHeredocs(command)
    .split(SEPARATORS)
    .map((raw) => {
      const words = raw.trim().split(/\s+/).filter((word) => word.length > 0)
      const overridden = words.some((word) => OVERRIDE.test(word))
      const rest = words.filter((word) => !ASSIGNMENT.test(word))
      let head = 0
      // A leader can take its own arguments before the real executable: `timeout
      // 1500 pnpm …`, `env -i pnpm …`, `xargs -n1 pnpm …`.
      while (head < rest.length && LEADERS[basename(rest[head] ?? '')] === true) {
        head++
        while (head < rest.length && LEADER_ARG.test(rest[head] ?? '')) head++
      }
      return { name: basename(rest[head] ?? ''), args: rest.slice(head + 1), overridden }
    })
    .filter((segment) => segment.name.length > 0)

/** Bare operands only: flags, their values, and anything path-shaped are dropped. */
export const operands = (args: readonly string[]): readonly string[] => {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg.startsWith('-')) {
      if (VALUE_FLAGS[arg] === true) i++
      continue
    }
    if (arg.includes('/')) continue
    out.push(arg)
  }
  return out
}

export const decideCommand = (command: string): Verdict => {
  for (const segment of segments(command)) {
    if (segment.overridden) continue

    if (segment.name === 'stryker') return { refused: true, offender: 'stryker' }

    if (SHELLS[segment.name] === true && segment.args.some((arg) => MUTATION_WORD.test(arg))) {
      return { refused: true, offender: `${segment.name} -c … mutation` }
    }

    if (RUNNERS[segment.name] !== true) continue

    const bare = operands(segment.args)
    if (bare.includes('stryker')) return { refused: true, offender: `${segment.name} … stryker` }

    const script = bare.find((operand) => MUTATION_SCRIPTS[operand] === true)
    if (script !== undefined) return { refused: true, offender: `${segment.name} … ${script}` }
  }
  return ALLOWED
}

export const decide = (payload: ToolPayload): Verdict => {
  const command = (payload.tool_input ?? {})['command']
  if (typeof command !== 'string' || command.length === 0) return ALLOWED
  return decideCommand(command)
}

/**
 * Every REFUSED case below is a command shape an agent actually issued on
 * 2026-08-16; every ALLOWED case is a neighbour that must stay runnable, and the
 * `stryker-js-mutation-run` pair is the one this guard is most likely to break.
 */
const SELFTEST: readonly (readonly [string, boolean])[] = [
  ['pnpm --filter @systemfsoftware/hex-schema mutation', true],
  ['pnpm mutation:full', true],
  ['cd packages/hex-schema && pnpm mutation', true],
  ['turbo mutation --filter=./packages/hex-schema', true],
  ['pnpm exec stryker run', true],
  ['stryker run', true],
  ['for p in a b; do pnpm --filter $p mutation; done', true],
  ['for p in a b; do r=$(pnpm --filter $p mutation | tail -2); echo $r; done', true],
  ['TURBO_CONCURRENCY=100% pnpm run mutation', true],
  ['timeout 1500 pnpm --filter x mutation', true],
  ['bash -c "pnpm --filter x mutation"', true],
  ['nohup pnpm mutation &', true],
  ['(cd packages/x && pnpm mutation)', true],
  ['pnpm --filter ./packages/stryker-js/cli mutation:full', true],
  ['pnpm --filter @systemfsoftware/stryker-js-mutation-run test', false],
  ['pnpm --filter @systemfsoftware/stryker-js-mutation-run build', false],
  ['pnpm --filter @systemfsoftware/stryker-plugins test', false],
  ['node scripts/tools/merge-mutation-reports.mjs --selftest', false],
  ['cat packages/hex-schema/reports/mutation-report.json', false],
  ['pnpm check:local', false],
  ['TURBO_CONCURRENCY=100% pnpm gate:tasks --force', false],
  ['git log --oneline --grep mutation', false],
  // Observed false positive: the commit message documenting this very guard was
  // refused, because a heredoc body segments exactly like a command.
  ['git commit -m "$(cat <<\'EOF\'\ndocs: leaves listed `pnpm --filter <pkg> mutation` as a step\nEOF\n)"', false],
  ['cat <<EOF > doc.md\nrun pnpm --filter x mutation\nEOF', false],
  ['timeout 30 pnpm --filter x test', false],
  ['for p in a b; do pnpm --filter $p test; done', false],
  ['ALLOW_LOCAL_MUTATION=1 pnpm --filter @systemfsoftware/hex-schema mutation', false],
]

const selftest = (): void => {
  const failures = SELFTEST
    .filter(([command, expected]) => decideCommand(command).refused !== expected)
    .map(([command, expected]) => `  expected ${expected ? 'refuse' : 'allow'}: ${command}`)
  if (failures.length > 0) {
    console.error(`guard-local-mutation: selftest FAILED\n${failures.join('\n')}`)
    Deno.exit(1)
  }
  console.log(`guard-local-mutation: selftest ok (${SELFTEST.length} cases)`)
}

if (import.meta.main) {
  if (Deno.args.includes('--selftest')) {
    selftest()
    Deno.exit(0)
  }

  const raw = await new Response(Deno.stdin.readable).text()
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
      `Local mutation run refused: ${verdict.offender}`,
      'A mutation run costs minutes to hours of every core and blocks the machine the session is working on. No agent starts one (AGENTS.md REPO-D3).',
      'The score comes from the Mutation workflow, whose merged report carries every package score and its survivors.',
      "This hook only ever sees an agent tool call — the user running the same command in their own shell is never intercepted — so a refusal here is never in the user's way. If the user asked for this run, say it is refused and let them start it; never self-authorize.",
      'Refused by .claude/hooks/guard-local-mutation.ts. Reshaping the command to slip past this guard is never the right response.',
    ].join('\n'),
  )
  Deno.exit(2)
}
