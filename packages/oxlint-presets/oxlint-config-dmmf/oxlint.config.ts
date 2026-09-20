import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
  },
  plugins: ['typescript', 'import', 'jsdoc', 'node', 'promise', 'vitest', 'unicorn', 'oxc'],
})
