#!/usr/bin/env -S deno run --allow-read --allow-write=. --allow-run=pnpm

/**
 * Attempts every violation the `effect-workflow` plugin polices, through the declaration.
 *
 * Four verdicts, and only the first two license a deletion:
 *
 * - INEXPRESSIBLE - the declaration cannot carry the violation; the emitter names its refusal.
 * - COMPILER-REFUSED - the declaration carries it, and the emitted cell fails `tsc`.
 * - REACHABLE - the emitted cell carries the violation and the rule fires. The rule must stay.
 * - UNREACHED - the emitted cell carries it and nothing catches it. A regression, not a licence.
 *
 * A crash is not a verdict, so the emitter validates its input and names every rejection.
 */

import { ROLE } from '../../../scripts/tools/role-brand.ts'
import { emitWorkflow, parseWorkflow } from '../../../scripts/tools/workflow-emit.ts'

/**
 * Resolved against this module rather than the working directory, because the check chain runs it from
 * the repository root and a relative `../../../` then points outside the repository entirely — which
 * Deno refuses, correctly, as a write beyond the permission it was granted.
 */
const PKG = new URL('../../../packages/effect-daemon-spec/', import.meta.url).pathname
const PROBE_REL = 'src/internal/falsify-probe.workflow.ts'
const PROBE = `${PKG}${PROBE_REL}`

/**
 * The declaration every attempt mutates, imported as the module it now is.
 *
 * Each clone is re-branded because a role stamps the brand non-enumerably, so the structured clone
 * that gives each attempt its own copy drops it — and an unbranded declaration is refused for that
 * reason rather than for the violation under test, which would make every verdict below vacuous.
 */
const BASE = (await import(
  '../../../packages/effect-daemon-spec/terms/internal/restart-decision.workflow.decl.ts'
)).default

/**
 * A channel's variant list, in whichever spelling the declaration uses.
 *
 * A channel may be written as a bare array of variants or as `{ variants, typeId }`, and the emitter
 * takes both. An attempt that assumed one spelling stopped reaching the field it mutates the moment the
 * declaration used the other — which is a broken attempt, not a passing one, so it is read rather than
 * assumed.
 */
const variantsOf = (channel: unknown): Record<string, unknown>[] =>
  Array.isArray(channel)
    ? channel as Record<string, unknown>[]
    : (channel as { variants: Record<string, unknown>[] }).variants

const clone = (): Record<string, unknown> => {
  const copy = JSON.parse(JSON.stringify(BASE)) as Record<string, unknown>
  Object.defineProperty(copy, ROLE, { value: 'workflow', enumerable: false })
  return copy
}

interface Attempt {
  readonly rule: string
  readonly violation: string
  readonly mutate: (d: Record<string, unknown>) => void
  /** Set when the rule's class is not about the emitted cell at all. */
  readonly outsidePopulation?: string
  /** Set when the rule is registered but never recommended, so no package can run it. */
  readonly shippedOff?: string
  /**
   * Set when the emitted cell carries the violation and no AST walker can decide it, with the
   * channel that can. Distinct from UNREACHED, which is a regression with no such argument.
   */
  readonly undecidableAtRungFour?: string
}

const ATTEMPTS: readonly Attempt[] = [
  {
    rule: 'workflow-single-function-export',
    violation: 'export two functions from one workflow',
    mutate: (d) => {
      d.operation = ['decideRestart', 'decideOther']
    },
  },
  {
    rule: 'workflow-command-object',
    violation: 'take no command object',
    mutate: (d) => {
      d.command = null
    },
  },
  {
    rule: 'workflow-declaration-form',
    violation: 'declare the decision as an annotated const instead of Workflow.make',
    mutate: (d) => {
      d.form = 'annotation'
    },
  },
  {
    rule: 'workflow-schema-required',
    violation: 'declare no decision variants',
    mutate: (d) => {
      d.decision = []
    },
  },
  {
    rule: 'workflow-either-inhabited',
    violation: 'declare no error variant, leaving the error channel uninhabited',
    mutate: (d) => {
      d.error = []
    },
  },
  {
    rule: 'workflow-typeid-required',
    violation: 'omit the union TypeId from a variant',
    mutate: (d) => {
      variantsOf(d.decision)[0]!.typeId = null
    },
  },
  {
    rule: 'workflow-typeid-shared-per-union',
    violation: 'give one variant a different TypeId',
    mutate: (d) => {
      variantsOf(d.decision)[0]!.typeId = { namespace: '@other', name: 'Other' }
    },
  },
  {
    rule: 'workflow-union-schema-declared',
    violation: 'declare the variant union as a bare TypeScript alias',
    mutate: (d) => {
      d.decisionUnion = 'RestartDecisionContinue | RestartDecisionRestart'
    },
  },
  {
    rule: 'workflow-no-unconstructed-variant',
    violation: 'declare a variant no dispatch arm constructs',
    mutate: (d) => {
      variantsOf(d.decision).push({ class: 'RestartDecisionDead', tag: 'Dead', fields: {} })
    },
  },
  {
    rule: 'workflow-no-throw',
    violation: 'throw instead of returning the error channel',
    mutate: (d) => {
      const dispatch = d.dispatch as Record<string, unknown>
      const arms = dispatch.arms as Record<string, unknown>[]
      arms[0].throws = 'RestartDecisionExhausted'
    },
  },
  {
    rule: 'workflow-no-async',
    violation: 'make the decision asynchronous',
    mutate: (d) => {
      d.async = true
    },
  },
  {
    rule: 'workflow-single-path',
    violation: 'branch with a loop inside the decision',
    mutate: (d) => {
      const dispatch = d.dispatch as Record<string, unknown>
      dispatch.iterate = { over: 'indices' }
    },
  },
  {
    rule: 'workflow-match-exhaustive',
    violation: 'fall back with Match.orElse over a closed literal union',
    undecidableAtRungFour:
      'the walker stays silent because it cannot tell a closed literal union from an open record ' +
      'without types - measured here on the three strategies. The exhaustiveness half rides rung 2: ' +
      'covering all three strategies under Match.exhaustive compiles at exit 0, and dropping one arm ' +
      'fails TS2345 with no suppression. What is left at rung 4 is the orElse-versus-exhaustive ' +
      'preference, which the type system cannot see and the walker cannot decide.',
    mutate: (d) => {
      const dispatch = d.dispatch as Record<string, unknown>
      // orElse over a record of booleans is legal by the rule's own carve-out, so the
      // violation has to dispatch on a closed literal union - the three strategies.
      dispatch.arms = [
        {
          pattern: { strategy: 'one_for_one' },
          channel: 'right',
          construct: 'RestartDecisionContinue',
          with: {},
        },
        {
          pattern: { strategy: 'one_for_all' },
          channel: 'right',
          construct: 'RestartDecisionContinue',
          with: {},
        },
        {
          pattern: { strategy: 'rest_for_one' },
          channel: 'left',
          construct: 'RestartDecisionExhausted',
          with: {},
        },
      ]
      dispatch.fallback = {
        channel: 'right',
        construct: 'RestartDecisionRestart',
        with: {
          indices: {
            call: 'restartIndicesFor',
            from: './restart-decision.kernel.js',
            args: ['strategy', 'failedIndex', 'totalChildren'],
          },
        },
      }
    },
  },
  {
    rule: 'workflow-no-ambient-impurity',
    violation: 'read the clock for a variant field',
    mutate: (d) => {
      const dispatch = d.dispatch as Record<string, unknown>
      const fallback = dispatch.fallback as Record<string, unknown>
      fallback.with = { indices: { call: 'Date.now', from: 'effect/Clock', args: [] } }
    },
  },
  {
    rule: 'workflow-no-effect-import',
    violation: 'pull a value from the effect barrel',
    mutate: (d) => {
      const dispatch = d.dispatch as Record<string, unknown>
      const fallback = dispatch.fallback as Record<string, unknown>
      fallback.with = { indices: { call: 'identity', from: 'effect', args: ['strategy'] } }
    },
  },
  {
    rule: 'workflow-no-panic-vocabulary',
    violation: 'name the error variant with pure panic vocabulary',
    mutate: (d) => {
      // `Failure` is not in GENERIC_SUFFIXES, so `UnexpectedFailure` reads as a domain noun
      // and the rule correctly permits it. `Error` is generic, so this is the real violation.
      variantsOf(d.error)[0] = { class: 'UnexpectedError', tag: 'UnexpectedError', fields: {} }
      const dispatch = d.dispatch as Record<string, unknown>
      const arms = dispatch.arms as Record<string, unknown>[]
      arms[1].construct = 'UnexpectedError'
    },
  },
  {
    rule: 'workflow-inline-schemas',
    violation: 'import the matching sibling schema cell',
    mutate: (d) => {
      // The rule keys on a schema import whose base equals the workflow's own base name,
      // so the probe's filename has to be the one it matches.
      d.command = { type: 'DecideInput', from: './falsify-probe.schema.js' }
    },
    shippedOff: 'registered by effect-workflow without being recommended, so effect-dmmf never enables it ' +
      '(src/index.ts:29-30 names the exclusion); measured 18 registered / 17 recommended',
  },
  {
    rule: 'workflow-property-test-shape',
    violation: 'use plain it() in a property test file',
    mutate: () => {},
    outsidePopulation:
      'governs *.property.test.ts, which the Definitions place outside the cell population; no declaration reaches it',
  },
]

const run = async (cmd: readonly string[], cwd: string): Promise<{ code: number; out: string }> => {
  const p = new Deno.Command(cmd[0], { args: cmd.slice(1), cwd, stdout: 'piped', stderr: 'piped' })
  const r = await p.output()
  return { code: r.code, out: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) }
}

const tally: Record<string, number> = {}
const record = (verdict: string): void => {
  tally[verdict] = (tally[verdict] ?? 0) + 1
}

for (const attempt of ATTEMPTS) {
  if (attempt.outsidePopulation !== undefined) {
    console.log(`OUTSIDE-POPULATION ${attempt.rule}`)
    console.log(`  ${attempt.violation}`)
    console.log(`  ${attempt.outsidePopulation}`)
    record('OUTSIDE-POPULATION')
    continue
  }

  const decl = clone()
  attempt.mutate(decl)

  let emitted: string
  try {
    emitted = emitWorkflow(parseWorkflow(decl))
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const named = message.startsWith('declaration rejected:')
    console.log(`${named ? 'INEXPRESSIBLE' : 'CRASH (not a verdict)'} ${attempt.rule}`)
    console.log(`  ${attempt.violation}`)
    console.log(`  ${message}`)
    record(named ? 'INEXPRESSIBLE' : 'CRASH')
    continue
  }

  await Deno.writeTextFile(PROBE, emitted)
  const lint = await run(['pnpm', 'exec', 'oxlint', PROBE_REL], PKG)
  const fires = lint.out.includes(attempt.rule)
  const tsc = await run(['pnpm', 'exec', 'tsc', '--noEmit'], PKG)
  await Deno.remove(PROBE)

  if (fires) {
    const line = lint.out.split('\n').find((l) => l.includes(attempt.rule)) ?? ''
    console.log(`REACHABLE ${attempt.rule}`)
    console.log(`  ${attempt.violation}`)
    console.log(`  rule fired: ${line.trim().slice(0, 210)}`)
    record('REACHABLE')
    continue
  }
  if (attempt.shippedOff !== undefined) {
    console.log(`SHIPPED-OFF ${attempt.rule}`)
    console.log(`  ${attempt.violation}`)
    console.log(`  the emitted cell carries the violation and the rule stays silent: ${attempt.shippedOff}`)
    if (tsc.code !== 0) {
      console.log(
        `  (tsc also fails here, on the probe's absent sibling module - an artifact, not a refusal)`,
      )
    }
    record('SHIPPED-OFF')
    continue
  }
  if (tsc.code !== 0) {
    const line = tsc.out.split('\n').find((l) => /error TS\d+/.test(l)) ?? ''
    console.log(`COMPILER-REFUSED ${attempt.rule}`)
    console.log(`  ${attempt.violation}`)
    console.log(`  ${line.trim().slice(0, 210)}`)
    record('COMPILER-REFUSED')
    continue
  }
  if (attempt.undecidableAtRungFour !== undefined) {
    console.log(`UNDECIDABLE-AT-RUNG-4 ${attempt.rule}`)
    console.log(`  ${attempt.violation}`)
    console.log(`  ${attempt.undecidableAtRungFour}`)
    record('UNDECIDABLE-AT-RUNG-4')
    continue
  }
  console.log(`UNREACHED ${attempt.rule}`)
  console.log(`  ${attempt.violation}`)
  console.log(
    `  emitted cell carries the violation; neither the rule nor tsc caught it - a regression, not a licence`,
  )
  record('UNREACHED')
}

console.log('\n--- workflow role verdict, all shipped rules')
for (const [verdict, count] of Object.entries(tally).sort()) console.log(`${verdict} ${count}`)

/**
 * The two verdicts that are failures, and they exit non-zero rather than printing a warning.
 *
 * This script runs in the check chain, so a verdict it merely narrates is a verdict nothing acts on. An
 * UNREACHED is a violation that is still expressible and no longer caught — the regression a deletion
 * would have to be re-argued against — and a CRASH is a refusal by accident, which stops a violation
 * without ever stating what a declaration may contain.
 */
const crashes = tally.CRASH ?? 0
const regressions = tally.UNREACHED ?? 0
if (crashes > 0) console.error(`\n${crashes} refusal(s) by crash rather than by language - fix before citing.`)
if (regressions > 0) {
  console.error(`\n${regressions} regression(s): expressible and uncaught. A deletion's licence is withdrawn.`)
}
Deno.exitCode = crashes + regressions > 0 ? 1 : 0
