#!/usr/bin/env -S deno run --allow-read

import { Option, Schema } from 'effect'

// The stream file is the drained `RunEvent` wire format (Stryker frames one `_tag`-discriminated
// JSON object per line to stdout and to reports/mutation-stream.jsonl alike), not the `kind` shape
// merge-reports reads. Decode against `_tag` or the mutant count is always zero.
const StrykerStreamEvent = Schema.fromJsonString(
  Schema.Struct({ _tag: Schema.Literal('mutant') }),
)

const StrykerPhaseEvent = Schema.fromJsonString(
  Schema.Struct({ _tag: Schema.Literal('phase'), phase: Schema.String }),
)

const StrykerErrorEvent = Schema.fromJsonString(
  Schema.Struct({ _tag: Schema.Literal('error'), code: Schema.Number, error: Schema.String }),
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

export interface RecordedRefusal {
  readonly phase: string | null
  readonly code: number
  readonly message: string
}

/** Stryker records the error as `~<module>/<Class>Error: <message>` plus a stack; keep the message. */
export function recordedRefusalMessage(error: string): string {
  const firstLine = (error.split('\n')[0] ?? '').trim()
  const message = /^[^\s:]+Error:\s*(.*)$/.exec(firstLine)
  return message?.[1] ?? firstLine
}

/** The last error event the run recorded, with the phase it was in when it stopped. */
export function recordedRefusalOf(streamText: string): RecordedRefusal | null {
  let refusal: RecordedRefusal | null = null
  let phase: string | null = null
  for (const raw of streamText.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    const entered = Schema.decodeUnknownOption(StrykerPhaseEvent)(line)
    if (Option.isSome(entered)) {
      phase = entered.value.phase
      continue
    }
    const failed = Schema.decodeUnknownOption(StrykerErrorEvent)(line)
    if (Option.isSome(failed)) {
      refusal = { phase, code: failed.value.code, message: recordedRefusalMessage(failed.value.error) }
    }
  }
  return refusal
}

export function refusalSentence(refusal: RecordedRefusal): string {
  const phase = refusal.phase === null ? '' : ` in its ${refusal.phase} phase`
  return `Stryker refused the run${phase} (exit ${refusal.code}): ${refusal.message}`
}

export interface SummaryInput {
  readonly package: string
  readonly outcome: string
  readonly reportsDir: string
  readonly readFile: (path: string) => Promise<string>
}

export type ReportState = { reportText: string | null; streamText: string | null }

export async function loadState(reportsDir: string, readFile: (path: string) => Promise<string>): Promise<ReportState> {
  const reportText = await readFile(`${reportsDir}/mutation/mutation.json`).catch(() => null)
  const streamText = await readFile(`${reportsDir}/mutation-stream.jsonl`).catch(() => null)
  return { reportText, streamText }
}

export async function buildSummary(input: SummaryInput): Promise<string> {
  const state = await loadState(input.reportsDir, input.readFile)
  const reportPath = `${input.reportsDir}/mutation/mutation.json`
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
  const refusal = state.streamText === null ? null : recordedRefusalOf(state.streamText)
  if (refusal !== null) {
    const note = mutants === 0
      ? ''
      : ` — ${mutants} completed mutant(s) recorded, marked incomplete in the merged report.`
    lines.push(`- **Result**: ${refusalSentence(refusal)}${note} Stream: **${streamPath}**`)
    return `${lines.join('\n')}\n`
  }
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
  const refusal = state.streamText === null ? null : recordedRefusalOf(state.streamText)
  if (refusal !== null) {
    const note = mutants === 0 ? '' : ` — ${mutants} completed mutant(s) recorded without a final report.`
    return `::error title=Mutation produced no report::${input.package}: ${
      refusalSentence(refusal)
    }${note} Stream artifact: ${input.reportsDir}/mutation-stream.jsonl`
  }
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
    readFile: readFileFor({ '/r/mutation/mutation.json': '{"schemaVersion":"1.0","files":{}}' }),
  })
  if (!complete.includes('(complete)')) failures.push('complete')

  const unparseable = await buildSummary({
    package: 'pkg/unparseable',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readFileFor({ '/r/mutation/mutation.json': '{ not json' }),
  })
  if (!unparseable.includes('present but not a valid Stryker report')) failures.push('unparseable')

  const partial = await buildSummary({
    package: 'pkg/partial',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readFileFor({
      '/r/mutation-stream.jsonl':
        '{"_tag":"stream","schemaVersion":"1.1"}\n{"_tag":"mutant","id":"m1","status":"Killed","file":"a","completed":1}\n{torn',
    }),
  })
  if (!partial.includes('1 completed mutant(s) recorded')) failures.push('partial')

  const zero = await buildSummary({
    package: 'pkg/zero',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readFileFor({ '/r/mutation-stream.jsonl': '{"_tag":"stream","schemaVersion":"1.1"}\n' }),
  })
  if (!zero.includes('zero completed mutants') || !zero.includes('infrastructure failure')) failures.push('zero')

  const cancelled = await buildSummary({
    package: 'pkg/cancelled',
    outcome: 'cancelled',
    reportsDir: '/r',
    readFile: readFileFor({}),
  })
  if (!cancelled.includes('did not run (**cancelled**)')) failures.push('cancelled')

  if (countMutantLines('{"_tag":"mutant","id":"m1"}\n{torn\n{"_tag":"phase","phase":"instrument"}\n') !== 1) {
    failures.push('counter')
  }

  const requirePass = await buildRequireError(
    {
      package: 'pkg',
      outcome: 'failure',
      reportsDir: '/r',
      readFile: readFileFor({ '/r/mutation/mutation.json': '{"schemaVersion":"1.0","files":{}}' }),
    },
    await loadState('/r', readFileFor({ '/r/mutation/mutation.json': '{"schemaVersion":"1.0","files":{}}' })),
  )
  if (requirePass !== null) failures.push('require-pass')

  const requireFail = await buildRequireError(
    {
      package: 'pkg',
      outcome: 'failure',
      reportsDir: '/r',
      readFile: readFileFor({ '/r/mutation-stream.jsonl': '{"_tag":"mutant","id":"m1"}\n' }),
    },
    await loadState('/r', readFileFor({ '/r/mutation-stream.jsonl': '{"_tag":"mutant","id":"m1"}\n' })),
  )
  if (requireFail === null || !requireFail.includes('after 1 completed mutant(s)')) failures.push('require-fail')

  // AE8: the stream that CI job 108115664629 recorded — phase events, then the terminal error.
  const refusalStream = '{"_tag":"stream","schemaVersion":"1.1","runId":"r","mode":"machine","signal":"tty"}\n' +
    '{"_tag":"phase","phase":"prepare","elapsedMs":210}\n' +
    '{"_tag":"phase","phase":"instrument","elapsedMs":232}\n' +
    '{"_tag":"error","schemaVersion":"1.1","code":3,"error":"~stryker/mutation-run/StageError: Instrument failed: No files to instrument.\\n    at Object.transform (file:///main.mjs:45665:51)"}\n'
  const refusalSentence =
    'Stryker refused the run in its instrument phase (exit 3): Instrument failed: No files to instrument.'
  const readRefusal = readFileFor({ '/r/mutation-stream.jsonl': refusalStream })
  const refusal = await buildSummary({
    package: 'pkg/refused',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readRefusal,
  })
  if (!refusal.includes(refusalSentence)) failures.push('refused')
  if (refusal.includes('infrastructure failure')) failures.push('refused-infrastructure')

  const requireRefusal = await buildRequireError(
    { package: 'pkg', outcome: 'failure', reportsDir: '/r', readFile: readRefusal },
    await loadState('/r', readRefusal),
  )
  if (requireRefusal === null || !requireRefusal.includes(refusalSentence)) failures.push('require-refusal')
  if (requireRefusal !== null && requireRefusal.includes('infrastructure failure')) {
    failures.push('require-refusal-infrastructure')
  }

  const partialRefusalStream = '{"_tag":"phase","phase":"test","elapsedMs":1}\n' +
    '{"_tag":"mutant","id":"m1","status":"Survived","file":"a"}\n' +
    '{"_tag":"error","schemaVersion":"1.1","code":4,"error":"~stryker/mutation-run/StageError: Mutant run failed: checker stopped.\\n    at x"}\n'
  const partialRefusal = await buildSummary({
    package: 'pkg/partial-refusal',
    outcome: 'failure',
    reportsDir: '/r',
    readFile: readFileFor({ '/r/mutation-stream.jsonl': partialRefusalStream }),
  })
  if (
    !partialRefusal.includes('Stryker refused the run in its test phase (exit 4): Mutant run failed: checker stopped.')
  ) {
    failures.push('partial-refusal')
  }
  if (!partialRefusal.includes('1 completed mutant(s) recorded')) failures.push('partial-refusal-count')

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
