import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FIXTURE = fileURLToPath(new URL('../../ui-state-fixture/', import.meta.url))
const OXLINT = fileURLToPath(new URL('../../node_modules/.bin/oxlint', import.meta.url))

export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly help?: string
}

interface Report {
  readonly diagnostics: readonly Diagnostic[]
}

export const lintDiagnostics = async (config: string, path: string): Promise<readonly Diagnostic[]> => {
  const { promise, resolve } = Promise.withResolvers<string>()
  execFile(OXLINT, ['-c', config, '--format=json', path], { cwd: FIXTURE }, (_error, stdout) => {
    resolve(stdout)
  })
  const report: Report = JSON.parse(await promise)
  return report.diagnostics
}
