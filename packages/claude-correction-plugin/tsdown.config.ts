import { defineConfig } from 'tsdown'

// Claude Code runs `node ${CLAUDE_PLUGIN_ROOT}/dist/<name>.js` from wherever the plugin was
// installed, so nothing may be left for Node to resolve: alwaysBundle folds effect into each entry.
export default defineConfig({
  entry: {
    'correction-capture': './src/correction-capture/main.ts',
    'frustration-guard': './src/frustration-guard/main.ts',
  },
  format: 'esm',
  dts: false,
  exports: false,
  tsconfig: './tsconfig.build.json',
  minify: false,
  clean: false,
  outExtensions: () => ({ js: '.js' }),
  deps: { onlyBundle: false, alwaysBundle: [/^effect$/, /^effect\//, /^@effect\//] },
  define: { 'import.meta.vitest': 'undefined' },
})
