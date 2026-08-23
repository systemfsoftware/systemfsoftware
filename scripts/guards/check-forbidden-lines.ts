#!/usr/bin/env -S deno run --allow-read --allow-run=git
// Run it as:  deno run --allow-read --allow-run=git scripts/guards/check-forbidden-lines.ts
// Selftest:   deno run --allow-read --allow-run=git scripts/guards/check-forbidden-lines.ts --selftest
//
// One mechanism: read the tracked bytes once and report every line whose SHAPE is
// forbidden. Two predicates ride that single pass, because they are the same
// mechanism with different patterns and different file scopes — a second guard
// would buy a second `git ls-files`, a second full-tree read, and a second
// entry in the check chain, and the chain's cost is its entry count.
//
// Both predicates key on nothing an author supplied except the source being
// judged: no metadata field, no opt-out marker, no allowlist to grow. That is
// what makes them falsifiable — an author cannot silently exempt a file.
//
// ---------------------------------------------------------------------------
// Predicate 1 — suppression of a protected lint rule (source files only)
//
// Some lint rules are the only layer that closes a hole. `make-command-schema`
// is one: the command position of `Workflow.make` is checked by the compiler for
// every shape the compiler can see, and by that rule for the three it cannot —
// an assertion, an enumerated laundering call, a `declare`d binding. A single
// disable comment reopens all three while `pnpm check:local` still exits 0,
// which is the difference between the rule being force and the rule being
// presence. So the suppression itself is the violation.
//
// oxlint honours `oxlint-disable*` and `eslint-disable*` in both comment
// syntaxes, so both prefixes are matched. A rule id can be written bare
// (`make-command-schema`) or plugin-qualified; the match is on the bare id,
// which is a suffix of the qualified one, so one pattern catches both.
//
// ---------------------------------------------------------------------------
// Predicate 2 — an unresolved merge conflict marker (every tracked file)
//
// `.github/workflows/conflict-check.yml` asks `git merge-tree` whether this
// branch would conflict with its base. That question is about a merge that has
// not happened, so it is blind to markers already committed on both sides — and
// on 2026-08-23 `AGENTS.md` reached `main` carrying `<` x7 `Updated upstream`
// around REPO-R2, with a duplicated REPO-R3 and a superseded REPO-R2 inside it.
// Every gate in the chain exited 0, because no gate read the bytes.
//
// It reports the opening and closing markers only, never the bare `=` x7 middle
// one. A line of exactly seven `=` is a Markdown setext heading underline, and
// this tree is documentation-heavy; a conflict always writes all three markers,
// so dropping the ambiguous one costs no detection.
//
// It does NOT skip fenced code blocks, deliberately. A fence tracker is a state
// machine over untrusted prose, and both ways it goes wrong hide a real marker:
// an unterminated fence makes every line after it invisible, and a `~~~` line
// inside a backtick fence flips the state so the closing fence reopens it. Both
// were reproduced against the tracked predicate before this note was written.
// A false negative here is a gate that silently stopped working — the exact
// defect it exists to catch — while the false positive it trades for is loud and
// fixed by indenting one space. A marker at column zero is never real content.

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

/**
 * git writes a label after the opening marker, but tolerate a bare one. Leading
 * whitespace is allowed because the marker this gate was built for was indented:
 * the conflict opened inside a Markdown list item, so two spaces preceded it and
 * only the closing marker sat at column zero.
 */
const CONFLICT_START = /^\s*<{7}(?:\s|$)/
/** The closing marker, same shape. */
const CONFLICT_END = /^\s*>{7}(?:\s|$)/

/** The suppression predicate reads comments, so it only applies to code. */
const SOURCE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

/**
 * `repos/` is the vendored third-party subtree (REPO-S3). Lockfiles are
 * generated, can legitimately hold long runs of punctuation, and are never
 * hand-resolved.
 */
const isExcluded = (path: string): boolean =>
  path.startsWith('repos/') || path.endsWith('.lock') || path.endsWith('pnpm-lock.yaml')

/**
 * This file names every protected id in its own prose and carries literal
 * conflict markers in its fixtures, so scanning itself would report both. A file
 * that is *about* the forbidden shapes cannot be judged by a scan for them.
 */
const SELF_PATH = 'scripts/guards/check-forbidden-lines.ts'

interface Finding {
  readonly file: string
  readonly line: number
  readonly kind: 'suppression' | 'conflict'
  readonly detail: string
  readonly text: string
}

/**
 * A comment suppressing a protected rule, if this line is one.
 *
 * Two forms this predicate shipped blind to, both measured, both honoured by oxlint:
 *
 * A directive inside a block comment the formatter has wrapped sits on a continuation
 * line carrying neither `//` nor an opening delimiter, only a leading `*`.
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
  if (isBlanket(line)) return PROTECTED_RULE_IDS[0] ?? null
  return PROTECTED_RULE_IDS.find((ruleId) => line.includes(ruleId)) ?? null
}

/** True when this line is an opening or closing conflict marker. */
export const isConflictMarker = (line: string): boolean => CONFLICT_START.test(line) || CONFLICT_END.test(line)

/**
 * Every forbidden line in one file's contents, both predicates applied at their
 * own scope. Exported so the selftest drives the same function the scan drives; a
 * gate whose selftest exercises a second copy of the logic proves nothing about
 * the copy that runs.
 */
export const findingsIn = (file: string, contents: string): readonly Finding[] => {
  const findings: Finding[] = []
  const checkSuppression = SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))
  for (const [index, line] of contents.split('\n').entries()) {
    if (isConflictMarker(line)) {
      findings.push({
        file,
        line: index + 1,
        kind: 'conflict',
        detail: 'unresolved conflict marker',
        text: line.trimEnd(),
      })
    }
    if (!checkSuppression) continue
    const ruleId = suppressionOn(line)
    if (ruleId !== null) {
      findings.push({
        file,
        line: index + 1,
        kind: 'suppression',
        detail: `suppression of ${ruleId}`,
        text: line.trim(),
      })
    }
  }
  return findings
}

const trackedFiles = async (): Promise<readonly string[]> => {
  const git = new Deno.Command('git', { args: ['ls-files', '-z'], stdout: 'piped', stderr: 'piped' })
  const { code, stdout, stderr } = await git.output()
  if (code !== 0) throw new Error(`git ls-files failed: ${new TextDecoder().decode(stderr)}`)
  return new TextDecoder()
    .decode(stdout)
    .split('\0')
    .filter((path) => path !== '')
    .filter((path) => !isExcluded(path))
    .filter((path) => path !== SELF_PATH)
}

interface Scan {
  readonly findings: readonly Finding[]
  /** How many files were actually read. Zero means the gate examined nothing. */
  readonly examined: number
}

const scan = async (): Promise<Scan> => {
  const files = await trackedFiles()
  const findings: Finding[] = []
  let examined = 0
  for (const file of files) {
    const contents = await Deno.readTextFile(file).catch(() => null)
    if (contents === null) continue
    examined++
    findings.push(...findingsIn(file, contents))
  }
  return { findings, examined }
}

/**
 * The gate's own negative control. A gate that reports nothing is
 * indistinguishable from a gate that cannot report, so the selftest runs the same
 * functions the scan runs over content that must be caught and content that must
 * not, and fails on either surprise.
 */
const selftest = (): number => {
  const open = '<'.repeat(7)
  const close = '>'.repeat(7)
  const middle = '='.repeat(7)

  const mustCatchSuppression: readonly string[] = [
    '// oxlint-disable-next-line make-command-schema',
    '  // eslint-disable-next-line make-command-schema -- shipping this',
    '/* oxlint-disable make-command-schema */',
    '// oxlint-disable-line @systemfsoftware/oxlint-plugin-effect-workflow/make-command-schema',
    '// eslint-disable @systemfsoftware/oxlint-plugin-effect-workflow/make-command-schema',
    // The wrapped block comment. This predicate shipped exiting 0 on a file carrying it.
    ' * oxlint-disable make-command-schema',
    '   * eslint-disable-next-line make-command-schema -- wrapped by the formatter',
    // The blanket directive. It names no rule and so disables every one, including
    // this one; the predicate shipped exiting 0 on it too.
    '// oxlint-disable',
    '/* eslint-disable */',
    '// oxlint-disable -- the whole file is generated',
  ]
  const mustIgnoreSuppression: readonly string[] = [
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

  const mustCatchConflict: readonly (readonly [string, string])[] = [
    ['labelled opening marker', `${open} Updated upstream\n- rule two`],
    ['labelled closing marker', `${close} Stashed changes\n`],
    ['bare opening marker', `${open}\nours\n`],
    ['full conflict', `${open} HEAD\nours\n${middle}\ntheirs\n${close} feature\n`],
    // The shape this gate exists for: AGENTS.md carried the opening marker
    // indented inside a list item, so a column-zero-only pattern saw nothing.
    ['indented opening marker', `- rule one\n  ${open} Updated upstream\n- rule two`],
    ['indented closing marker', `- rule two\n\n  ${close} Stashed changes\n`],
    // The two false negatives a fence tracker produced, kept as fixtures so no
    // future reader reintroduces one. Both returned zero findings when the
    // predicate skipped fenced regions.
    ['marker inside a backtick fence', `text\n\`\`\`\n${open} HEAD\n${middle}\n${close} other\n\`\`\`\ntext`],
    ['marker inside a tilde fence', `text\n~~~\n${close} Stashed changes\n~~~\n`],
  ]
  const mustIgnoreConflict: readonly (readonly [string, string])[] = [
    ['setext heading underline', `Release and Commits\n${middle}\n`],
    ['markdown thematic break', '---\n***\n___\n'],
    ['shorter run of angle brackets', `${'<'.repeat(6)} not a marker\n${'>'.repeat(6)} nor this\n`],
    ['heredoc-ish redirection', 'cat <<EOF\nbody\nEOF\n'],
    ['nested markdown blockquote', '> > > > > > > quoted seven deep\n'],
  ]

  const failures: string[] = []

  for (const line of mustCatchSuppression) {
    if (suppressionOn(line) === null) failures.push(`MISSED suppression: ${line}`)
  }
  for (const line of mustIgnoreSuppression) {
    if (suppressionOn(line) !== null) failures.push(`OVERREACHED suppression: ${line}`)
  }
  // Applied through findingsIn at a source path, so the scope routing is covered
  // too: a suppression in a non-source file must not be reported.
  for (const [name, contents] of mustCatchConflict) {
    if (findingsIn('fixture.md', contents).length === 0) failures.push(`MISSED conflict: ${name}`)
  }
  for (const [name, contents] of mustIgnoreConflict) {
    if (findingsIn('fixture.md', contents).length > 0) failures.push(`OVERREACHED conflict: ${name}`)
  }
  const suppressionLine = '// oxlint-disable make-command-schema'
  if (findingsIn('fixture.ts', suppressionLine).length !== 1) {
    failures.push('scope: a suppression in a source file must be reported')
  }
  if (findingsIn('fixture.md', suppressionLine).length !== 0) {
    failures.push('scope: a suppression in a non-source file must not be reported')
  }

  for (const failure of failures) console.error(`selftest: ${failure}`)
  if (failures.length > 0) {
    console.error(`selftest FAILED: ${failures.length} case(s)`)
    return 1
  }
  const total = mustCatchSuppression.length + mustIgnoreSuppression.length +
    mustCatchConflict.length + mustIgnoreConflict.length + 2
  console.log(`selftest ok: ${total} cases`)
  return 0
}

if (import.meta.main) {
  if (Deno.args.includes('--selftest')) Deno.exit(selftest())

  const { findings, examined } = await scan()

  // A gate that discovers an empty population must not report success: "0
  // findings" over 0 files is a green run bought by looking at nothing, which is
  // indistinguishable from a working gate. Fail loudly instead.
  if (examined === 0) {
    console.error('::error::examined 0 tracked files — the gate scanned nothing, so its silence proves nothing')
    Deno.exit(1)
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.detail} — ${finding.text}`)
    }
    const conflicts = findings.filter((finding) => finding.kind === 'conflict').length
    if (conflicts > 0) {
      console.error(
        `\n${conflicts} unresolved conflict marker(s) in tracked files. Resolve the conflict: keep the text that should govern, delete the other side and every marker. A committed marker means two rules are live and neither is.`,
      )
    }
    const suppressions = findings.length - conflicts
    if (suppressions > 0) {
      console.error(
        `\n${suppressions} suppression(s) of a protected rule. This rule is the only layer that closes its hole, so its suppression is the violation: remove the comment and fix the command position it was hiding.`,
      )
    }
    Deno.exit(1)
  }
  console.log(`no forbidden lines in ${examined} tracked files`)
}
