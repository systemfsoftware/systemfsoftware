#!/usr/bin/env -S deno run --allow-read --allow-run=git
// Run it as:  deno run --allow-read --allow-run=git scripts/guards/check-conflict-markers.ts
// Selftest:   deno run --allow-read --allow-run=git scripts/guards/check-conflict-markers.ts --selftest
//
// `.github/workflows/conflict-check.yml` asks `git merge-tree` whether this branch
// would conflict with its base. That question is about a merge that has not
// happened, so it is blind to markers already committed on both sides — and on
// 2026-08-23 `AGENTS.md` reached `main` carrying `<` x7 `Updated upstream`
// around REPO-R2, with a duplicated REPO-R3 and a superseded REPO-R2 inside it.
// Every gate in the chain exited 0, because no gate read the bytes.
//
// So this gate reads the tracked bytes. It keys on nothing an author supplied:
// no metadata field, no opt-out marker, no allowlist to grow.
//
// Scope note: it reports the opening and closing markers only, never the bare
// `=` x7 middle one. A line of exactly seven `=` is a Markdown setext heading
// underline, and this tree is documentation-heavy; a conflict always writes all
// three markers, so dropping the ambiguous one costs no detection.

/**
 * git writes a label after the opening marker, but tolerate a bare one. Leading
 * whitespace is allowed because the marker this gate was built for was indented:
 * the conflict opened inside a Markdown list item, so `AGENTS.md:89` carried two
 * spaces before it and only the closing marker sat at column zero.
 */
const CONFLICT_START = /^\s*<{7}(?:\s|$)/
/** The closing marker, same shape. */
const CONFLICT_END = /^\s*>{7}(?:\s|$)/

/** A doc may quote a conflict inside a fence; the fence is not the defect. */
const FENCE = /^\s{0,3}(?:`{3,}|~{3,})/

/**
 * Lockfiles are generated, can legitimately hold long runs of punctuation, and
 * are never hand-resolved. `repos/` is the vendored third-party subtree (REPO-S3).
 */
const isExcluded = (path: string): boolean =>
  path.startsWith('repos/') ||
  path.endsWith('.lock') ||
  path.endsWith('pnpm-lock.yaml')

interface Finding {
  readonly file: string
  readonly line: number
  readonly text: string
}

/**
 * Every conflict marker in one file's contents, ignoring fenced regions.
 *
 * Exported so the selftest drives the same predicate the scan drives; a gate
 * whose selftest exercises a second copy of the logic proves nothing about the
 * copy that runs.
 */
export const markersIn = (file: string, contents: string): readonly Finding[] => {
  const findings: Finding[] = []
  let fenced = false
  for (const [index, line] of contents.split('\n').entries()) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (CONFLICT_START.test(line) || CONFLICT_END.test(line)) {
      findings.push({ file, line: index + 1, text: line.trimEnd() })
    }
  }
  return findings
}

const trackedFiles = async (): Promise<readonly string[]> => {
  const git = new Deno.Command('git', { args: ['ls-files', '-z'], stdout: 'piped', stderr: 'piped' })
  const { code, stdout, stderr } = await git.output()
  if (code !== 0) {
    throw new Error(`git ls-files failed: ${new TextDecoder().decode(stderr)}`)
  }
  return new TextDecoder()
    .decode(stdout)
    .split('\0')
    .filter((path) => path !== '')
    .filter((path) => !isExcluded(path))
}

const scan = async (): Promise<readonly Finding[]> => {
  const files = await trackedFiles()
  const findings: Finding[] = []
  for (const file of files) {
    // A binary blob fails to decode as UTF-8; it cannot carry a resolved
    // conflict a human was meant to see, so skipping it loses no detection.
    const contents = await Deno.readTextFile(file).catch(() => null)
    if (contents === null) continue
    findings.push(...markersIn(file, contents))
  }
  return findings
}

/**
 * The gate's own negative control. A gate that reports nothing is
 * indistinguishable from a gate that cannot report, so the selftest runs the
 * real predicate over content that must be caught and content that must not,
 * and fails on either surprise.
 */
const selftest = (): number => {
  const open = '<'.repeat(7)
  const close = '>'.repeat(7)
  const middle = '='.repeat(7)

  const mustCatch: readonly (readonly [string, string])[] = [
    ['labelled opening marker', `- rule one\n${open} Updated upstream\n- rule two`],
    ['labelled closing marker', `- rule two\n\n${close} Stashed changes\n`],
    ['bare opening marker', `${open}\nours\n`],
    ['full conflict', `${open} HEAD\nours\n${middle}\ntheirs\n${close} feature\n`],
    ['reopened after a closed fence', `\`\`\`\n${open} quoted\n\`\`\`\n${open} real\n`],
    // The shape this gate exists for: AGENTS.md carried the opening marker
    // indented inside a list item, so a column-zero-only pattern saw nothing.
    ['indented opening marker', `- rule one\n  ${open} Updated upstream\n- rule two`],
    ['indented closing marker', `- rule two\n\n  ${close} Stashed changes\n`],
  ]
  const mustIgnore: readonly (readonly [string, string])[] = [
    ['marker quoted mid-line', `Delete the \`${open} Updated upstream\` marker.`],
    ['setext heading underline', `Release and Commits\n${middle}\n`],
    ['markdown thematic break', '---\n***\n___\n'],
    ['marker inside a fence', `text\n\`\`\`\n${open} HEAD\n${middle}\n${close} other\n\`\`\`\ntext`],
    ['marker inside a tilde fence', `text\n~~~\n${close} Stashed changes\n~~~\n`],
    ['shorter run of angle brackets', `${'<'.repeat(6)} not a marker\n${'>'.repeat(6)} nor this\n`],
    ['heredoc-ish redirection', 'cat <<EOF\nbody\nEOF\n'],
  ]

  const missed = mustCatch.filter(([, contents]) => markersIn('fixture', contents).length === 0)
  const overreached = mustIgnore.filter(([, contents]) => markersIn('fixture', contents).length > 0)

  for (const [name] of missed) console.error(`selftest: MISSED  ${name}`)
  for (const [name] of overreached) console.error(`selftest: OVERREACHED  ${name}`)

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
      console.error(
        `::error file=${finding.file},line=${finding.line}::unresolved conflict marker — ${finding.text}`,
      )
    }
    console.error(
      `\n${findings.length} conflict marker(s) in tracked files. Resolve the conflict: keep the text that should govern, delete the other side and every marker. A committed marker means two rules are live and neither is.`,
    )
    Deno.exit(1)
  }
  console.log('no conflict markers in tracked files')
}
