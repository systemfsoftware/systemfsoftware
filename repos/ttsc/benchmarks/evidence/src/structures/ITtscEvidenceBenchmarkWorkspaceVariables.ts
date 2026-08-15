/**
 * Neutral template substitutions that identify one benchmark project.
 *
 * Both arms receive the same values, preventing package names or visible
 * project metadata from revealing the selected treatment.
 */
export interface ITtscEvidenceBenchmarkWorkspaceVariables {
  /** Human-readable project name inserted into template metadata. */
  name: string;

  /** Workspace package name for the generated API contract. */
  apiPackageName: string;

  /** Workspace package name for the generated backend. */
  backendPackageName: string;

  /** Workspace package name for the generated frontend. */
  frontendPackageName: string;
}
