import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export const CLI_BIN = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'dist', 'main.mjs')

export interface CliResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

export const runConventions = (
  cwd: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): CliResult => {
  const run = spawnSync(process.execPath, [CLI_BIN, ...args], { cwd, encoding: 'utf8', env })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

export const makeTree = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

export const writeFile = (root: string, relative: string, content: string): string => {
  const absolute = path.join(root, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content)
  return absolute
}

export const CONFORMING_TSCONFIG = `{
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
`

export const VIOLATING_TSCONFIG = `{
  "include": ["src"]
}
`

export const TODO_RULE = `---
level: error
---
# No TODO keys in JSON

Flags any JSON document carrying a TODO key.

\`\`\`grit
engine marzano(0.1)
language json

\`$program\` where {
  $program <: contains \`"TODO": $_\`
}
\`\`\`
`
