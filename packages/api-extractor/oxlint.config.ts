import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

const ignorePatternsNotInheritedThroughExtends = [...(recommended.ignorePatterns ?? [])]

export default defineConfig({ extends: [recommended], ignorePatterns: ignorePatternsNotInheritedThroughExtends })
