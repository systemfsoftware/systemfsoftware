import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'

import { finalReasonOf, type Report1, type TestResult, type TestStatus } from '../report.schema.js'

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

const escaped = (text: string): string => text.replace(/[&<>"']/gu, (character) => ENTITIES[character] ?? character)

interface Totals {
  readonly tests: number
  readonly failures: number
  readonly errors: number
  readonly skipped: number
}

const countOf = (results: ReadonlyArray<TestResult>, statuses: ReadonlyArray<TestStatus>): number =>
  Arr.filter(results, (result) => statuses.includes(result.status)).length

// A JUnit failure is a test the product or its automation failed; blocked, errored and interrupted runs are errors.
const totalsOf = (results: ReadonlyArray<TestResult>): Totals => ({
  tests: results.length,
  failures: countOf(results, ['failed']),
  errors: countOf(results, ['blocked', 'error', 'interrupted']),
  skipped: countOf(results, ['skipped']),
})

const totalsText = (totals: Totals): string =>
  `tests="${totals.tests}" failures="${totals.failures}" errors="${totals.errors}" skipped="${totals.skipped}"`

const verdictElementOf = (result: TestResult): string => {
  const reason = escaped(finalReasonOf(result))
  return Match.value(result.status).pipe(
    Match.when('passed', () => ''),
    Match.when('skipped', () => `<skipped message="${reason}"/>`),
    Match.when('failed', () => `<failure message="${reason}" type="failed"/>`),
    Match.orElse((status) => `<error message="${reason}" type="${status}"/>`),
  )
}

const testcaseOf = (result: TestResult): string =>
  `    <testcase name="${escaped(`${result.title} [${result.target}/${result.agent}]`)}" classname="${
    escaped(result.file)
  }">${verdictElementOf(result)}</testcase>`

const suiteOf = ([file, results]: readonly [string, Arr.NonEmptyReadonlyArray<TestResult>]): string =>
  [
    `  <testsuite name="${escaped(file)}" ${totalsText(totalsOf(results))}>`,
    ...Arr.map(results, testcaseOf),
    '  </testsuite>',
  ].join('\n')

/** `junit.xml`: one suite per test file, one case per result, with the report's own counts (requirements FR-10). */
export const renderJunit = (report: Report1): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="effect-e2e" ${totalsText(totalsOf(report.results))}>`,
    ...Arr.map(Object.entries(Arr.groupBy(report.results, (result) => result.file)), suiteOf),
    '</testsuites>',
    '',
  ].join('\n')
