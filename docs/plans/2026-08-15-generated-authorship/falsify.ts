#!/usr/bin/env -S deno run --allow-read=. --allow-write=. --allow-run=deno

/**
 * Attempts each executor-rule violation THROUGH the declaration language, and
 * reports a verdict for every rule the `effect-executor` plugin ships.
 *
 * The brief's deletion licence requires this per rule: a class is `unreachable`
 * only when the violation cannot be expressed in the declaration, or when
 * expressing it produces code that fails to compile. Anything else is merely
 * `forbidden` - a walker reporting it after the fact - and buys no deletion.
 *
 * Verdicts:
 *   INEXPRESSIBLE     the declaration cannot carry the violation; the emitter refuses
 *   REACHABLE         the violation reached emitted output; the rule must stay
 *   SURVIVES-INTERIOR the class lives in a body, not in shape. An executor's body is a
 *                     `kernel` cell it imports, so the class is not an executor-shape
 *                     class at all and emission neither reaches nor removes it
 *   UNPROBED          the emitter does not model this part of the shape yet; naming what
 *                     is missing rather than claiming a result
 */

const BASE = {
  role: 'executor',
  operation: 'emittedProbe',
  deps: { type: 'Scope.Scope' },
  imports: [
    { module: 'effect', values: ['Context', 'Effect'], types: ['Scope'] },
    { module: './hook-session.kernel.js', typeOnly: true, types: ['HookSession'] },
  ],
  params: [{ name: 'ctx', type: 'HookSession' }],
  body: { module: './run-session-start-hooks.executor.js', export: 'runSessionStartHooks' },
} as const

type Verdict = 'INEXPRESSIBLE' | 'REACHABLE' | 'SURVIVES-INTERIOR' | 'UNPROBED'

interface Case {
  readonly rule: string
  readonly violation: string
  /** Present when the violation is attemptable through the declaration. */
  readonly decl?: Record<string, unknown>
  /** A regex over emitted output proving the violation landed. */
  readonly landed?: RegExp
  /** Set when the class is not a shape class, naming where it does live. */
  readonly interior?: string
  /** Set when the emitter cannot model this shape yet, naming the gap. */
  readonly unprobed?: string
}

const CASES: readonly Case[] = [
  {
    rule: 'executor-deps-tag-name',
    violation: 'name the deps tag something other than <Operation>ExecutorDeps',
    decl: { ...BASE, depsTagName: 'WronglyNamedDeps' },
    landed: /WronglyNamedDeps/,
  },
  {
    rule: 'executor-requires-deps-tag',
    violation: 'emit an executor with no deps tag at all',
    decl: { ...BASE, deps: null },
    landed: /^(?![\s\S]*Context\.Tag)[\s\S]*$/,
  },
  {
    rule: 'executor-owns-context-tag',
    violation: 'point the deps tag at a tag declared in another module',
    decl: { ...BASE, depsTagFrom: './somewhere-else.executor.js' },
    landed: /somewhere-else/,
  },
  {
    rule: 'executor-single-operation-export',
    violation: 'export two operations from one executor',
    decl: { ...BASE, operation: ['first', 'second'] },
    landed: /export const second/,
  },
  {
    rule: 'executor-no-layer-binding',
    violation: 'bind a Layer inside the executor instead of at the composition root',
    decl: { ...BASE, layer: { bind: 'Layer.succeed' } },
    landed: /Layer\.succeed/,
  },
  {
    rule: 'executor-deps-borrowed-types',
    violation: 'hand-write a method signature in the deps shape instead of borrowing the provider type',
    decl: { ...BASE, deps: { type: 'Scope.Scope', methods: ['run: (x: string) => Effect<void>'] } },
    landed: /=>/,
  },
  {
    rule: 'executor-no-domain-branch',
    violation: 'branch on a decoded domain value inside the executor',
    interior: 'a body statement. The body is a `kernel` cell the executor imports; the branch is written there, ' +
      'and the rule reads the executor file it no longer appears in. Emission neither reaches nor removes this class.',
  },
  {
    rule: 'executor-no-escaping-state',
    violation: 'hold module-level mutable state in the executor',
    interior: 'a module-level initializer. `enforceability-is-not-an-axis` names this exact class as its ' +
      'demonstrated interior failure: the sibling `observer-no-escaping-state` misses the same state one ' +
      'indirection away behind a wrapper call.',
  },
  {
    rule: 'executor-no-io-in-filling',
    violation: 'perform I/O inside a pure phase body',
    interior: 'a phase-body statement, and its own config states the rule "would decide nothing" when the walked ' +
      'vocabulary reports no pure phase. `axis-mechanizability-verdict` holds purity undecidable at enforcement ' +
      'grade in unannotated TypeScript, so this is a candidate for `undecidable here` rather than for deletion.',
  },
  {
    rule: 'executor-requires-description',
    violation: 'reach a workflow without expressing the sandwich as a Cell description',
    unprobed: 'the emitter models no description reference, and the rule fires on a call site that reaches a ' +
      "workflow - which this probe's declaration never does. Emitting a workflow-reaching executor is the " +
      'missing capability; until it exists this rule has no verdict.',
  },
]

const emit = async (decl: Record<string, unknown>): Promise<{ ok: boolean; out: string }> => {
  const tmp = `./.falsify-${crypto.randomUUID()}.json`
  await Deno.writeTextFile(tmp, JSON.stringify(decl))
  const cmd = new Deno.Command('deno', {
    args: ['run', '--allow-read=.', '--allow-write=.', 'emit.ts', tmp],
    stdout: 'piped',
    stderr: 'piped',
  })
  const { code, stdout, stderr } = await cmd.output()
  await Deno.remove(tmp)
  const dec = new TextDecoder()
  return { ok: code === 0, out: dec.decode(stdout) + dec.decode(stderr) }
}

const tally: Record<Verdict, number> = {
  'INEXPRESSIBLE': 0,
  'REACHABLE': 0,
  'SURVIVES-INTERIOR': 0,
  'UNPROBED': 0,
}

for (const c of CASES) {
  let verdict: Verdict
  let detail: string

  if (c.interior !== undefined) {
    verdict = 'SURVIVES-INTERIOR'
    detail = c.interior
  } else if (c.unprobed !== undefined) {
    verdict = 'UNPROBED'
    detail = c.unprobed
  } else if (c.decl !== undefined) {
    const { ok, out } = await emit(c.decl)
    const landed = ok && (c.landed?.test(out) ?? false)
    verdict = landed ? 'REACHABLE' : 'INEXPRESSIBLE'
    detail = landed
      ? 'the violation appears in emitted output'
      : out.split('\n').find((l) => l.startsWith('declaration rejected:')) ??
        'unnamed refusal (crash, not a rejection)'
  } else {
    verdict = 'UNPROBED'
    detail = 'no attempt defined'
  }

  tally[verdict] += 1
  console.log(`${verdict.padEnd(18)} ${c.rule}`)
  console.log(`                   ${c.violation}`)
  console.log(`                   ${detail}`)
  console.log()
}

console.log('--- executor role verdict, all shipped rules')
for (const [v, n] of Object.entries(tally)) console.log(`  ${v.padEnd(18)} ${n}`)
console.log(
  `\n${tally.INEXPRESSIBLE}/${CASES.length} deletable on this evidence; ` +
    `${tally['SURVIVES-INTERIOR']} survive as interior classes emission does not touch; ` +
    `${tally.UNPROBED} await emitter capability.`,
)
if (tally.REACHABLE > 0) console.log(`${tally.REACHABLE} rule(s) must stay: the violation reached emitted output.`)
