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
  return { code: result.status ?? -1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

export const tailJson = (output: string): string => output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)

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
