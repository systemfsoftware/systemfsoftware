import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import { FastCheck as fc } from 'effect/testing'

import { buildHtmlDocument } from '../report/html-report.js'
import { HtmlReportCommand } from '../report/html-report.schema.js'

const MARKER = 'html-factory-pin-7d2c'
const PLAIN_SOURCE = `export const marker = '${MARKER}'`
const BUNDLE = 'BUNDLE-MARKER-CONTENT'
const MARKUP_SOURCE = "export const marker = 'html-escape-pin-<b>'"
const RAW_MARKUP = 'html-escape-pin-<b>'
const ESCAPED_MARKUP = 'html-escape-pin-<"+"b>'

const reportOf = (source: string): MutationTestResult => ({
  schemaVersion: '1.0',
  files: {
    'src/marker.ts': {
      language: 'typescript',
      source,
      mutants: [
        {
          id: '0',
          mutatorName: 'BlockStatement',
          status: 'Killed',
          location: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
        },
      ],
    },
  },
  thresholds: { high: 80, low: 60 },
})

const documentOf = (source: string, scriptContent: string): string =>
  buildHtmlDocument(HtmlReportCommand.make({ report: reportOf(source), scriptContent })).html

describe('html report document', () => {
  it.prop('∀c_CompletedRun_≡TheDocumentCarriesTheReportTheAppAndItsBundle', [fc.constant(PLAIN_SOURCE)], ([source]) => {
    const html = documentOf(source, BUNDLE)
    return html.includes(MARKER) &&
      html.includes('mutation-test-report-app') &&
      html.includes(BUNDLE) &&
      !html.includes(process.cwd())
  })

  it.prop('∀c_MarkupSource_≡TheEmbeddedReportIsEscaped', [fc.constant(MARKUP_SOURCE)], ([source]) => {
    const html = documentOf(source, BUNDLE)
    return html.includes(ESCAPED_MARKUP) && !html.includes(RAW_MARKUP)
  })

  it.prop(
    '∀c_EqualReports_≡EqualDocuments',
    [fc.constant(PLAIN_SOURCE)],
    ([source]) => documentOf(`export const marker = '${MARKER}'`, BUNDLE) === documentOf(source, BUNDLE),
  )
})
