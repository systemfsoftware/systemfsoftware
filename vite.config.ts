import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    singleQuote: true,
    semi: false,
    tabWidth: 2,
    trailingComma: 'all',
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  run: {
    cache: true,
  },
})
