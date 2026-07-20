import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/getExitCode.ts',
    'src/render/index.ts',
  ],
  format: 'esm',
  clean: true,
  dts: { tsgo: { path: 'tsc' } },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: [
      '@systemfsoftware/arethetypeswrong-core',
      'chalk',
      'cli-table3',
      'commander',
      'marked',
      'marked-terminal',
      'semver',
    ],
  },
})
