import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const forkDir = fileURLToPath(new URL('../..', import.meta.url))

const effectDir = realpathSync(join(forkDir, 'node_modules', 'effect'))

export const forkTestClock = join(forkDir, 'src', 'TestClock.ts')

export interface PluginWorkspace {
  readonly root: string
  readonly packageDir: string
  readonly testFile: string
}

export const pluginWorkspace = (input: { readonly manifest: object; readonly marked: boolean }): PluginWorkspace => {
  const root = mkdtempSync(join(tmpdir(), 'vitest-fork-plugin-'))
  const packageDir = join(root, 'packages', 'app')
  mkdirSync(join(packageDir, 'node_modules', '@systemfsoftware'), { recursive: true })
  symlinkSync(forkDir, join(packageDir, 'node_modules', '@systemfsoftware', 'vitest'), 'dir')
  symlinkSync(effectDir, join(packageDir, 'node_modules', 'effect'), 'dir')
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(input.manifest))
  if (input.marked) writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  return { root, packageDir, testFile: join(packageDir, 'case.test.ts') }
}

export const removeWorkspace = (workspace: PluginWorkspace): void => {
  rmSync(workspace.root, { recursive: true, force: true })
}
