export default defineConfig({
  exports: { devExports: '@systemfsoftware/source', customExports: injectTypes },
  clean: false,
})
