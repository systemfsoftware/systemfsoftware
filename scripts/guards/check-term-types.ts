#!/usr/bin/env -S deno run --allow-read --allow-run=deno --allow-write=. --allow-env
/**
 * Typechecks every declaration authored in TypeScript, so the checking a declaration claims is a gate.
 *
 * Without this the claim enforces nothing. A `.term.ts` or a `.decl.ts` lives under `terms/`, which no
 * package `tsconfig.json` includes — they list `src` and `__tests__` — so `pnpm typecheck` never sees
 * one. A term's role refusal and a declaration's field types both fired only when someone ran
 * `deno check` by hand. The
 * corpus's ruling on this is explicit and it is the one band above `posit` among the pages this work
 * rests on: a consumer type checker is window-mediated, not a gate, because it returns a diagnostic
 * and "the file, the commit, and the emission stand". It becomes gate-class only when something
 * refuses to proceed until it passes. This script is that something, and `gate:tasks` runs it, so
 * `pnpm check:local` and `check:ci` both block.
 *
 * The probes are checked for the same reason and are not decoration: each `@ts-expect-error` in them
 * is an assertion that a violation is *still* refused, so an unused directive — a hole reopening —
 * fails this gate rather than sitting green in a docs directory. `escapes.run.ts` covers the two
 * refusals that happen at runtime rather than in the type system.
 */

/** Runs a command and returns its exit code with the output it produced. */
const run = async (args: readonly string[]): Promise<{ readonly code: number; readonly out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(args[0]!, {
    args: [...args.slice(1)],
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  const decode = new TextDecoder()
  return { code, out: decode.decode(stdout) + decode.decode(stderr) }
}

/**
 * Every tracked declaration authored in TypeScript, plus the probes that assert the refusals fire.
 *
 * Both authorship forms are here for one reason: a declaration whose types nothing checks is a
 * declaration whose types are a comment. A `.term.ts` carries a role's requirement channel and a
 * `.decl.ts` carries a role's field vocabulary, and each is only as binding as this gate.
 */
const targets = async (): Promise<readonly string[]> => {
  const { code, out } = await run(['git', 'ls-files'])
  if (code !== 0) throw new Error('git ls-files failed')
  return out.split('\n').filter((path) =>
    path.endsWith('.term.ts') || path.endsWith('.decl.ts') || path.endsWith('.probe.ts') || isRunProbe(path)
  )
}

/**
 * The falsifications that have to be run rather than typechecked, discovered rather than listed.
 *
 * A `*.run.ts` beside a term asserts something no typechecker can: that a refusal fires at runtime,
 * or that an emitted artifact is still its term's output. Discovering them by suffix rather than
 * naming them here means adding one wires it in — a list is a place to forget an entry, and a
 * forgotten entry is a check that silently stopped running.
 */
const isRunProbe = (path: string): boolean => path.endsWith('.run.ts')

const main = async (): Promise<number> => {
  const files = await targets()
  if (files.length === 0) {
    console.error('check-term-types: no declarations or probes found, which means this gate is checking nothing')
    return 1
  }
  // One `deno check` over the whole set: it resolves the shared graph once, and a single invocation
  // reports every file's diagnostics rather than stopping at the first failing module.
  const typecheck = await run(['deno', 'check', ...files])
  if (typecheck.code !== 0) {
    console.error(typecheck.out.trimEnd())
    console.error(`check-term-types: ${files.length} file(s) checked, type errors above`)
    return 1
  }
  let failed = false
  for (const probe of files.filter(isRunProbe)) {
    const result = await run([
      'deno',
      'run',
      '--allow-read',
      '--allow-write=.',
      '--allow-run=deno,./bin/dprint',
      '--allow-env',
      probe,
    ])
    console.log(result.out.trimEnd())
    if (result.code !== 0) failed = true
  }
  if (failed) return 1
  console.log(`check-term-types: ${files.length} declaration(s) and probe(s) typecheck clean`)
  return 0
}

if (import.meta.main) Deno.exitCode = await main()
