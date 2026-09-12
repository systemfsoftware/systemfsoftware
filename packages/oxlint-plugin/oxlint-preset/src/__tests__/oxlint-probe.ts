import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const findUp = (start: string, relative: string): string | null => {
  let dir = start
  for (;;) {
    if (existsSync(path.join(dir, relative))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const repoRoot = findUp(PACKAGE_ROOT, 'pnpm-workspace.yaml')
const oxlintRoot = findUp(PACKAGE_ROOT, 'node_modules/.bin/oxlint')

if (repoRoot === null || oxlintRoot === null) {
  throw new Error(`expected a pnpm workspace with a local oxlint above ${PACKAGE_ROOT}`)
}

export const REPO_ROOT = repoRoot

export const LOCAL_OXLINT = path.join(oxlintRoot, 'node_modules/.bin/oxlint')

const workDirs: string[] = []

export const packageWorkDir = (prefix: string): string => {
  const dir = mkdtempSync(path.join(PACKAGE_ROOT, `.host-probe-${prefix}-`))
  workDirs.push(dir)
  return dir
}

export const tmpWorkDir = (prefix: string): string => {
  const dir = mkdtempSync(path.join(os.tmpdir(), `oxlint-preset-${prefix}-`))
  workDirs.push(dir)
  return dir
}

export const removeWorkDirs = (): void => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true })
}

export type RunResult = { code: number; output: string }

export const run = (binary: string, args: readonly string[], cwd: string): RunResult => {
  const result = spawnSync(binary, [...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` }
}

export const tailJson = (output: string): string => output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)

/** Decode one CLI's JSON payload into `unknown`, so every field must be narrowed where it is read. */
export const parseJson = (text: string): unknown => {
  const parsed: unknown = JSON.parse(text)
  return parsed
}

export const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value)

export const requireUnknownArray = (value: unknown, label: string): unknown[] => {
  if (!isUnknownArray(value)) throw new Error(`expected ${label} to be an array`)
  return value
}

export const requireObject = (value: unknown, label: string): object => {
  if (value === null || typeof value !== 'object') throw new Error(`expected ${label} to be an object`)
  return value
}

export const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`expected ${label} to be a string`)
  return value
}

export const requireStringArray = (value: unknown, label: string): string[] => {
  const entries = requireUnknownArray(value, label)
  return entries.map((entry, index) => requireString(entry, `${label}[${index}]`))
}

export const requireStringRecord = (value: unknown, label: string): Record<string, string> => {
  const decoded: Record<string, string> = {}
  for (const [key, entry] of Object.entries(requireObject(value, label))) {
    decoded[key] = requireString(entry, `${label}.${key}`)
  }
  return decoded
}

export type OxlintDiagnostic = { code: string; filename: string }

export const decodeDiagnostics = (report: unknown): OxlintDiagnostic[] => {
  const root = requireObject(report, 'the oxlint json report')
  const diagnostics = 'diagnostics' in root ? root.diagnostics : undefined
  return requireUnknownArray(diagnostics, 'the oxlint json report diagnostics').map((entry, index) => {
    const diagnostic = requireObject(entry, `diagnostic ${index}`)
    const code = 'code' in diagnostic ? diagnostic.code : undefined
    const filename = 'filename' in diagnostic ? diagnostic.filename : undefined
    return {
      code: requireString(code, `diagnostic ${index} code`),
      filename: requireString(filename, `diagnostic ${index} filename`),
    }
  })
}

export const writeFiles = (dir: string, files: Record<string, string>): void => {
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, file), content)
  }
}

export const pluginModule = (namespace: string, metaName = namespace): string =>
  [
    'const rule = {',
    '  create(context) {',
    '    return {',
    '      Program(node) {',
    `        context.report({ node, message: '${namespace} fired' })`,
    '      },',
    '    }',
    '  },',
    '}',
    `export default { meta: { name: '${metaName}' }, rules: { hit: rule } }`,
    '',
  ].join('\n')
