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

/**
 * The same directive with whatever follows it, so a blanket form can be told from a
 * targeted one. A directive naming no rule disables every rule, which is a suppression
 * of each protected id without ever spelling one - the shape a scan keyed only on the id
 * cannot see. `--` opens oxlint's explanation, so text after it names nothing.
 */
const DIRECTIVE_WITH_TAIL = /(?:oxlint|eslint)-disable(?:-next-line|-line)?([^\n]*)/

/** True when the directive names no rule, and so disables all of them. */
const isBlanket = (line: string): boolean => {
  const tail = DIRECTIVE_WITH_TAIL.exec(line)?.[1] ?? ''
  const named = tail.split('--')[0] ?? ''
  return named.replace(/[*/\s]/g, '') === ''
}

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

/**
 * A comment suppressing a protected rule, if this line is one.
 *
 * Two forms this gate shipped blind to, both measured, both honoured by oxlint:
 *
 * A directive inside a block comment the formatter has wrapped sits on a continuation
 * line carrying neither `//` nor `/*`, only a leading `*`.
 *
 * A directive naming no rule at all disables every rule, so it suppresses each
 * protected id without spelling one - invisible to a scan keyed on the id, and the
 * broadest suppression available. It is reported against the first protected id,
 * because the finding is about the directive and not about which id it reached.
 *
 * The predicate errs closed on purpose. A string literal that spells out a full
 * directive is flagged, which costs an author one rename; the opposite error costs
 * the only layer that closes a laundered command.
 */
export const suppressionOn = (line: string): string | null => {
  if (!DISABLE_DIRECTIVE.test(line)) return null
  const comment = line.includes('//') || line.includes('/*') || line.trimStart().startsWith('*')
  if (!comment) return null
  const named = PROTECTED_RULE_IDS.find((ruleId) => line.includes(ruleId))
  if (named !== undefined) return named
  return isBlanket(line) ? PROTECTED_RULE_IDS[0] ?? null : null
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
    // The wrapped block comment. This gate shipped exiting 0 on a file carrying it.
    ' * oxlint-disable make-command-schema',
    '   * eslint-disable-next-line make-command-schema -- wrapped by the formatter',
    // The blanket directive. It names no rule and so disables every one, including
    // this one; the gate shipped exiting 0 on it too.
    '// oxlint-disable',
    '/* eslint-disable */',
    '// oxlint-disable -- the whole file is generated',
  ]
  const mustIgnore: readonly string[] = [
    '// oxlint-disable-next-line no-console',
    'const name = "make-command-schema"',
    'export const makeCommandSchema = defineRule({',
    "  [rule('make-command-schema')]: 'error',",
    '// a comment mentioning make-command-schema without a directive',
    'oxlint-disable-next-line make-command-schema',
    // A targeted directive naming some other rule leaves this one on, so it is not a
    // suppression. This row is what stops the blanket case from swallowing everything.
    '// eslint-disable-next-line no-misused-spread, no-console',
    '/* oxlint-disable no-console */',
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
