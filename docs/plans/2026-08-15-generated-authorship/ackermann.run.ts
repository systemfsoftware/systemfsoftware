#!/usr/bin/env -S deno run --allow-read --allow-write=. --allow-run=deno,./bin/dprint --allow-env
/**
 * The Turing-completeness witnesses, settled by running rather than by reading.
 *
 * Three checks, and the middle one exists because it caught a real defect. The witness is compiled
 * from `ackermann.term.ts` into `ackermann.ts`, and `ackermann.ts` sits under `docs/plans/`, which
 * the authorship gate deliberately excludes from the cell population — so when the compiler's
 * operator precedence changed, the emitted file went stale and nothing said so. A term-derived
 * artifact outside the gate's population needs its own round-trip check or it silently stops being
 * its term's output, which is the exact failure the gate exists to prevent one directory over.
 *
 * The numeric checks are the actual claim: Ackermann grows faster than any primitive recursive
 * function, so a language that computes it is not doing bounded iteration, and Collatz has no proof
 * of totality, so a language that runs it admits non-termination. Both are checked against values
 * established independently of this implementation — a closed form and published step counts.
 */
const HERE = new URL('.', import.meta.url).pathname
/** The repository root, so `./bin/dprint` resolves the same way every other caller spells it. */
const ROOT = new URL('../../../', import.meta.url).pathname
const DIR = 'docs/plans/2026-08-15-generated-authorship'
const TERM = `${DIR}/ackermann.term.ts`
const CELL = `${HERE}ackermann.ts`

/** Compiles the term to a temporary file and returns its formatted bytes. */
const emit = async (): Promise<string> => {
  const probe = `${DIR}/ackermann.emitprobe.ts`
  const compile = new Deno.Command('deno', {
    args: ['run', '--allow-read', '--allow-write', '--allow-env', 'scripts/tools/term-compile.ts', TERM, probe],
    cwd: ROOT,
    stdout: 'piped',
    stderr: 'piped',
  })
  const { code, stderr } = await compile.output()
  if (code !== 0) throw new Error(`compiling the witness failed:\n${new TextDecoder().decode(stderr)}`)
  try {
    const format = new Deno.Command('./bin/dprint', {
      args: ['fmt', probe],
      cwd: ROOT,
      stdout: 'null',
      stderr: 'piped',
    })
    const formatted = await format.output()
    if (formatted.code !== 0) {
      throw new Error(`formatting the witness failed:\n${new TextDecoder().decode(formatted.stderr)}`)
    }
    return await Deno.readTextFile(`${ROOT}${probe}`)
  } finally {
    await Deno.remove(`${ROOT}${probe}`).catch(() => {})
  }
}

/** `A(3, n) = 2^(n+3) - 3`, the closed form the recursion is checked against. */
const closedForm = (n: number): number => 2 ** (n + 3) - 3

/** Published Collatz step counts, which no property of this implementation could have produced. */
const COLLATZ_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 1],
  [3, 7],
  [6, 8],
  [7, 16],
  [27, 111],
  [97, 118],
  [871, 178],
]

const main = async (): Promise<number> => {
  const failures: string[] = []

  const emitted = await emit()
  const onDisk = await Deno.readTextFile(CELL)
  if (emitted === onDisk) {
    console.log("  ok    ackermann.ts is its term's output, byte for byte")
  } else {
    failures.push(
      `ackermann.ts has drifted from ackermann.term.ts. Regenerate it:\n` +
        `        deno run --allow-read --allow-write --allow-env scripts/tools/term-compile.ts \\\n` +
        `          docs/plans/2026-08-15-generated-authorship/ackermann.term.ts \\\n` +
        `          docs/plans/2026-08-15-generated-authorship/ackermann.ts && ./bin/dprint fmt <that file>`,
    )
  }

  const witness = await import(CELL) as {
    readonly ackermann: (m: number, n: number) => number
    readonly collatzLength: (n: number) => number
  }

  const wrongAckermann = [0, 1, 2, 3, 5, 7, 9]
    .filter((n) => witness.ackermann(3, n) !== closedForm(n))
    .map((n) => `A(3, ${n}) = ${witness.ackermann(3, n)}, closed form gives ${closedForm(n)}`)
  if (wrongAckermann.length === 0) console.log('  ok    A(3, n) matches 2^(n+3) - 3 at seven points')
  else failures.push(...wrongAckermann)

  const wrongCollatz = COLLATZ_STEPS
    .filter(([n, steps]) => witness.collatzLength(n) !== steps)
    .map(([n, steps]) => `collatzLength(${n}) = ${witness.collatzLength(n)}, published count is ${steps}`)
  if (wrongCollatz.length === 0) console.log(`  ok    Collatz step counts match at ${COLLATZ_STEPS.length} points`)
  else failures.push(...wrongCollatz)

  for (const failure of failures) console.error(`  FAIL  ${failure}`)
  console.log(
    failures.length === 0
      ? 'ackermann.run: the language reaches general recursion'
      : `ackermann.run: ${failures.length} failure(s)`,
  )
  return failures.length === 0 ? 0 : 1
}

if (import.meta.main) Deno.exitCode = await main()
