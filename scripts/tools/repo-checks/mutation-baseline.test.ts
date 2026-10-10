import { assertEquals } from '@std/assert'
import { baselineOf, judgeBaseline } from './mutation-baseline.ts'

const A = 'aaaaaaaaaaaaaaaa'
const B = 'bbbbbbbbbbbbbbbb'
const C = 'cccccccccccccccc'
const DIR = 'packages/demo'
const HEADER = '| id | file:line | mutator -> replacement | reason |\n| --- | --- | --- | --- |\n'

const json = (...ids: string[]): string => JSON.stringify({ schemaVersion: 1, survivors: ids })
const row = (id: string, reason: string): string =>
  `| \`${id}\` | \`src/a.ts:1\` | BooleanLiteral -> \`true\` | ${reason} |\n`
const debt = (id: string): string => row(id, 'debt: pre-existing on main@ba6664c185')
const justified = (id: string): string => row(id, 'line 3 already returns for every input that reaches here')
const reasons = (justifiedRows: string, debtRows: string): string =>
  `# Mutation baseline reasons - demo\n\n## Justified\n\n${HEADER}${justifiedRows}\n## Debt\n\n${HEADER}${debtRows}`

const codes = (violations: readonly string[]): string[] => violations.map((line) => line.split(' ')[0]!)

Deno.test('Should_Hold_When_TheSeedingCommitAddsDebtToAPackageTheBaseHasNoBaselineFor', () => {
  const head = baselineOf(json(A, B), reasons('', debt(A) + debt(B)), 'head')
  assertEquals(judgeBaseline(DIR, null, head), [])
})

Deno.test('Should_ReportDebtAdded_When_ASeededBaselineGainsADebtId', () => {
  const base = baselineOf(json(A), reasons('', debt(A)), 'base')
  const head = baselineOf(json(A, B), reasons('', debt(A) + debt(B)), 'head')
  assertEquals(codes(judgeBaseline(DIR, base, head)), ['BASELINE_DEBT_ADDED'])
})

Deno.test('Should_ReportDebtAdded_When_AJustifiedIdIsRelabelledAsDebt', () => {
  const base = baselineOf(json(A), reasons(justified(A), ''), 'base')
  const head = baselineOf(json(A), reasons('', debt(A)), 'head')
  assertEquals(codes(judgeBaseline(DIR, base, head)), ['BASELINE_DEBT_ADDED'])
})

Deno.test('Should_Hold_When_ASeededBaselineGainsAJustifiedIdAndLosesADebtId', () => {
  const base = baselineOf(json(A, B), reasons('', debt(A) + debt(B)), 'base')
  const head = baselineOf(json(A, C), reasons(justified(C), debt(A)), 'head')
  assertEquals(judgeBaseline(DIR, base, head), [])
})

Deno.test('Should_ReportReasonMissing_When_AnAddedIdHasNoRow', () => {
  const base = baselineOf(json(A), reasons('', debt(A)), 'base')
  const head = baselineOf(json(A, B), reasons('', debt(A)), 'head')
  assertEquals(codes(judgeBaseline(DIR, base, head)), ['BASELINE_REASON_MISSING'])
})

Deno.test('Should_ReportReasonMissing_When_ABaselineHasNoReasonsFile', () => {
  assertEquals(codes(judgeBaseline(DIR, null, baselineOf(json(A), null, 'head'))), ['BASELINE_REASON_MISSING'])
})

Deno.test('Should_ReportOrphan_When_ARowNamesAnIdTheBaselineDropped', () => {
  const head = baselineOf(json(), reasons(justified(A), ''), 'head')
  assertEquals(codes(judgeBaseline(DIR, null, head)), ['BASELINE_REASON_ORPHAN'])
})

Deno.test('Should_ReportMisplaced_When_ADebtRowSitsUnderJustified', () => {
  const head = baselineOf(json(A), reasons(debt(A), ''), 'head')
  assertEquals(codes(judgeBaseline(DIR, null, head)), ['BASELINE_REASON_MISPLACED'])
})

Deno.test('Should_ReportDebtAdded_When_ANewDebtRowIsMisplacedUnderJustified', () => {
  const base = baselineOf(json(A), reasons(justified(A), ''), 'base')
  const head = baselineOf(json(A, B), reasons(justified(A) + debt(B), ''), 'head')
  assertEquals(codes(judgeBaseline(DIR, base, head)).sort(), ['BASELINE_DEBT_ADDED', 'BASELINE_REASON_MISPLACED'])
})
