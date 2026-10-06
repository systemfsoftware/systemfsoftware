import { Option, Schema } from 'effect'
import * as Result from 'effect/Result'

import { assignCaseKeys, CaseIdentity, CaseKeyCommand, CaseKeysAssigned } from './assign-case-keys.workflow.js'
import { type CaseMode, Disposition, HeldCase, type ParityRow } from './disposition.schema.js'
import {
  LaneHolds,
  LaneRefused,
  type LaneVerdict,
  laneVerdict,
  ObservedCase,
  type ObservedOutcome,
  ReplacementFile,
  VerdictCommand,
} from './lane-verdict.workflow.js'
import { PARITY, RETIRED } from './parity.js'
import { Report, type ReportAssertion, type ReportTestFile } from './report.schema.js'

/** The suite materialized from the flake output: the lane's only source of upstream test files (KTD5.1). */
const SUITE_MARKER = '/.suite/packages/'
/** The re-homed fork tests a retired case names, which live under each package's `tests/`. */
const REPLACEMENT_MARKER = '/packages/xstate/'

const PARITY_HEADER = 'package                 files  passed  skipped  todo\n'

/** What the reporter reads: the vitest JSON report, the committed disposition, and the run's mode. */
export type LaneReportInput = {
  readonly reportText: string
  readonly dispositionText: string | undefined
  readonly dispositionPath: string
  readonly write: boolean
}

/** What the reporter hands back: the lines it prints, its exit code, and the disposition to write (KTD5.6). */
export type LaneReportOutput = {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly dispositionText: string | undefined
}

type LaneFile = { readonly dir: string; readonly file: string }
type Parity = { readonly text: string; readonly failed: number }
type ParityCounts = {
  readonly files: number
  readonly passed: number
  readonly skipped: number
  readonly todo: number
}

const decodeReport = Schema.decodeUnknownResult(Schema.fromJsonString(Report))
const decodeDisposition = Schema.decodeUnknownResult(Schema.fromJsonString(Disposition))

const OUTCOME: Readonly<Record<string, ObservedOutcome>> = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  pending: 'skipped',
  disabled: 'skipped',
  todo: 'todo',
}

const HELD_MODE: Readonly<Record<string, CaseMode>> = { passed: 'passed', skipped: 'skipped', todo: 'todo' }

const outcomeOf = (status: string): ObservedOutcome => OUTCOME[status] ?? 'failed'

const heldModeOf = (outcome: ObservedOutcome): CaseMode => HELD_MODE[outcome] ?? 'passed'

/** Upstream dir -> the fork package name the parity table uses. */
const packageOf = (dir: string): string => (dir === 'core' ? 'xstate' : dir)

const laneFileOf = (path: string): LaneFile | undefined =>
  Option.match(Option.fromNullishOr(path.split(SUITE_MARKER)[1]), {
    onNone: () => undefined,
    onSome: (tail) => {
      const [dir, ...rest] = tail.split('/')
      return dir === undefined ? undefined : { dir: packageOf(dir), file: rest.join('/') }
    },
  })

const firstSegment = (path: string): string => path.split('/')[0] ?? ''

const isTestsPath = (relative: string): boolean => relative.includes(`/${firstSegment(relative)}/tests/`)

const replacementFileOf = (path: string): LaneFile | undefined =>
  Option.match(Option.fromNullishOr(path.split(REPLACEMENT_MARKER)[1]), {
    onNone: () => undefined,
    onSome: (relative) =>
      isTestsPath(relative)
        ? { dir: packageOf(firstSegment(relative)), file: `packages/xstate/${relative}` }
        : undefined,
  })

const assertionsOf = (result: ReportTestFile): ReadonlyArray<ReportAssertion> => result.assertionResults ?? []

const messagesOf = (assertion: ReportAssertion): ReadonlyArray<string> => assertion.failureMessages ?? []

const keyOf = (keys: readonly string[], index: number, fallback: string): string => keys[index] ?? fallback

const identitiesOf = (file: string, assertions: readonly ReportAssertion[]): ReadonlyArray<CaseIdentity> =>
  assertions.map((assertion) =>
    CaseIdentity.make({ file, ancestors: [...(assertion.ancestorTitles ?? [])], title: assertion.title })
  )

const keysOf = (file: string, assertions: readonly ReportAssertion[]): readonly string[] =>
  Result.match(assignCaseKeys(CaseKeyCommand.make({ cases: identitiesOf(file, assertions) })), {
    onFailure: () => [],
    onSuccess: (verdict) => (Schema.is(CaseKeysAssigned)(verdict) ? verdict.keys : []),
  })

const observedIn = (result: ReportTestFile): ReadonlyArray<ObservedCase> =>
  Option.match(Option.fromNullishOr(laneFileOf(result.name)), {
    onNone: () => [],
    onSome: (lane) => {
      const assertions = assertionsOf(result)
      const keys = keysOf(lane.file, assertions)
      return assertions.map((assertion, index) =>
        ObservedCase.make({
          key: keyOf(keys, index, `${lane.file} :: ${assertion.title}`),
          file: lane.file,
          package: lane.dir,
          outcome: outcomeOf(assertion.status),
          message: messagesOf(assertion).join('\n'),
        })
      )
    },
  })

const countIn = (assertions: readonly ReportAssertion[], status: string): number =>
  assertions.filter((assertion) => assertion.status === status).length

const replacementsIn = (result: ReportTestFile): ReadonlyArray<ReplacementFile> =>
  Option.match(Option.fromNullishOr(replacementFileOf(result.name)), {
    onNone: () => [],
    onSome: (file) => {
      const assertions = assertionsOf(result)
      return [ReplacementFile.make({
        file: file.file,
        package: file.dir,
        passed: countIn(assertions, 'passed'),
        failed: countIn(assertions, 'failed'),
      })]
    },
  })

const observe = (report: Report): {
  readonly observed: ReadonlyArray<ObservedCase>
  readonly replacements: ReadonlyArray<ReplacementFile>
} => {
  const files = report.testResults ?? []
  return {
    observed: files.flatMap((file) => observedIn(file)),
    replacements: files.flatMap((file) => replacementsIn(file)),
  }
}

const observedInPackage = (observed: readonly ObservedCase[], packageName: string): ReadonlyArray<ObservedCase> =>
  observed.filter((entry) => entry.package === packageName)

const filesIn = (observed: readonly ObservedCase[], packageName: string): number =>
  new Set(observedInPackage(observed, packageName).map((entry) => entry.file)).size

const passedIn = (observed: readonly ObservedCase[], packageName: string): number =>
  observedInPackage(observed, packageName).filter((entry) => entry.outcome === 'passed').length

const skippedIn = (observed: readonly ObservedCase[], packageName: string): number =>
  observedInPackage(observed, packageName).filter((entry) => entry.outcome === 'skipped').length

const todoIn = (observed: readonly ObservedCase[], packageName: string): number =>
  observedInPackage(observed, packageName).filter((entry) => entry.outcome === 'todo').length

const replacementFiles = (
  replacements: readonly ReplacementFile[],
  packageName: string,
): ReadonlyArray<ReplacementFile> => replacements.filter((entry) => entry.package === packageName)

const replacementPassed = (replacements: readonly ReplacementFile[], packageName: string): number =>
  replacementFiles(replacements, packageName).reduce((total, entry) => total + entry.passed, 0)

const countsOf = (
  observed: readonly ObservedCase[],
  replacements: readonly ReplacementFile[],
  row: ParityRow,
): ParityCounts => ({
  files: filesIn(observed, row.package) + replacementFiles(replacements, row.package).length,
  passed: passedIn(observed, row.package) + replacementPassed(replacements, row.package),
  skipped: skippedIn(observed, row.package),
  todo: todoIn(observed, row.package),
})

const countsEqual = (row: ParityRow, counts: ParityCounts): boolean =>
  [counts.files === row.files, counts.passed === row.passed, counts.skipped === row.skipped, counts.todo === row.todo]
    .every(Boolean)

const parityLine = (row: ParityRow, counts: ParityCounts): string => {
  const mismatch = countsEqual(row, counts) ? '' : '  <-- parity mismatch'
  return `${row.package.padEnd(22)} ${String(counts.files).padStart(5)} ${String(counts.passed).padStart(7)} ${
    String(counts.skipped).padStart(8)
  } ${String(counts.todo).padStart(5)}${mismatch}\n`
}

const parityOf = (observed: readonly ObservedCase[], replacements: readonly ReplacementFile[]): Parity => {
  const lines = PARITY.map((row) => {
    const counts = countsOf(observed, replacements, row)
    return { ok: countsEqual(row, counts), line: parityLine(row, counts) }
  })
  return {
    text: `${PARITY_HEADER}${lines.map((entry) => entry.line).join('')}`,
    failed: lines.filter((entry) => !entry.ok).length,
  }
}

const heldFromObserved = (observed: readonly ObservedCase[]): ReadonlyArray<HeldCase> =>
  observed
    .filter((entry) => entry.outcome !== 'failed')
    .map((entry) => HeldCase.make({ key: entry.key, mode: heldModeOf(entry.outcome) }))

const heldFromText = (dispositionText: string | undefined): ReadonlyArray<HeldCase> =>
  Option.match(Option.fromNullishOr(dispositionText), {
    onNone: () => [],
    onSome: (text) =>
      Result.match(decodeDisposition(text), {
        onFailure: () => [],
        onSuccess: (disposition) => [...disposition.held],
      }),
  })

const heldOf = (input: LaneReportInput, observed: readonly ObservedCase[]): ReadonlyArray<HeldCase> =>
  input.write ? heldFromObserved(observed) : heldFromText(input.dispositionText)

const dispositionTextOf = (held: readonly HeldCase[]): string =>
  `${JSON.stringify({ version: 1, held, retired: RETIRED, parity: PARITY }, null, 2)}\n`

const dispositionOf = (input: LaneReportInput, held: readonly HeldCase[]): string | undefined =>
  input.write ? dispositionTextOf(held) : undefined

const wroteLine = (input: LaneReportInput, held: readonly HeldCase[]): string =>
  input.write ? `wrote ${input.dispositionPath} (${held.length} held cases, ${RETIRED.length} retired)\n` : ''

const categoryLine = (holds: LaneHolds): string => {
  const categories = holds.categories.filter((entry) => entry.count > 0)
  return categories.length === 0
    ? ''
    : `held failures by category: ${categories.map((entry) => `${entry.category}=${entry.count}`).join(', ')}\n`
}

const holdsText = (holds: LaneHolds): string =>
  `lane holds: ${holds.passed} passed, ${holds.skipped} skipped, ${holds.todo} todo, ${holds.retired} retired\n${
    categoryLine(holds)
  }`

const refusedText = (refused: LaneRefused): string =>
  [
    `lane refused: ${refused.violations.length} violation(s)`,
    ...refused.violations.map((violation) => `  ${JSON.stringify(violation)}`),
  ].join('\n') + '\n'

const refusedOutput = (
  input: LaneReportInput,
  held: readonly HeldCase[],
  parity: Parity,
  refused: LaneRefused,
): LaneReportOutput => ({
  stdout: wroteLine(input, held) + parity.text,
  stderr: refusedText(refused),
  exitCode: 1,
  dispositionText: undefined,
})

const holdsOutput = (
  input: LaneReportInput,
  held: readonly HeldCase[],
  parity: Parity,
  holds: LaneHolds,
): LaneReportOutput => ({
  stdout: wroteLine(input, held) + parity.text + holdsText(holds),
  stderr: '',
  exitCode: parity.failed === 0 ? 0 : 1,
  dispositionText: dispositionOf(input, held),
})

const laneOutput = (
  input: LaneReportInput,
  held: readonly HeldCase[],
  parity: Parity,
  decision: LaneVerdict,
): LaneReportOutput =>
  Schema.is(LaneRefused)(decision)
    ? refusedOutput(input, held, parity, decision)
    : holdsOutput(input, held, parity, decision)

const laneReportOf = (input: LaneReportInput, report: Report): LaneReportOutput => {
  const { observed, replacements } = observe(report)
  const held = heldOf(input, observed)
  const parity = parityOf(observed, replacements)
  const decision = Result.getOrThrow(
    laneVerdict(VerdictCommand.make({
      held: [...held],
      observed: [...observed],
      retired: [...RETIRED],
      replacements: [...replacements],
      typeErrors: [],
    })),
  )
  return laneOutput(input, held, parity, decision)
}

/** Judges a vitest JSON report against the disposition and prints the parity table (KTD5.6). */
export const laneReport = (input: LaneReportInput): LaneReportOutput =>
  Result.match(decodeReport(input.reportText), {
    onFailure: () => ({
      stdout: '',
      stderr: 'the vitest JSON report did not decode against report.schema.ts\n',
      exitCode: 1,
      dispositionText: undefined,
    }),
    onSuccess: (report) => laneReportOf(input, report),
  })
