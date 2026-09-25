import { defineConfig } from 'vite'

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ['browser'],
    },
  },
})
