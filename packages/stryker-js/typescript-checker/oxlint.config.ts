import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  ...base,
  rules: {
    ...base.rules,
    // This package models TypeScript/compiler state with plain classes.
    '@systemfsoftware/ban-classes': 'off',
    // Test titles follow the upstream Stryker convention.
    '@systemfsoftware/damp-test-naming': 'off',
    // TypeScript already reports unused locals; this avoids false positives in test files.
    'no-unused-vars': 'off',
  },
  ignorePatterns: [...base.ignorePatterns, '**/testResources/**'],
})
