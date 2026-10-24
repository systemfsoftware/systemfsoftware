/// <reference types="vitest/importMeta" />
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'

import type { Report1, TestResult } from '@systemfsoftware/effect-e2e/report'

export interface SelectedFailures {
  readonly files: ReadonlyArray<string>
  readonly testNamePattern: string
}

type Outcome = Pick<TestResult, 'title' | 'file' | 'status'>

const FAILED: { readonly [Status in TestResult['status']]: boolean } = {
  passed: false,
  skipped: false,
  failed: true,
  blocked: true,
  error: true,
  interrupted: true,
}

const REGEX_SYNTAX = /[$()*+.?[\\\]^{|}]/gu

const escaped = (title: string): string => title.replaceAll(REGEX_SYNTAX, String.raw`\$&`)

const selectionOf = (results: ReadonlyArray<Outcome>): Option.Option<SelectedFailures> =>
  Arr.match(results.filter((result) => FAILED[result.status]), {
    onEmpty: () => Option.none(),
    onNonEmpty: (failed) =>
      Option.some({
        files: Arr.dedupe(failed.map((result) => result.file)),
        testNamePattern: failed.map((result) => escaped(result.title)).join('|'),
      }),
  })

export const lastFailedOf = (report: Report1): Option.Option<SelectedFailures> => selectionOf(report.results)

if (import.meta.vitest !== void 0) {
  // tsdown defines `import.meta.vitest` as `undefined`, so a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')
  const { TestResult } = await import('@systemfsoftware/effect-e2e/report')

  const Row = Schema.Struct({
    title: TestResult.fields.title,
    file: TestResult.fields.file,
    status: TestResult.fields.status,
  })

  const isFailure = (row: Outcome): boolean => row.status !== 'passed' && row.status !== 'skipped'

  // Vitest builds the same `new RegExp(pattern)` from `testNamePattern`, so the regex engine is the oracle.
  const selectsExactly = (selection: Option.Option<SelectedFailures>, failedTitles: ReadonlyArray<string>): boolean =>
    Option.match(selection, {
      onNone: () => failedTitles.length === 0,
      onSome: (selected) => failedTitles.every((title) => new RegExp(selected.testNamePattern).test(title)),
    })

  it.prop(
    '∀rows_FailedRows_≡MatchedByThePatternAndNoneWhenGreen',
    { of: [Schema.Array(Row)], subject: selectionOf },
    (select, [rows]) => selectsExactly(select(rows), rows.filter(isFailure).map((row) => row.title)),
  )
}
