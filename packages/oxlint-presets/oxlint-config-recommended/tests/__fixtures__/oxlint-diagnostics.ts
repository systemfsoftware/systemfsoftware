import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PACKAGE = new URL('../../', import.meta.url)
const OXLINT = fileURLToPath(new URL('node_modules/.bin/oxlint', PACKAGE))

export interface OxlintRun {
  readonly fixture: string
  readonly config: string
  readonly format: 'json' | 'unix'
  readonly path: string
}

export interface OxlintOutput {
  readonly stdout: string
  readonly stderr: string
}

export const runOxlint = ({ fixture, config, format, path }: OxlintRun): Promise<OxlintOutput> => {
  const { promise, resolve } = Promise.withResolvers<OxlintOutput>()
  const cwd = fileURLToPath(new URL(fixture, PACKAGE))
  execFile(OXLINT, ['-c', config, `--format=${format}`, path], { cwd }, (_error, stdout, stderr) => {
    resolve({ stdout, stderr })
  })
  return promise
}

export interface Diagnostic {
  readonly code: string
  readonly severity: string
  readonly message: string
  readonly help?: string
}

interface Report {
  readonly diagnostics: readonly Diagnostic[]
}

export const lintDiagnostics = async (config: string, path: string): Promise<readonly Diagnostic[]> => {
  const { stdout, stderr } = await runOxlint({ fixture: 'ui-state-fixture/', config, format: 'json', path })
  const report: Report = await Promise.try(() => JSON.parse(stdout)).catch(() => {
    throw new Error(`oxlint printed no JSON report for ${path} with ${config}:\n${stdout}${stderr}`)
  })
  return report.diagnostics
}
