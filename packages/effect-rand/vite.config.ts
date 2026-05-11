import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: 'src/mod.ts',
      pcg: 'src/pcg.ts',
    },
    dts: {
      tsgo: true,
      tsconfig: './tsconfig.build.json',
    },
    exports: {
      customExports(exports) {
        for (const [key, value] of Object.entries(exports)) {
          if (key === './package.json') continue
          if (typeof value === 'string') {
            exports[key] = {
              types: value.replace(/\.mjs$/, '.d.mts'),
              default: value,
            }
          }
        }
        return exports
      },
    },
    deps: {
      onlyBundle: false,
    },
    define: {
      'import.meta.vitest': 'undefined',
    },
  },
  test: {
    includeSource: ['src/**/*.{js,ts}'],
    exclude: ['**/.stryker-tmp/**', '**/node_modules/**'],
    setupFiles: ['./vitest-setup.ts'],
  },
})
