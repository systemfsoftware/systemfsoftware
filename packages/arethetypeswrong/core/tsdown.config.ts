import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/utils.ts',
    'src/problems.ts',
    'src/versions.ts',
  ],
  format: 'esm',
  clean: true,
  dts: { tsgo: { path: 'tsc' } },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: [
      'typescript',
      '@andrewbranch/untar.js',
      '@loaderkit/resolve',
      'cjs-module-lexer',
      'fflate',
      'lru-cache',
      'semver',
      'validate-npm-package-name',
    ],
  },
})
