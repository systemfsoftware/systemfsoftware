const NOT_OUR_SOURCE = ['/repos/']
const NOT_LINT_SOURCE = [...NOT_OUR_SOURCE, '/test/', '.test.ts']

const lintable = (filenames) => filenames.filter((f) => !NOT_OUR_SOURCE.some((p) => f.includes(p)))
const lintableSource = (filenames) => filenames.filter((f) => !NOT_LINT_SOURCE.some((p) => f.includes(p)))

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => {
    const files = lintable(filenames)
    const srcFiles = lintableSource(filenames)
    const cmds = [`dprint fmt --allow-no-files -- ${files.join(' ')}`]
    if (srcFiles.length > 0) {
      cmds.push(`oxlint --fix ${srcFiles.join(' ')} --type-aware --type-check --quiet`)
    }
    return cmds
  },
  '*.{json,jsonc,md,yaml,yml,toml}': (filenames) => {
    const files = lintable(filenames)
    if (files.length === 0) return []
    return [`dprint fmt --allow-no-files -- ${files.join(' ')}`]
  },
}
