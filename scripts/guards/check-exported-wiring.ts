#!/usr/bin/env -S deno run --allow-run=git --allow-read
/**
 * REPO-A3 — dependency rejection is internal wiring, so wiring is never exported.
 *
 * A `*Deps` tag records which members one operation happened to reach for. Exporting
 * it turns internal composition into a surface commitment: the tag rides the `R`
 * channel of an exported signature, so a consumer meets it at their own call site
 * and must provide an aggregator where a capability port would have served.
 *
 * The key is a generated artifact, never an author-supplied token. An api-extractor
 * report is written from the compiled types and `api:check` fails when it drifts, so
 * this gate cannot be cleared by editing prose — only by not exporting the symbol.
 *
 * Two populations, because one alone passes vacuously:
 *   - api reports: catch a tag that reached a published signature. Absent for a
 *     package that runs no api-extractor, which is why the second population exists.
 *   - source declarations outside `src/internal/`: that boundary is enforced by the
 *     `exports` map rather than asserted by a name.
 */
type Finding = {
  readonly file: string
  readonly line: number
  readonly symbol: string
  readonly kind: 'report' | 'declaration'
}

type Evidence = {
  readonly reports: readonly { readonly file: string; readonly text: string }[]
  readonly sources: readonly { readonly file: string; readonly text: string }[]
}

const WIRING = /\b([A-Z][A-Za-z0-9_]*Deps)\b/g
const DECLARED =
  /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|const|type|interface|function)\s+([A-Za-z0-9_]*Deps)\b/

/** Pure: the whole decision, so it is testable without touching a filesystem. */
export const verdict = (evidence: Evidence): readonly Finding[] => {
  const found: Finding[] = []
  for (const { file, text } of evidence.reports) {
    text.split('\n').forEach((line, i) => {
      if (!line.startsWith('export ')) return
      for (const m of line.matchAll(WIRING)) found.push({ file, line: i + 1, symbol: m[1]!, kind: 'report' })
    })
  }
  for (const { file, text } of evidence.sources) {
    text.split('\n').forEach((line, i) => {
      const m = DECLARED.exec(line)
      if (m) found.push({ file, line: i + 1, symbol: m[1]!, kind: 'declaration' })
    })
  }
  // One symbol reported once per file, whichever population saw it first.
  const seen = new Set<string>()
  return found.filter((f) => {
    const key = `${f.file}\u0000${f.symbol}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const tracked = async (): Promise<readonly string[]> => {
  const out = await new Deno.Command('git', { args: ['ls-files'], stdout: 'piped' }).output()
  if (out.code !== 0) throw new Error('git ls-files failed')
  return new TextDecoder().decode(out.stdout).split('\n').filter(Boolean)
}

const gather = async (): Promise<Evidence> => {
  const files = await tracked()
  const vendored = (f: string) => f.startsWith('repos/') || f.startsWith('.worktrees/')
  const read = async (f: string) => ({ file: f, text: await Deno.readTextFile(f) })

  const reportPaths = files.filter((f) => !vendored(f) && /\/etc\/[^/]+\.api\.md$/.test(f))
  const sourcePaths = files.filter((f) =>
    f.endsWith('.ts') && !vendored(f) && f.includes('/src/') &&
    !f.includes('/src/internal/') && !f.includes('__tests__') && !/\.test\.ts$/.test(f)
  )
  return {
    reports: await Promise.all(reportPaths.map(read)),
    sources: await Promise.all(sourcePaths.map(read)),
  }
}

const selftest = (): number => {
  const good: Evidence = {
    reports: [{ file: 'a.api.md', text: 'export class Terminal extends Terminal_base {}\n' }],
    sources: [{ file: 'p/src/x.ts', text: 'export class LeaderLock extends Context.Tag()<LeaderLock, S>() {}\n' }],
  }
  const bad: Evidence = {
    reports: [{
      file: 'b.api.md',
      text: 'export const run: () => Effect.Effect<void, never, R | FooExecutorDeps>;\n',
    }],
    sources: [{
      file: 'p/src/y.ts',
      text: 'export class BarExecutorDeps extends Context.Tag()<BarExecutorDeps, S>() {}\n',
    }],
  }
  const okCount = verdict(good).length
  const badFindings = verdict(bad)
  const failures: string[] = []
  if (okCount !== 0) failures.push(`known-good produced ${okCount} finding(s), expected 0`)
  if (badFindings.length !== 2) failures.push(`known-bad produced ${badFindings.length} finding(s), expected 2`)
  if (!badFindings.some((f) => f.kind === 'report')) failures.push('known-bad missed the report population')
  if (!badFindings.some((f) => f.kind === 'declaration')) failures.push('known-bad missed the declaration population')
  for (const f of failures) console.error(`check-exported-wiring: selftest ${f}`)
  if (failures.length === 0) console.log('check-exported-wiring: selftest ok (2 fixtures)')
  return failures.length === 0 ? 0 : 1
}

const main = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--selftest')) return selftest()
  const evidence = await gather()
  const findings = verdict(evidence)
  for (const f of findings) {
    const what = f.kind === 'report' ? 'reached the published surface' : 'is exported outside src/internal/'
    console.error(`${f.file}:${f.line}: ${f.symbol} ${what} — REPO-A3: unify it into the capability port it projects`)
  }
  console.log(
    `check-exported-wiring: ${evidence.reports.length} api report(s), ${evidence.sources.length} public source file(s), ${findings.length} finding(s)`,
  )
  return findings.length === 0 ? 0 : 1
}

if (import.meta.main) Deno.exit(await main(Deno.args))
