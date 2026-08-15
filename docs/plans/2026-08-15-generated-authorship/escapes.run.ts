#!/usr/bin/env -S deno run --allow-read --allow-write=. --allow-run=deno
/**
 * The escapes that are not type errors, checked by running the compiler.
 *
 * A type probe cannot cover these: one is a brand written at runtime, the other is a role name that
 * disagrees with a filename. Both were verified to emit a working cell before the comparison in
 * `parseProgram` existed — a `.kernel.term.ts` built with the executor constructor emitted a kernel
 * that reads the clock, which is precisely the class the role types exist to make impossible.
 *
 * Each case writes a term file, runs the compiler on it, and asserts the outcome. Exit 0 means every
 * refusal fired and the honest path still compiles.
 */
const HERE = new URL('.', import.meta.url).pathname
const TOOLS = '../../../scripts/tools'

/** Runs the compiler on a term file and returns its exit code and stderr. */
const compile = async (file: string): Promise<{ readonly code: number; readonly err: string }> => {
  const command = new Deno.Command('deno', {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', `${HERE}${TOOLS}/term-compile.ts`, file],
    stdout: 'piped',
    stderr: 'piped',
  })
  const { code, stderr } = await command.output()
  return { code, err: new TextDecoder().decode(stderr) }
}

/**
 * One case: a term file's source, and what the compiler must do with it.
 *
 * `expect` is a fragment of the refusal, never just a non-zero code — a case that passes on any
 * failure passes on a typo in the fixture, which is the check testing itself rather than the tool.
 */
interface Case {
  readonly label: string
  readonly suffix: string
  readonly source: string
  readonly expect: string | 'compiles'
}

const CASES: readonly Case[] = [
  {
    label: 'the wrong constructor: an executor-built program in a kernel cell',
    suffix: 'kernel',
    source: `import { executor, invoke, lam } from '${TOOLS}/cell.ts'
export default executor({
  declarations: [{ name: 'now', term: lam([], () => invoke('Date.now')) }],
})
`,
    expect: 'built by the executor role',
  },
  {
    label: 'a hand-built program with no role at all',
    suffix: 'kernel',
    source: `export default {
  imports: [],
  declarations: [{ kind: 'term', name: 'now', term: { ref: 'Date.now' } }],
}
`,
    expect: 'was not built by a role',
  },
  {
    label: 'a forged brand whose name disagrees with the filename',
    suffix: 'kernel',
    source: `import { ROLE } from '${TOOLS}/role-brand.ts'
const program = {
  imports: [],
  declarations: [{ kind: 'term', name: 'now', term: { ref: 'Date.now' } }],
}
export default Object.defineProperty(program, ROLE, { value: 'executor' })
`,
    expect: 'built by the executor role',
  },
  {
    label: 'the honest path',
    suffix: 'kernel',
    source: `import { kernel, lam, lit, op } from '${TOOLS}/cell.ts'
export default kernel({
  declarations: [{ name: 'double', term: lam([['n', { ref: 'number' }]], (n) => op('*', n, lit(2))) }],
})
`,
    expect: 'compiles',
  },
]

/**
 * The residue, stated rather than tested: a brand forged with the *matching* name still passes.
 *
 * `ROLE` is importable and the comparison is against a string, so an author who writes
 * `{ value: 'kernel' }` in a `.kernel.term.ts` satisfies both checks. Closing it needs provenance
 * rather than a token — the brand would have to be unforgeable, which in a module system an author
 * controls it cannot be. What the comparison buys is that the lie must now name the role whose
 * constraints are being escaped, in a file whose suffix agrees: visible in review instead of silent.
 */
const RESIDUE = 'a brand forged with the matching role name — review, not mechanism'

const main = async (): Promise<number> => {
  let failures = 0
  for (const [index, testCase] of CASES.entries()) {
    const file = `${HERE}escape-${index}.probe.${testCase.suffix}.term.ts`
    await Deno.writeTextFile(file, testCase.source)
    try {
      const { code, err } = await compile(file)
      if (testCase.expect === 'compiles') {
        if (code === 0) console.log(`  ok    ${testCase.label}`)
        else {
          failures += 1
          console.error(`  FAIL  ${testCase.label}\n        expected success, got:\n${err.trim()}`)
        }
        continue
      }
      if (code !== 0 && err.includes(testCase.expect)) {
        console.log(`  ok    ${testCase.label}`)
        continue
      }
      failures += 1
      console.error(
        `  FAIL  ${testCase.label}\n        expected a refusal naming ${JSON.stringify(testCase.expect)}, ` +
          `got exit ${code}:\n${err.trim() || '(no stderr — it compiled)'}`,
      )
    } finally {
      await Deno.remove(file).catch(() => {})
    }
  }
  console.log(`  note  residue: ${RESIDUE}`)
  console.log(failures === 0 ? 'escapes.run: every refusal fired' : `escapes.run: ${failures} failure(s)`)
  return failures === 0 ? 0 : 1
}

if (import.meta.main) Deno.exitCode = await main()
