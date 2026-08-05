/**
 * Config-file names the rebuild removed, mapped to their remediation.
 *
 * Separate module because its two consumers cannot import each other:
 * `options-validator.ts` rejects these names, and `fork-schema.ts` deletes
 * them from the schema so their defaults are never injected. The validator
 * already imports the fork schema, so this cannot live there.
 *
 * Deliberately absent: CI-provider, initializer and dropped-command options
 * (no config-file surface, environment variables and commands only); flags
 * dropped from the CLI that were never config keys (`--files`,
 * `--allowConsoleColors`, `--dashboard.*`), which fail as unknown arguments;
 * and deprecated-but-migrated keys (`files`, `transpilers`, `testFramework`),
 * which `removeDeprecatedOptions` rewrites and which stay soft on purpose.
 */
export const REMOVED_OPTIONS: Record<string, string> = {
  'dots': 'the "dots" reporter was removed; use "clear-text" instead',
  'event-recorder':
    'the "event-recorder" reporter was removed; use the "json" reporter or the machine-mode progress stream for structured output',
  'progress-append-only': 'the "progress-append-only" reporter was removed; use "progress-stream" instead',
  'dashboard':
    'the "dashboard" reporter and its options were removed; write the "json" or "html" report and publish it yourself',
  'eventReporter': 'the event-recorder reporter was removed; remove this option',
}
