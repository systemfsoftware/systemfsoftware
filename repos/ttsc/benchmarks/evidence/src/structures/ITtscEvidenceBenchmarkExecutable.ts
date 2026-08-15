/**
 * Cross-platform executable invocation resolved for a native agent CLI.
 *
 * Windows command shims require a composed argument vector while POSIX can pass
 * native arguments directly; this structure hides only that distinction.
 */
export interface ITtscEvidenceBenchmarkExecutable {
  /** Executable path passed to child_process. */
  command: string;

  /** Converts native arguments into the platform-specific final vector. */
  composeArguments: (arguments_: readonly string[]) => string[];

  /** Whether Windows receives the composed arguments verbatim. */
  windowsVerbatimArguments: boolean;
}
