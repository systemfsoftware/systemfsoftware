// repo-checks: repository invariants for any pnpm workspace, shipped as the
// flake package `repo-checks` (nix/deno-tool.nix). Run it at the repository
// root:
//
//   nix run github:systemfsoftware/systemfsoftware#repo-checks -- <check>... [--plans <dir> --base <rev> [--head <rev>]] [--strict]
//
// Checks: subtrees, release-age, project-membership, single-plan, packed-manifest,
// and the composition gates composition-unit-kinds, composition-graph,
// composition-entries, composition-imports, composition-contracts,
// composition-core-adapters and composition-granularity (which fails only with
// --strict). Fact-gated checks read the compiler; judge-gated rules ask a panel
// (OPENROUTER_API_KEY) and fail only at a calibrated kappa >= 0.7.
// composition-calibrate [--live|--record] [--write] measures that judge.
// Exit 0: every named check holds. Exit 1: a check found a violation, whatever
// the others decided. Exit 2: no violation, but a check could not decide
// (usage, shallow history, missing compiler).
import { parseArgs } from '@std/cli/parse-args'
import { checkCompositionCalibrate, loadJudge } from './composition-calibrate.ts'
import {
  checkCompositionContracts,
  checkCompositionCoreAdapters,
  checkCompositionEntries,
  checkCompositionGranularity,
  checkCompositionGraph,
  checkCompositionImports,
  checkCompositionUnitKinds,
} from './composition.ts'
import { checkPackedManifest } from './packed-manifest.ts'
import { checkProjectMembership } from './project-membership.ts'
import { checkReleaseAge } from './release-age.ts'
import { checkSinglePlan } from './single-plan.ts'
import { checkSubtrees } from './subtrees.ts'
import { Undecided, type Verdict } from './verdict.ts'

interface Options {
  readonly root: string
  readonly plans: string | undefined
  readonly base: string | undefined
  readonly head: string
  readonly strict: boolean
  readonly live: boolean
  readonly record: boolean
  readonly write: boolean
}

const CHECKS: Readonly<Record<string, (options: Options) => Promise<Verdict>>> = {
  'subtrees': () => checkSubtrees(),
  'release-age': ({ root }) => checkReleaseAge(root),
  'project-membership': ({ root }) => checkProjectMembership(root),
  'single-plan': ({ plans, base, head }) => checkSinglePlan(plans, base, head),
  'packed-manifest': ({ base, head }) => checkPackedManifest(base, head),
  'composition-unit-kinds': ({ root }) => checkCompositionUnitKinds(root),
  'composition-graph': ({ root }) => checkCompositionGraph(root),
  'composition-entries': async ({ root }) => checkCompositionEntries(root, await loadJudge()),
  'composition-imports': async ({ root }) => checkCompositionImports(root, await loadJudge()),
  'composition-core-adapters': async ({ root }) => checkCompositionCoreAdapters(root, await loadJudge()),
  'composition-calibrate': (options) => checkCompositionCalibrate(options),
  'composition-contracts': ({ root }) => checkCompositionContracts(root),
  'composition-granularity': async ({ root, strict }) => checkCompositionGranularity(root, strict, await loadJudge()),
}

const USAGE =
  `usage: repo-checks <check>... [--plans <dir> --base <rev> [--head <rev>]] [--strict] [--live|--record] [--write]\nchecks: ${
    Object.keys(CHECKS).join(', ')
  }`

const main = async (): Promise<number> => {
  const args = parseArgs(Deno.args, {
    string: ['plans', 'base', 'head'],
    boolean: ['strict', 'live', 'record', 'write'],
    default: { head: 'HEAD' },
  })
  const names = args._.map(String)
  const unknown = names.filter((name) => !Object.hasOwn(CHECKS, name))
  if (names.length === 0 || unknown.length > 0) {
    console.error(unknown.length > 0 ? `repo-checks: unknown check(s) ${unknown.join(', ')}\n${USAGE}` : USAGE)
    return 2
  }
  const options: Options = {
    root: Deno.cwd(),
    plans: args.plans,
    base: args.base,
    head: args.head,
    strict: args.strict,
    live: args.live,
    record: args.record,
    write: args.write,
  }
  let violatedAny = false
  let undecidedAny = false
  for (const name of names) {
    try {
      const verdict = await CHECKS[name]!(options)
      if (verdict._tag === 'Holds') {
        console.log(`repo-checks ${name}: holds - ${verdict.summary}`)
        continue
      }
      console.error(`repo-checks ${name}: violated`)
      for (const line of verdict.violations) console.error(`  ${line}`)
      console.error(verdict.why)
      violatedAny = true
    } catch (cause) {
      // A check that throws decided nothing: exit 2 even for an unexpected
      // error, so only a named violation can exit 1.
      const detail = cause instanceof Undecided ? cause.message : cause instanceof Error ? cause.stack : String(cause)
      console.error(`repo-checks ${name}: undecided - ${detail}`)
      undecidedAny = true
    }
  }
  return violatedAny ? 1 : undecidedAny ? 2 : 0
}

Deno.exit(await main())
