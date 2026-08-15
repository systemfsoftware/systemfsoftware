#!/usr/bin/env -S deno run --allow-read=. --allow-write=. --allow-run=deno

/**
 * Attempts each executor-rule violation THROUGH the declaration language.
 *
 * The brief's deletion licence requires this per rule: a class is `unreachable`
 * only when the violation cannot be expressed in the declaration, or when
 * expressing it produces code that fails to compile. Anything else is merely
 * `forbidden` - a walker reporting it after the fact - and buys no deletion.
 *
 * Verdicts:
 *   INEXPRESSIBLE - the declaration has no field that could carry the violation
 *   IGNORED       - a field was accepted but the emitter derives the value anyway
 *   REACHABLE     - the violation reached the emitted output; the rule must stay
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

interface Attempt {
  readonly rule: string
  readonly violation: string
  /** The declaration an author would have to write to commit the violation. */
  readonly decl: Record<string, unknown>
  /** A regex over the emitted output that would prove the violation landed. */
  readonly landed: RegExp
}

const ATTEMPTS: readonly Attempt[] = [
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

let reachable = 0
for (const a of ATTEMPTS) {
  const { ok, out } = await emit(a.decl)
  const landedInOutput = ok && a.landed.test(out)
  const verdict = landedInOutput ? 'REACHABLE' : ok ? 'IGNORED' : 'INEXPRESSIBLE'
  if (landedInOutput) reachable += 1
  console.log(`${verdict.padEnd(15)} ${a.rule}`)
  console.log(`                ${a.violation}`)
  if (!ok) {
    const named = out.split('\n').find((l) => l.startsWith('declaration rejected:'))
    console.log(`                ${named ?? 'unnamed refusal (crash, not a rejection)'}`)
  }
}
console.log(
  `\n${ATTEMPTS.length - reachable}/${ATTEMPTS.length} violations could not reach the emitted output`,
)
if (reachable > 0) console.log(`${reachable} rule(s) must stay: their class is still reachable`)
