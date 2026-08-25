/** The path a `--survivors` run reads when no `survivorsPriorReport` is configured. */
export const DEFAULT_SURVIVORS_PRIOR_REPORT = 'reports/mutation-report.json'

/**
 * The remediation every rejection carries (R10): name the full run to do
 * first, never the survivors run itself.
 */
export const SURVIVORS_RUN_FIRST_REMEDIATION = 'run a full `stryker run` first, then re-run with --survivors'

/**
 * The survivors-run bookkeeping keys carried in the resolved options. They
 * are run mechanics, not configuration: a survivors run adds them, so without
 * stripping them the current run's hash would differ from the prior full
 * run's hash for the very same configuration. Their presence in a report's
 * embedded config is also the marker that the report was produced by a
 * survivors run (KTD7).
 */
export const SURVIVORS_BOOKKEEPING_KEYS = ['survivorsPriorReport'] as const
