#!/usr/bin/env -S deno run --allow-read --allow-run=git
// Run it as:  deno run --allow-read --allow-run=git scripts/guards/check-rule-suppression.ts
// Selftest:   deno run --allow-read --allow-run=git scripts/guards/check-rule-suppression.ts --selftest
//
// Some lint rules are the only layer that closes a hole. `make-command-schema`
// is one: the command position of `Workflow.make` is checked by the compiler for
// every shape the compiler can see, and by that rule for the three it cannot —
// an assertion, an enumerated laundering call, a `declare`d binding. A single
// disable comment reopens all three while `pnpm check:local` still exits 0,
// which is the difference between the rule being force and the rule being
// presence.
//
// So the suppression itself is the violation. This gate reads the tracked source
// bytes and fails on any disable directive naming a protected rule id. It keys on
// nothing an author supplied except the source it is judging: no metadata field,
// no opt-out list, no allowlist to grow.
//
// Scope note: oxlint honours `oxlint-disable*` and `eslint-disable*` in both
// comment syntaxes, so both prefixes are matched. A rule id can be written bare
// (`make-command-schema`) or plugin-qualified
// (`@systemfsoftware/oxlint-plugin-effect-workflow/make-command-schema`); the
// match is on the bare id, which is a suffix of the qualified one, so both forms
// are caught by one pattern.

/** The rule ids whose suppression fails the build, bare form. */
const PROTECTED_RULE_IDS: readonly string[] = ['make-command-schema']

/** A disable directive of either linter, in either comment syntax. */
const DISABLE_DIRECTIVE = /(?:oxlint|eslint)-disable(?:-next-line|-line)?/

const SOURCE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

/**
 * This file names every protected id in its own prose and in `PROTECTED_RULE_IDS`,
 * and the selftest fixture below is a literal violation. Scanning itself would
 * report both, so the gate's own path is the one exclusion — a file that is about
 * the directives cannot be judged by a scan for them.
 */
const SELF_PATH = 'scripts/guards/check-rule-suppression.ts'

interface Finding {
  readonly file: string
  readonly line: number
  readonly ruleId: string
  readonly text: string
}

/** A comment suppressing a protected rule, if this line is one. */
export const suppressionOn = (line: string): string | null => {
  if (!DISABLE_DIRECTIVE.test(line)) return null
  const comment = line.includes('//') || line.includes('/*')
  if (!comment) return null
  return PROTECTED_RULE_IDS.find((ruleId) => line.includes(ruleId)) ?? null
}

const trackedSourceFiles = async (): Promise<readonly string[]> => {
  const git = new Deno.Command('git', { args: ['ls-files', '-z'], stdout: 'piped', stderr: 'piped' })
  const { code, stdout, stderr } = await git.output()
  if (code !== 0) {
    throw new Error(`git ls-files failed: ${new TextDecoder().decode(stderr)}`)
  }
  return new TextDecoder()
    .decode(stdout)
    .split('\0')
    .filter((path) => path !== '')
    .filter((path) => !path.startsWith('repos/'))
    .filter((path) => path !== SELF_PATH)
    .filter((path) => SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)))
}

const findingsIn = (file: string, contents: string): readonly Finding[] => {
  const findings: Finding[] = []
  const lines = contents.split('\n')
  for (const [index, line] of lines.entries()) {
    const ruleId = suppressionOn(line)
    if (ruleId !== null) {
      findings.push({ file, line: index + 1, ruleId, text: line.trim() })
    }
  }
  return findings
}

const scan = async (): Promise<readonly Finding[]> => {
  const files = await trackedSourceFiles()
  const findings: Finding[] = []
  for (const file of files) {
    const contents = await Deno.readTextFile(file).catch(() => null)
    if (contents === null) continue
    findings.push(...findingsIn(file, contents))
  }
  return findings
}

/**
 * The gate's own negative control. A gate that reports nothing is
 * indistinguishable from a gate that cannot report, so the selftest runs the same
 * predicate over a line that must be caught and a set that must not, and fails on
 * either surprise.
 */
const selftest = (): number => {
  const mustCatch: readonly string[] = [
    '// oxlint-disable-next-line make-command-schema',
    '  // eslint-disable-next-line make-command-schema -- shipping this',
    '/* oxlint-disable make-command-schema */',
    '// oxlint-disable-line @systemfsoftware/oxlint-plugin-effect-workflow/make-command-schema',
    '// eslint-disable @systemfsoftware/oxlint-plugin-effect-workflow/make-command-schema',
  ]
  const mustIgnore: readonly string[] = [
    '// oxlint-disable-next-line no-console',
    'const name = "make-command-schema"',
    'export const makeCommandSchema = defineRule({',
    "  [rule('make-command-schema')]: 'error',",
    '// a comment mentioning make-command-schema without a directive',
    'oxlint-disable-next-line make-command-schema',
  ]

  const missed = mustCatch.filter((line) => suppressionOn(line) === null)
  const overreached = mustIgnore.filter((line) => suppressionOn(line) !== null)

  for (const line of missed) console.error(`selftest: MISSED  ${line}`)
  for (const line of overreached) console.error(`selftest: OVERREACHED  ${line}`)

  if (missed.length > 0 || overreached.length > 0) {
    console.error(`selftest FAILED: ${missed.length} missed, ${overreached.length} overreached`)
    return 1
  }
  console.log(`selftest ok: ${mustCatch.length} caught, ${mustIgnore.length} ignored`)
  return 0
}

if (import.meta.main) {
  if (Deno.args.includes('--selftest')) {
    Deno.exit(selftest())
  }
  const findings = await scan()
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: suppression of ${finding.ruleId} — ${finding.text}`)
    }
    console.error(
      `\n${findings.length} suppression(s) of a protected rule. This rule is the only layer that closes its hole, so its suppression is the violation: remove the comment and fix the command position it was hiding.`,
    )
    Deno.exit(1)
  }
  console.log(`no suppression of ${PROTECTED_RULE_IDS.join(', ')}`)
}
