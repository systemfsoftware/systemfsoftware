#!/usr/bin/env -S deno run --allow-read=.changeset --allow-run=./scripts/tools/tag-released-packages.mjs
// plan-release.mjs — decide which release phase this push is, from repository
// state alone.
//
// The publish used to hang off `pull_request: closed` for the Release PR. That
// trigger is single-shot: run 32650470424 failed at its preflight step and no
// later push to main could retry it, so 32 packages sat version-bumped on main
// with no tag, no npm release and no GitHub Release. State is durable where a PR
// event is not — pending intents mean "version", an untagged this-cycle set
// means "publish" — so a half-finished release resumes on the next push.
//
// The this-cycle set comes from tag-released-packages.mjs, which owns the one
// definition of "released this cycle". A second copy here would drift.

const CHANGESET_DIR = '.changeset'
const TAG_SCRIPT = './scripts/tools/tag-released-packages.mjs'

/**
 * True when a `.changeset` entry name is an unconsumed change intent.
 *
 * `README.md` documents the directory and `ledger.yaml` records consumed
 * intents; neither is pending. Authored changelogs live in `changelogs/`, which
 * is a directory and so never reaches this predicate from a shallow read — the
 * path form is rejected anyway, so a caller passing one gets the same answer.
 */
export const isPendingIntent = (name) =>
  name.endsWith('.md') && !name.includes('changelogs/') && name.split('/').pop() !== 'README.md'

/** version when intents are pending, publish when tags are owed, else nothing to do. */
export const decidePhase = (pendingIntents, thisCycle) =>
  pendingIntents > 0 ? 'version' : thisCycle > 0 ? 'publish' : 'none'

const countPendingIntents = async () => {
  let count = 0
  try {
    for await (const entry of Deno.readDir(CHANGESET_DIR)) {
      if (entry.isFile && isPendingIntent(entry.name)) count++
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }
  return count
}

const thisCycleCount = async () => {
  // Spawned by path so the script's own shebang supplies its permissions;
  // restating them here would let the two drift apart.
  const out = await new Deno.Command(TAG_SCRIPT, {
    args: ['--dry-run', '--json'],
    stdout: 'piped',
    stderr: 'inherit',
  }).output()
  if (!out.success) throw new Error(`${TAG_SCRIPT} failed (exit ${out.code})`)
  const parsed = JSON.parse(new TextDecoder().decode(out.stdout))
  if (!Array.isArray(parsed)) throw new Error(`${TAG_SCRIPT} must print a JSON array`)
  return parsed.length
}

/**
 * The planner's negative control. Both halves are pure, so the selftest drives
 * the same functions the run drives — no filesystem, no subprocess.
 */
const selftest = () => {
  const phases = [
    ['pending intents win over an empty cycle', decidePhase(3, 0), 'version'],
    ['pending intents win over a full cycle', decidePhase(3, 5), 'version'],
    ['no intents and tags owed is publish', decidePhase(0, 5), 'publish'],
    ['no intents and no tags owed is none', decidePhase(0, 0), 'none'],
  ]
  const intents = [
    ['a slug intent is pending', isPendingIntent('cyan-wombats-own.md'), true],
    ['README.md is not an intent', isPendingIntent('README.md'), false],
    ['a path to README.md is not an intent', isPendingIntent('.changeset/README.md'), false],
    ['ledger.yaml is not an intent', isPendingIntent('ledger.yaml'), false],
    ['an authored changelog is not an intent', isPendingIntent('changelogs/@systemfsoftware!all@1.0.0.md'), false],
    ['the changelogs directory is not an intent', isPendingIntent('changelogs'), false],
  ]

  const failures = [...phases, ...intents].filter(([, actual, expected]) => actual !== expected)
  for (const [name, actual, expected] of failures) {
    console.error(`selftest: ${name} — expected ${expected}, got ${actual}`)
  }
  if (failures.length > 0) {
    console.error(`selftest FAILED: ${failures.length} of ${phases.length + intents.length}`)
    return 1
  }
  console.log(`selftest ok: ${phases.length + intents.length} cases`)
  return 0
}

const main = async () => {
  if (Deno.args.includes('--selftest')) return selftest()

  const pending = await countPendingIntents()
  const owed = await thisCycleCount()
  const phase = decidePhase(pending, owed)

  console.error(`plan-release: pending_intents=${pending} this_cycle=${owed} -> phase=${phase}`)

  // stdout carries key=value only, for `>> "$GITHUB_OUTPUT"`.
  console.log(`phase=${phase}`)
  console.log(`pending_intents=${pending}`)
  console.log(`this_cycle=${owed}`)
  return 0
}

try {
  Deno.exitCode = await main()
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`)
  Deno.exitCode = 1
}
