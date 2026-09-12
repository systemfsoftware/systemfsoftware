import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import { FastCheck as fc } from 'effect/testing'

import { buildHtmlDocument } from '../report/html-report.js'
import { HtmlReportCommand } from '../report/html-report.schema.js'

const BUNDLE = 'BUNDLE-MARKER-CONTENT'

const SAFE_CHAR = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 <>&'`()[].,_-/#=!?%@$^~*+;:".split(''),
)

const SOURCE_ARB: fc.Arbitrary<string> = fc.array(SAFE_CHAR, { minLength: 1, maxLength: 40 }).map((chars) =>
  chars.join('')
)

const BUNDLE_ARB = fc.stringMatching(/[A-Z][A-Z0-9_]{2,11}/)

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
  it.prop('∀b_Bundles_≡TheDocumentNamesTheAppItsBundleAndNeverTheWorkingDirectory', [BUNDLE_ARB], ([bundle]) => {
    const html = documentOf('export const marker = true', bundle)
    return html.includes(bundle) &&
      html.includes('mutation-test-report-app') &&
      !html.includes(process.cwd())
  })

  it.prop('∀s_MarkupSources_≡EveryAngleBracketIsEscapedAndNoRawMarkupShips', [SOURCE_ARB], ([source]) => {
    const html = documentOf(source, BUNDLE)
    return html.includes(source.replaceAll('<', '<"+"'))
  })

  it.prop('∀s_Sources_≡ADifferentReportYieldsADifferentDocument', [SOURCE_ARB], ([source]) => {
    return documentOf(source, BUNDLE) !== documentOf(`${source}x`, BUNDLE)
  })
})
