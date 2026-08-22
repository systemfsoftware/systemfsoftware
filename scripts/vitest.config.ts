import { defineConfig } from 'npm:vitest@4.1.10/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: [],
    includeSource: ['guards/check-remote-main.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/repos/**',
      '**/.repos/**',
      '**/packages/**',
    ],
  },
})
