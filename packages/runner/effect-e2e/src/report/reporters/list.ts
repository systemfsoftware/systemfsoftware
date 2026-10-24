import * as Arr from 'effect/Array'

import { finalReasonOf, type Report1, type TestResult } from '../report.schema.js'

const resultLineOf = (result: TestResult): string =>
  [
    `${result.status.toUpperCase().padEnd(11)} ${result.title} [${result.target}/${result.agent}]`,
    ...(result.status === 'passed' ? [] : [`  ${finalReasonOf(result)}`]),
  ].join('\n')

const cacheLineOf = ({ cache, hitRate }: Report1['summary']): string =>
  `cache: ${cache.replayed} replayed, ${cache.handedOff} handed off, ${cache.missed} missed (hit rate ${
    Math.round(hitRate * 100)
  }%)`

export const renderList = (report: Report1): string =>
  [
    ...Arr.map(report.results, resultLineOf),
    '',
    `${report.summary.tests} tests: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.blocked} blocked, ${report.summary.error} error, ${report.summary.interrupted} interrupted, ${report.summary.skipped} skipped`,
    cacheLineOf(report.summary),
    `run ${report.run.status} (exit ${report.run.exitCode})`,
    '',
  ].join('\n')
