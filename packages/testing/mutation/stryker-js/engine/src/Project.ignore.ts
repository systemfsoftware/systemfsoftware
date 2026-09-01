export const ALWAYS_IGNORE = Object.freeze([
  'node_modules',
  '.git',
  '*.tsbuildinfo',
  '/stryker.log',
  '.next',
  '.nuxt',
  '.svelte-kit',
])

export const IGNORE_PATTERN_CHARACTER = '!'

export const MUTATION_RANGE_REGEX = /(.*?):((\d+)(?::(\d+))?-(\d+)(?::(\d+))?)$/
