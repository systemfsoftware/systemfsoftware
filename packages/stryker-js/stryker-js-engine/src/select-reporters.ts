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
): readonly string[] => {
  if (mode === 'human') {
    return [...new Set(configured.map(asHumanReporter))]
  }
  const permitted = configured.filter((name) => STDOUT_REPORTERS[name] !== true)
  if (permitted.includes(STREAM_REPORTER)) {
    return permitted
  }
  return [...permitted, STREAM_REPORTER]
}
