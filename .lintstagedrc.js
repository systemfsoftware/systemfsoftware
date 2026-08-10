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
    const cmds = []
    const formattable = lintable(filenames)
    // `dprint fmt --allow-no-files --` with nothing after the separator is not a no-op:
    // with no patterns dprint falls back to its config includes and formats the entire
    // repo (measured 2026-08-10). Reachable whenever every staged source file is
    // vendored, so the list is guarded rather than trusted - as the glob below already does.
    if (formattable.length > 0) cmds.push(`dprint fmt --allow-no-files -- ${formattable.join(' ')}`)
    for (const [config, group] of groupByConfig(lintableSource(filenames))) {
      // No owning config means no package gate lints this path. `turbo lint` runs one
      // config per package, and `check-lint-coverage.mjs` defines lint scope as exactly
      // those packages, so root-level tooling files are outside it. A hook that lints
      // them anyway invents a gate CI does not have, then fails on default severities it
      // was never configured with: commitlint.config.ts reports 7 phantom TS errors,
      // because type-aware runs with no tsconfig in scope.
      if (config === null) continue
      // Every path in a group can be ignored by the owning config - a committed bundle
      // under dist/, a testResources fixture, a .d.ts. oxlint then sees zero files and
      // exits 1 ("No files found to lint"), a tooling dead end rather than a failing
      // gate. The flag is oxlint's own answer; a real violation still fails.
      cmds.push(
        `oxlint --fix --no-error-on-unmatched-pattern --config ${relative(ROOT, config)} ${
          group.join(' ')
        } --type-aware --type-check --quiet`,
      )
    }
    return cmds
  },
  '*.{json,jsonc,md,yaml,yml,toml}': (filenames) => {
    const files = lintable(filenames)
    if (files.length === 0) return []
    return [`dprint fmt --allow-no-files -- ${files.join(' ')}`]
  },
}
