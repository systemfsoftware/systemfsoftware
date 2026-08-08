/**
 * Surface-only re-export of the exit-classification symbols the CLI imports
 * from core: `ExitClass`, `getPendingExitClasses`, `resolveExitCode`. The
 * source module (`object-utils.ts`) exports more — internal helpers used by
 * core itself — so the entry must be enumerated, not the source module.
 */
export { ExitClass, getPendingExitClasses, resolveExitCode } from './object-utils.js'
