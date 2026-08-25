/**
 * The four option defaults a human reads about in help text.
 *
 * `StrykerOptions.schema.ts` declares every default, and a CLI that wants to
 * name one in a `--help` description must read it from here rather than type
 * the literal a second time: a restated default drifts the moment the schema
 * moves, and no gate compares a help string against a schema annotation.
 *
 * Only these four are here because only these four are rendered. A default
 * nobody prints has one declaration site already, which is the schema.
 */
export const RENDERED_OPTION_DEFAULTS = {
  coverageAnalysis: 'perTest',
  fileLogLevel: 'off',
  logLevel: 'info',
  tempDirName: '.stryker-tmp',
} as const
