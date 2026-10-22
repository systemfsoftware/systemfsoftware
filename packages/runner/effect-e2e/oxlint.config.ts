import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  overrides: [
    {
      files: ['src/bin.ts'],
      rules: {
        'effecttsgo/process-env': 'off',
      },
    },
    {
      files: [
        'src/cli.ts',
        'src/execute.ts',
        'src/expect.ts',
        'src/glob.ts',
        'src/platform-suite-fs.ts',
        'src/scaffold.ts',
        'src/suite.ts',
        'src/errors.schema.ts',
      ],
      rules: {
        complexity: ['error', { max: 20, variant: 'modified' }],
      },
    },
  ],
})
