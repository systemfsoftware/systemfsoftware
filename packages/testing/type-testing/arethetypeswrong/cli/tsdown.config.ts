import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/main.ts',
    'src/AttwHandler.ts',
  ],
  format: 'esm',
  clean: true,
  dts: { tsgo: { path: 'tsc' } },
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: [
      '@systemfsoftware/arethetypeswrong-core',
      'effect',
      '@effect/cli',
      '@effect/printer',
    ],
  },
})
