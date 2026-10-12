// mutation-config: every package with a `mutation` script keeps sharedConfig's
// ignore list. Its Stryker config spreads `sharedConfig` and declares no
// `ignorePatterns` of its own, so the resolved list is exactly sharedConfig's
// and a file under reports/ or coverage/ (a prior record, test-runner coverage)
// never enters the digest Stryker reuses verdicts by. Read from source, so it
// decides before any Mutation run, for batch projects too.
import { join } from '@std/path'
import { holds, parseJsonObject, Undecided, type Verdict, violated } from './verdict.ts'
import { readWorkspace, workspacePackageDirs } from './workspace.ts'

const CONFIG_NAME = /^stryker\.conf(ig)?\.(ts|mts|cts|js|mjs|cjs)$/

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** Violation codes for one config's source; empty when its ignore list is sharedConfig's. */
export const judgeConfig = (source: string): readonly string[] => {
  const code = withoutComments(source)
  return [
    ...(/\.\.\.\s*sharedConfig\b/.test(code) ? [] : ['MUTATION_CONFIG_NO_SHARED']),
    ...(/\bignorePatterns\b/.test(code) ? ['MUTATION_CONFIG_OWN_IGNORE'] : []),
  ]
}

const configsIn = async (dir: string): Promise<string[]> => {
  const names: string[] = []
  for await (const entry of Deno.readDir(dir)) if (entry.isFile && CONFIG_NAME.test(entry.name)) names.push(entry.name)
  return names.sort()
}

export const checkMutationConfig = async (root: string): Promise<Verdict> => {
  const dirs = await workspacePackageDirs(root, await readWorkspace(root))
  const violations: string[] = []
  let judged = 0
  for (const dir of dirs) {
    const manifest = parseJsonObject(await Deno.readTextFile(join(dir, 'package.json')), join(dir, 'package.json'))
    const scripts = manifest['scripts']
    if (typeof scripts !== 'object' || scripts === null || !Object.hasOwn(scripts, 'mutation')) continue
    const rel = dir.slice(root.length + 1)
    const configs = await configsIn(dir)
    if (configs.length !== 1) {
      throw new Undecided(`${rel}: has a \`mutation\` script and ${configs.length} stryker config files`)
    }
    judged++
    for (const code of judgeConfig(await Deno.readTextFile(join(dir, configs[0]!)))) {
      violations.push(`${code} ${rel}/${configs[0]}`)
    }
  }
  return violations.length === 0
    ? holds(`${judged} mutated package config(s) keep sharedConfig's ignorePatterns`)
    : violated(
      violations,
      "A mutated package's stryker config must spread `sharedConfig` and set no `ignorePatterns` of its own: a narrower list lets a prior record or coverage output enter the digest, and every open-closure and static mutant re-runs on every run (packages/toolchain/stryker-config/README.md).",
    )
}
