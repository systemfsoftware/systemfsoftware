#!/usr/bin/env -S deno run --allow-read

import { Option, Schema } from 'effect'

const StrykerStreamEvent = Schema.fromJsonString(
  Schema.Struct({ kind: Schema.Literal('mutant') }),
)

const MutationReport = Schema.Struct({
  schemaVersion: Schema.NonEmptyString,
  files: Schema.Record(Schema.String, Schema.Unknown),
})

const CompleteReport = Schema.fromJsonString(MutationReport)

export function countMutantLines(text: string): number {
  let n = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    if (Option.isSome(Schema.decodeUnknownOption(StrykerStreamEvent)(line))) n += 1
  }
  return n
}

export function isCompleteReport(text: string): boolean {
  return Option.isSome(Schema.decodeUnknownOption(CompleteReport)(text))
}

export interface SummaryInput {
  readonly package: string
  readonly outcome: string
  readonly reportsDir: string
  readonly readFile: (path: string) => Promise<string>
}

type ReportState = { reportText: string | null; streamText: string | null }

async function loadState(reportsDir: string, readFile: (path: string) => Promise<string>): Promise<ReportState> {
  const reportText = await readFile(`${reportsDir}/mutation-report.json`).catch(() => null)
  const streamText = await readFile(`${reportsDir}/mutation-stream.jsonl`).catch(() => null)
  return { reportText, streamText }
}

export async function buildSummary(input: SummaryInput): Promise<string> {
  const state = await loadState(input.reportsDir, input.readFile)
  const reportPath = `${input.reportsDir}/mutation-report.json`
  const streamPath = `${input.reportsDir}/mutation-stream.jsonl`
  const lines = [`#### Mutation · **${input.package}**`, '', `- **Stryker outcome**: **${input.outcome}**`]

  if (state.reportText !== null) {
    if (isCompleteReport(state.reportText)) {
      lines.push(`- **Report**: **${reportPath}** (complete)`)
    } else {
      lines.push(
        `- **Report**: **${reportPath}** present but not a valid Stryker report (missing schemaVersion or files) — the report job will fail on this part.`,
      )
    }
    return `${lines.join('\n')}\n`
  }

  if (input.outcome === 'cancelled' || input.outcome === 'skipped') {
    lines.push(`- **Result**: the mutation step did not run (**${input.outcome}**); no report produced.`)
    return `${lines.join('\n')}\n`
  }

  const mutants = state.streamText === null ? 0 : countMutantLines(state.streamText)
  if (mutants === 0) {
    lines.push(
      `- **Result**: no final report and zero completed mutants — infrastructure failure (missing binary, crashed run or timeout). Stream: **${streamPath}**`,
    )
  } else {
    lines.push(
      `- **Result**: no final report (run interrupted) — ${mutants} completed mutant(s) recorded, marked incomplete in the merged report. Stream: **${streamPath}**`,
    )
  }
  return `${lines.join('\n')}\n`
}

export function buildRequireError(input: SummaryInput, state: ReportState): string | null {
  if (state.reportText !== null) return null
  const mutants = state.streamText === null ? 0 : countMutantLines(state.streamText)
  if (mutants === 0) {
    return [
      `::error title=Mutation produced no report::${input.package}: stryker exited '${input.outcome}' with zero mutant results — infrastructure failure (missing binary, crashed run or timeout), not a score outcome. Stream artifact: ${input.reportsDir}/mutation-stream.jsonl`,
    ].join('')
  }
  return [
    `::error title=Mutation produced no report::${input.package}: stryker exited '${input.outcome}' after ${mutants} completed mutant(s) without a final report — infrastructure failure, not a score outcome. Partial stream: ${input.reportsDir}/mutation-stream.jsonl`,
  ].join('')
}

async function selftest(): Promise<boolean> {
  const failures: string[] = []
  const readFileFor = (files: Record<string, string>) => (path: string): Promise<string> => {
    if (!(path in files)) return Promise.reject(new Error('no such file'))
    return Promise.resolve(files[path])
  }

  const complete = await buildSummary({
    package: 'pkg/complete',
    outcome: 'success',
    reportsDir: '/r',
    readFile: readFileFor({ '/r/mutation-report.json': '{"schemaVersion":"1.0","files":{}}' }),
  })
  if (!complete.includes('(complete)')) failures.push('complete')

  const unparseable = await buildSummary({
    package: 'pkg/unparseable',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readFileFor({ '/r/mutation-report.json': '{ not json' }),
  })
  if (!unparseable.includes('present but not a valid Stryker report')) failures.push('unparseable')

  const partial = await buildSummary({
    package: 'pkg/partial',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readFileFor({
      '/r/mutation-stream.jsonl':
        '{"kind":"stream"}\n{"kind":"mutant","id":"m1","status":"Killed","file":"a","mutator":"B","replacement":"f","location":{}}\n{torn',
    }),
  })
  if (!partial.includes('1 completed mutant(s) recorded')) failures.push('partial')

  const zero = await buildSummary({
    package: 'pkg/zero',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readFileFor({ '/r/mutation-stream.jsonl': '{"kind":"stream"}\n' }),
  })
  if (!zero.includes('zero completed mutants')) failures.push('zero')

  const cancelled = await buildSummary({
    package: 'pkg/cancelled',
    outcome: 'cancelled',
    reportsDir: '/r',
    readFile: readFileFor({}),
  })
  if (!cancelled.includes('did not run (**cancelled**)')) failures.push('cancelled')

  if (countMutantLines('{"kind":"mutant"}\n{torn\n{"kind":"phase"}\n') !== 1) failures.push('counter')

  const requirePass = await buildRequireError(
    {
      package: 'pkg',
      outcome: 'failure',
      reportsDir: '/r',
      readFile: readFileFor({ '/r/mutation-report.json': '{"schemaVersion":"1.0","files":{}}' }),
    },
    await loadState('/r', readFileFor({ '/r/mutation-report.json': '{"schemaVersion":"1.0","files":{}}' })),
  )
  if (requirePass !== null) failures.push('require-pass')

  const requireFail = await buildRequireError(
    {
      package: 'pkg',
      outcome: 'failure',
      reportsDir: '/r',
      readFile: readFileFor({ '/r/mutation-stream.jsonl': '{"kind":"mutant"}\n' }),
    },
    await loadState('/r', readFileFor({ '/r/mutation-stream.jsonl': '{"kind":"mutant"}\n' })),
  )
  if (requireFail === null || !requireFail.includes('after 1 completed mutant(s)')) failures.push('require-fail')

  if (failures.length > 0) {
    await Deno.stderr.write(
      new TextEncoder().encode(`build-mutation-summary: selftest FAILED: ${failures.join(', ')}\n`),
    )
    return false
  }
  await Deno.stdout.write(new TextEncoder().encode('build-mutation-summary: selftest ok\n'))
  return true
}

async function main(): Promise<void> {
  const args = Deno.args
  if (args.includes('--selftest')) {
    Deno.exit((await selftest()) ? 0 : 1)
  }
  let packageName = ''
  let outcome = ''
  let reportsDir = ''
  let requireMode = false
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--package') packageName = args[i + 1] ?? ''
    else if (args[i] === '--outcome') outcome = args[i + 1] ?? ''
    else if (args[i] === '--reports-dir') reportsDir = args[i + 1] ?? ''
    else if (args[i] === '--require') requireMode = true
  }
  if (!packageName || !outcome || !reportsDir) {
    await Deno.stderr.write(
      new TextEncoder().encode(
        'build-mutation-summary: --package, --outcome and --reports-dir are required\n',
      ),
    )
    Deno.exit(1)
  }
  const readFile = (path: string) => Deno.readTextFile(path)
  const input: SummaryInput = { package: packageName, outcome, reportsDir, readFile }
  const state = await loadState(reportsDir, readFile)
  if (requireMode) {
    const error = buildRequireError(input, state)
    if (error !== null) {
      await Deno.stderr.write(new TextEncoder().encode(`${error}\n`))
      Deno.exit(1)
    }
    return
  }
  const summary = await buildSummary(input)
  await Deno.stdout.write(new TextEncoder().encode(summary))
}

if (import.meta.main) {
  await main()
}
