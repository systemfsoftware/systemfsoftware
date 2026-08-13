#!/usr/bin/env -S deno run --allow-env=CLAUDE_PROJECT_DIR --allow-read --allow-run=git
// PreToolUse hook contract: exit 0 allows the call, exit 2 refuses it and the
// stderr text reaches the agent. Neither code is inferable from the source.
// Enforces behaviour only and reads no doctrine file, so REPO-S6 and
// check:script-provenance stay satisfied.
//
// Gates the native `github { op: "pr_create" }` door, which is where PRs are
// opened here: `guard-native-equivalent.ts` already refuses `gh pr create` in
// Bash and redirects to this op, so a Bash arm would be duplicate enforcement.
// The bridge does see it — `tool_name` arrives as `Github` with the op in
// `tool_input`.
//
// It decides TRIVIALITY, recomputed from the diff the PR would carry. It does
// NOT decide whether a review happened: every artifact attesting to that is
// written by the agent being governed, so a check on one would be a backdoor
// wearing a checkmark. There is deliberately no environment-variable escape —
// an agent can set env for a process it spawns, so that switch would launder a
// bypass through a nested run. The override is to edit this entry out of
// `settings.json`, which is a committed, reviewable diff (CONST-E4).

import { toText } from '@std/streams'

export interface PrPayload {
  readonly tool_name?: string
  readonly tool_input?: {
    readonly op?: string
    readonly base?: string
  }
}

export interface ChangedPath {
  readonly path: string
  /** added + deleted from --numstat; 0 for a binary file, which never reads trivial */
  readonly lines: number
}

export interface Facts {
  /** every path the PR would carry: merge base -> HEAD */
  readonly changed: readonly ChangedPath[]
  /** the subset surviving --ignore-all-space, so more than reflow happened */
  readonly substantive: readonly ChangedPath[]
  /** false when no merge base resolved, so no diff could be adjudicated */
  readonly baseResolved: boolean
}

export type Verdict =
  | { readonly refused: false }
  | { readonly refused: true; readonly reason: string }

const ALLOWED: Verdict = { refused: false }

/**
 * Substantive lines above this are not trivial. Matches the threshold the
 * shipping skill uses for its own trivial skip, so one number governs both
 * rather than two that disagree.
 */
const LINE_CEILING = 10

/**
 * Judges the work, so it is never trivial: its own commit, red before green
 * (AGENTS.md Surface Classes). `.snap` belongs here rather than with generated
 * output because a snapshot encodes a test's expectations, so editing one edits
 * the judge.
 */
const EVALUATOR =
  /^\.github\/|^\.gitlab-ci\.ya?ml$|(^|\/)hooks\/|(^|\/)scripts\/guards\/|(^|\/)\.husky\/|(^|\/)\.claude\/(commands|agents)\/|(^|\/)(stryker|oxlint|eslint|biome|dprint|commitlint|vitest|jest|playwright|cypress)\.config\.|\.snap$/

/** Resolver output. Churn here is a consequence of a manifest edit, not a decision. */
const LOCKFILE =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|deno\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|mix\.lock|pubspec\.lock|flake\.lock|Podfile\.lock|packages\.lock\.json|gradle\.lockfile)$/

/**
 * A dependency manifest classifies as source. A version bump and a `scripts`
 * rewrite are indistinguishable in --numstat, so this gate's trivial set is
 * deliberately tighter than any skill's notion of "mechanical": a wrong answer
 * here ships unreviewed behaviour, while a wrong answer there costs one extra
 * review. `requirements*.txt` sits here rather than in DOCS for that reason - a
 * manifest that happens to end `.txt`.
 */
const MANIFEST =
  /(^|\/)(package\.json|Cargo\.toml|pyproject\.toml|go\.mod|Gemfile|composer\.json|Pipfile|pubspec\.yaml|mix\.exs|pom\.xml|requirements[^/]*\.txt|build\.gradle[^/]*)$/

/** Machine-authored. Reviewing it reviews the generator, not this diff. */
const GENERATED = /(^|\/)(__generated__|generated)\/|\.(gen|generated)\.[^/]+$/

/** Prose. `.mdx` is absent on purpose: it can carry components, so it is source. */
const DOCS = /\.(md|markdown|txt|rst|adoc)$/i

export type Class = 'evaluator' | 'lockfile' | 'generated' | 'docs' | 'source'

export const classify = (path: string): Class =>
  EVALUATOR.test(path)
    ? 'evaluator'
    : LOCKFILE.test(path)
    ? 'lockfile'
    : MANIFEST.test(path)
    ? 'source'
    : GENERATED.test(path)
    ? 'generated'
    : DOCS.test(path)
    ? 'docs'
    : 'source'

const evaluators = (facts: Facts): readonly string[] =>
  facts.changed.filter((c) => classify(c.path) === 'evaluator').map((c) => c.path)

const behavioural = (facts: Facts): readonly string[] =>
  facts.substantive.filter((c) => classify(c.path) === 'source').map((c) => c.path)

/** Lockfile and generated churn is excluded; everything else counts. */
const countedLines = (facts: Facts): number =>
  facts.substantive
    .filter((c) => classify(c.path) !== 'lockfile' && classify(c.path) !== 'generated')
    .reduce((total, c) => total + c.lines, 0)

const shown = (paths: readonly string[]): string =>
  paths.length <= 3 ? paths.join(', ') : `${paths.slice(0, 3).join(', ')} +${paths.length - 3} more`

interface Disqualifier {
  readonly fires: (facts: Facts) => boolean
  readonly because: (facts: Facts) => string
}

/**
 * Ordered so the first hit is the most informative. Every predicate reads a fact
 * recomputed from the current bytes; none reads a claim the agent supplied.
 */
const DISQUALIFIERS: readonly Disqualifier[] = [
  {
    fires: (facts) => !facts.baseResolved,
    because: () => 'no merge base resolved, so the diff could not be adjudicated at all',
  },
  {
    fires: (facts) => evaluators(facts).length > 0,
    because: (facts) => `it changes the surface that judges the work: ${shown(evaluators(facts))}`,
  },
  {
    fires: (facts) => behavioural(facts).length > 0,
    because: (facts) => `it is behaviour-bearing: ${shown(behavioural(facts))}`,
  },
  {
    fires: (facts) => countedLines(facts) > LINE_CEILING,
    because: (facts) => `it changes ${countedLines(facts)} substantive lines, over the ${LINE_CEILING}-line ceiling`,
  },
]

/** The refusal text is the rubric's only home, so prose cannot drift from predicate. */
export const refusal = (because: string): string =>
  `This pull request is not trivial - ${because}.\n` +
  `Ship it through the compound-engineering lifecycle: plan, implement, review, fix, then open the PR.\n` +
  `Trivial means docs, a pure reformat, or lockfile/generated churn - never a behaviour-bearing file ` +
  `at any size, never an evaluator surface, and at most ${LINE_CEILING} substantive lines. ` +
  `Commits and pushes were not blocked, so nothing is lost.`

/** The triviality rubric. Pure: same Facts, same verdict, no clock, no I/O. */
export const decide = (payload: PrPayload, facts: Facts): Verdict => {
  if (payload.tool_input?.op !== 'pr_create') return ALLOWED
  const hit = DISQUALIFIERS.find((d) => d.fires(facts))
  return hit === undefined ? ALLOWED : { refused: true, reason: refusal(hit.because(facts)) }
}

export type Exec = (args: readonly string[]) => Promise<{ code: number; stdout: string }>

export const gitIn = (root: string): Exec => async (args) => {
  const { code, stdout } = await new Deno.Command('git', {
    args: ['-C', root, ...args],
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { code, stdout: new TextDecoder().decode(stdout) }
}

export const parseNumstat = (stdout: string): readonly ChangedPath[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      const [added, deleted, path] = line.split('\t')
      if (path === undefined || path === '') return []
      const count = Number.parseInt(added ?? '', 10) + Number.parseInt(deleted ?? '', 10)
      return [{ path, lines: Number.isNaN(count) ? 0 : count }]
    })

/**
 * The PR's base, preferring what the call itself declares. `pr_create` carries
 * `base`, and a caller that names one is authoritative - that is the ref the
 * forge will diff against, including a branch based on another branch. Only when
 * none is named do we fall back to the remote's default head.
 */
export const resolveBase = async (exec: Exec, declared: string | undefined): Promise<string | null> => {
  const head = await exec(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  const candidates = [
    ...(declared === undefined ? [] : [`origin/${declared}`, declared]),
    head.code === 0 ? head.stdout.trim() : '',
    'origin/main',
    'origin/master',
    '@{upstream}',
  ].filter((ref) => ref !== '')
  for (const ref of candidates) {
    const base = await exec(['merge-base', 'HEAD', ref])
    if (base.code === 0 && base.stdout.trim() !== '') return base.stdout.trim()
  }
  return null
}

/**
 * Measures merge-base -> HEAD, never the working tree: HEAD is what a push
 * carries, so an uncommitted edit must not count and a committed change reverted
 * only in the tree must still count.
 */
export const gather = async (exec: Exec, declared: string | undefined): Promise<Facts> => {
  const base = await resolveBase(exec, declared)
  if (base === null) return { changed: [], substantive: [], baseResolved: false }
  const numstat = ['diff', '--numstat', '--no-renames', base, 'HEAD']
  const changed = await exec(numstat)
  const substantive = await exec([...numstat, '--ignore-all-space', '--ignore-blank-lines'])
  if (changed.code !== 0 || substantive.code !== 0) {
    return { changed: [], substantive: [], baseResolved: false }
  }
  return {
    changed: parseNumstat(changed.stdout),
    substantive: parseNumstat(substantive.stdout),
    baseResolved: true,
  }
}

if (import.meta.main) {
  const raw = await toText(Deno.stdin.readable)
  let payload: PrPayload
  try {
    payload = JSON.parse(raw) as PrPayload
  } catch {
    // An unparseable payload must not brick every call; the guard declines to rule.
    Deno.exit(0)
  }

  if (payload.tool_input?.op !== 'pr_create') Deno.exit(0)

  const root = Deno.env.get('CLAUDE_PROJECT_DIR') ?? Deno.cwd()
  const verdict = decide(payload, await gather(gitIn(root), payload.tool_input?.base))

  if (verdict.refused) {
    console.error(verdict.reason)
    Deno.exit(2)
  }
  Deno.exit(0)
}
