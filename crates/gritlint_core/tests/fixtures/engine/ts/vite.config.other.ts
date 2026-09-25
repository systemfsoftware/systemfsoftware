import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    conditions: ['browser'],
  },
})
