import { generateSurfaceTests } from './index.js'

const args = process.argv.slice(2)

if (args[0] !== 'generate' || typeof args[1] !== 'string' || args[1].length === 0) {
  process.stderr.write('Usage: api-surface generate <pkgDir>\n')
  process.exit(1)
}

await generateSurfaceTests(args[1])
