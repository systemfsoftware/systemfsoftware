import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

const ignorePatternsNotInheritedThroughExtends = [...(recommended.ignorePatterns ?? [])]

const fixtureProjectsBesideHarnessModules = ['tests/__fixtures__/*/**']

export default defineConfig({
  extends: [recommended],
  ignorePatterns: [...ignorePatternsNotInheritedThroughExtends, ...fixtureProjectsBesideHarnessModules],
})
