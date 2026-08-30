#!/usr/bin/env -S deno run --allow-read --allow-run=git

const PROTECTED_RULE_IDS: readonly string[] = ['make-command-schema', 'tests-import-public-api']
const DISABLE_DIRECTIVE = /(?:oxlint|eslint)-disable(?:-next-line|-line)?/
const DIRECTIVE_WITH_TAIL = /(?:oxlint|eslint)-disable(?:-next-line|-line)?([^\n]*)/

const isBlanket = (line: string): boolean => {
  const tail = DIRECTIVE_WITH_TAIL.exec(line)?.[1] ?? ''
  const named = tail.split('--')[0] ?? ''
  return named.replace(/[*/\s]/g, '') === ''
}

const CONFLICT_START = /^\s*<{7}(?:\s|$)/
const CONFLICT_END = /^\s*>{7}(?:\s|$)/
const SOURCE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

const isExcluded = (path: string): boolean =>
  path.startsWith('repos/') || path.endsWith('.lock') || path.endsWith('pnpm-lock.yaml')

const SELF_PATH = 'scripts/guards/check-forbidden-lines.ts'

interface Finding {
  readonly file: string
  readonly line: number
  readonly kind: 'suppression' | 'conflict'
  readonly detail: string
  readonly text: string
}

export const suppressionOn = (line: string): string | null => {
  if (!DISABLE_DIRECTIVE.test(line)) return null
  const comment = line.includes('//') || line.includes('/*') || line.trimStart().startsWith('*')
  if (!comment) return null
  const named = PROTECTED_RULE_IDS.find((ruleId) => line.includes(ruleId))
  if (named !== undefined) return named
  return isBlanket(line) ? PROTECTED_RULE_IDS[0] ?? null : null
}

export const isConflictMarker = (line: string): boolean => CONFLICT_START.test(line) || CONFLICT_END.test(line)

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
  readonly examined: number
  readonly skipped: readonly string[]
}

const scan = async (): Promise<Scan> => {
  const files = await trackedFiles()
  const findings: Finding[] = []
  const skipped: string[] = []
  let examined = 0
  for (const file of files) {
    const contents = await Deno.readTextFile(file).catch(() => null)
    if (contents === null) {
      skipped.push(file)
      continue
    }
    examined++
    findings.push(...findingsIn(file, contents))
  }
  return { findings, examined, skipped }
}

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
    ' * oxlint-disable make-command-schema',
    '   * eslint-disable-next-line make-command-schema -- wrapped by the formatter',
    '// oxlint-disable',
    '/* eslint-disable */',
    '// oxlint-disable -- the whole file is generated',
    '// oxlint-disable-next-line tests-import-public-api',
    '// eslint-disable @systemfsoftware/oxlint-plugin-effect-dmmf/tests-import-public-api -- legacy lane',
  ]
  const mustIgnoreSuppression: readonly string[] = [
    '// oxlint-disable-next-line no-console',
    'const name = "make-command-schema"',
    'export const makeCommandSchema = defineRule({',
    "  [rule('make-command-schema')]: 'error',",
    '// a comment mentioning make-command-schema without a directive',
    'oxlint-disable-next-line make-command-schema',
    '// eslint-disable-next-line no-misused-spread, no-console',
    '/* oxlint-disable no-console */',
  ]

  const mustCatchConflict: readonly (readonly [string, string])[] = [
    ['labelled opening marker', `${open} Updated upstream\n- rule two`],
    ['labelled closing marker', `${close} Stashed changes\n`],
    ['bare opening marker', `${open}\nours\n`],
    ['full conflict', `${open} HEAD\nours\n${middle}\ntheirs\n${close} feature\n`],
    ['indented opening marker', `- rule one\n  ${open} Updated upstream\n- rule two`],
    ['indented closing marker', `- rule two\n\n  ${close} Stashed changes\n`],
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

  const { findings, examined, skipped } = await scan()

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
        `\n${conflicts} unresolved conflict marker(s) in tracked files. Resolve the conflict: keep the text that should govern, delete the other side and every marker. A committed marker means two rules are live and neither is.\nQuoting a marker on purpose? This gate does not read fences, so indent the line by one space — a marker at column zero is never real content.`,
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
  const unread = skipped.length === 0 ? '' : ` (${skipped.length} not decodable as text: ${skipped.join(', ')})`
  console.log(`no forbidden lines in ${examined} tracked files${unread}`)
}
