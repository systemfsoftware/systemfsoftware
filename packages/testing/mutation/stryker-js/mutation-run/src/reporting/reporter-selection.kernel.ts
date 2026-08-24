/**
 * Which reporters may run, given the output mode.
 *
 * Machine mode keeps stdout exclusively for the NDJSON stream, so a reporter
 * that writes prose there cannot run: a progress bar or a score table
 * interleaved into the protocol makes every line after it unparseable, and the
 * consumer has no way to tell the difference between that and a malformed run.
 * The file reporters are unaffected — they write to disk, never to stdout, and a
 * machine consumer wants their output.
 *
 * Human mode has no NDJSON channel, so the `progress-stream` reporter is inert
 * and the human reporter `clear-text` runs instead. The substitution preserves
 * the user's other reporters (`html`, `json`, …) and their order, and is
 * idempotent.
 *
 * This is the ONLY gate on reporter selection by mode. The alternative, letting
 * each reporter decide whether to render, puts the same decision in as many
 * places as there are reporters and lets them disagree; and a reporter that
 * renders nothing is indistinguishable from one that failed.
 */
const STDOUT_REPORTERS: ReadonlySet<string> = new Set(['clear-text', 'progress'])

/** The reporter that carries the machine protocol. Inert in human mode. */
const STREAM_REPORTER = 'progress-stream'

/** The human reporter that renders the score table and mutant details. */
const HUMAN_REPORTER = 'clear-text'

/**
 * Narrows the configured reporter list to those the mode permits.
 *
 * Pure: names in, names out. Order is preserved so a consumer reading the
 * resolved options sees its own list, minus what the mode forbids.
 * Human mode substitutes `progress-stream` -> `clear-text`, deduplicated to
 * keep the operation idempotent.
 */
export function selectReporters(
  configured: readonly string[],
  mode: 'human' | 'machine',
): readonly string[] {
  if (mode === 'human') {
    const mapped = configured.map((name) => (name === STREAM_REPORTER ? HUMAN_REPORTER : name))
    const seen = new Set<string>()
    const result: string[] = []
    for (const name of mapped) {
      if (!seen.has(name)) {
        seen.add(name)
        result.push(name)
      }
    }
    return result
  }
  const permitted = configured.filter((name) => !STDOUT_REPORTERS.has(name))
  return permitted.includes(STREAM_REPORTER) ? permitted : [...permitted, STREAM_REPORTER]
}
