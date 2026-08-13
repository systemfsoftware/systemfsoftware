import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const NOT_OUR_SOURCE = ['/repos/']
const NOT_LINT_SOURCE = [...NOT_OUR_SOURCE, '/test/', '.test.ts']

const ROOT = process.cwd()
const DPRINT = join(ROOT, 'bin/dprint')

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

const TOLERATE_A_ZERO_FILE_SET = '--no-error-on-unmatched-pattern'

const hasOwningConfig = ([config]) => config !== null

const formatCommands = (filenames) => {
  const formattable = lintable(filenames)
  if (formattable.length === 0) return []
  return [`${DPRINT} fmt --allow-no-files -- ${formattable.join(' ')}`]
}

const lintCommands = (filenames) =>
  [...groupByConfig(lintableSource(filenames))]
    .filter(hasOwningConfig)
    .map(([config, group]) =>
      `oxlint --fix ${TOLERATE_A_ZERO_FILE_SET} --config ${relative(ROOT, config)} ${
        group.join(' ')
      } --type-aware --type-check --quiet`
    )

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => [...formatCommands(filenames), ...lintCommands(filenames)],
  '*.{json,jsonc,md,yaml,yml,toml}': (filenames) => formatCommands(filenames),
}
