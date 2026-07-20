const NOT_OUR_SOURCE = ['/repos/']

const lintable = (filenames) => filenames.filter((f) => !NOT_OUR_SOURCE.some((p) => f.includes(p)))

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => {
    const files = lintable(filenames)
    if (files.length === 0) return []
    return [
      `dprint fmt --allow-no-files ${files.join(' ')}`,
      `oxlint --fix ${files.join(' ')} --type-aware --type-check --quiet`,
    ]
  },
  '*.{json,jsonc,md,yaml,yml,toml}': (filenames) => {
    const files = lintable(filenames)
    if (files.length === 0) return []
    return [`dprint fmt --allow-no-files ${files.join(' ')}`]
  },
}
