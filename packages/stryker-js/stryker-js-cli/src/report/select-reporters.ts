import * as Match from 'effect/Match'

const STREAM_REPORTER = 'progress-stream'
const HUMAN_REPORTER = 'clear-text'

const STDOUT_REPORTERS: Readonly<Record<string, true>> = { 'clear-text': true, 'progress': true }

const asHumanReporter = (name: string): string => {
  if (name === STREAM_REPORTER) {
    return HUMAN_REPORTER
  }
  return name
}

export const selectReporters = (
  configured: readonly string[],
  mode: 'human' | 'machine',
): readonly string[] =>
  Match.value(mode).pipe(
    Match.when('human', () => [...new Set(configured.map(asHumanReporter))]),
    Match.when('machine', () => {
      const permitted = configured.filter((name) => STDOUT_REPORTERS[name] !== true)
      return Match.value(permitted.includes(STREAM_REPORTER)).pipe(
        Match.when(true, () => permitted),
        Match.when(false, () => [...permitted, STREAM_REPORTER]),
        Match.exhaustive,
      )
    }),
    Match.exhaustive,
  )
