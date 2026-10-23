import * as Arr from 'effect/Array'

import { type ArtifactRef, finalReasonOf, type Report1, type TestResult } from '../report.schema.js'

const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll(/\r?\n/gu, ' ')

const row = (cells: ReadonlyArray<string>): string => `| ${cells.map(cell).join(' | ')} |`

const tableOf = (header: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<string> => [
  row(header),
  row(header.map(() => '---')),
  ...rows.map(row),
]

const linkOf = (artifact: ArtifactRef): string => `[${artifact.kind}](${artifact.path})`

const failureOf = (result: TestResult): ReadonlyArray<string> => [
  `### ${cell(result.title)} (${result.target} / ${result.agent})`,
  '',
  `- Status: ${result.status}`,
  `- Reason: \`${finalReasonOf(result)}\``,
  ...(Arr.isReadonlyArrayNonEmpty(result.artifacts) ? [`- Evidence: ${result.artifacts.map(linkOf).join(', ')}`] : []),
  '',
]

export const renderMarkdown = (report: Report1): string =>
  [
    '# effect-e2e report',
    '',
    `Run \`${report.run.id}\` of \`${report.run.project}\`: **${report.run.status}** (exit ${report.run.exitCode})`,
    '',
    ...tableOf(
      ['Tests', 'Passed', 'Failed', 'Blocked', 'Error', 'Interrupted', 'Skipped'],
      [[
        report.summary.tests,
        report.summary.passed,
        report.summary.failed,
        report.summary.blocked,
        report.summary.error,
        report.summary.interrupted,
        report.summary.skipped,
      ].map(String)],
    ),
    '',
    '## Results',
    '',
    ...tableOf(
      ['Status', 'Test', 'File', 'Target', 'Agent'],
      report.results.map((result) => [result.status, result.title, result.file, result.target, result.agent]),
    ),
    '',
    ...Arr.match(
      Arr.filter(report.results, (result) => result.status !== 'passed' && result.status !== 'skipped'),
      { onEmpty: () => [], onNonEmpty: (failing) => ['## Failures', '', ...Arr.flatMap(failing, failureOf)] },
    ),
  ].join('\n')
