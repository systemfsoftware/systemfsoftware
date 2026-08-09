import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const NOT_OUR_SOURCE = ['/repos/']
const NOT_LINT_SOURCE = [...NOT_OUR_SOURCE, '/test/', '.test.ts']

const ROOT = process.cwd()

const lintable = (filenames) => filenames.filter((f) => !NOT_OUR_SOURCE.some((p) => f.includes(p)))
const lintableSource = (filenames) => filenames.filter((f) => !NOT_LINT_SOURCE.some((p) => f.includes(p)))

// oxlint rejects `options.typeAware` outside the ROOT config, and running from the
// repo root makes every package config a nested one. `turbo lint` never hits this
// because it runs each package's script with that package as cwd. Passing the owning
// config as `--config` reproduces that: the file becomes the root config, so a
// package keeps the exact severities its own gate applies.
const owningConfig = (file) => {
  let dir = dirname(file)
  while (dir.startsWith(ROOT) && dir !== ROOT) {
    const candidate = join(dir, 'oxlint.config.ts')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  return null
}

const groupByConfig = (files) => {
  const groups = new Map()
  for (const file of files) {
    const config = owningConfig(file)
    const group = groups.get(config)
    if (group === undefined) groups.set(config, [file])
    else group.push(file)
  }
  return groups
}

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => {
    const files = lintable(filenames)
    const cmds = [`dprint fmt --allow-no-files -- ${files.join(' ')}`]
    for (const [config, group] of groupByConfig(lintableSource(filenames))) {
      const scope = config === null ? '' : `--config ${relative(ROOT, config)} `
      cmds.push(`oxlint --fix ${scope}${group.join(' ')} --type-aware --type-check --quiet`)
    }
    return cmds
  },
  '*.{json,jsonc,md,yaml,yml,toml}': (filenames) => {
    const files = lintable(filenames)
    if (files.length === 0) return []
    return [`dprint fmt --allow-no-files -- ${files.join(' ')}`]
  },
}
