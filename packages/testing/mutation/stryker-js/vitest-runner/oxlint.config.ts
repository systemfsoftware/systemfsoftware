import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  ...all,
  ignorePatterns: [...(all.ignorePatterns ?? []), '**/testResources/**'],
})
