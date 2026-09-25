const { defineConfig } = require('vite')

module.exports = defineConfig({
  ssr: {
    resolve: {
      conditions: ['browser'],
    },
  },
})
