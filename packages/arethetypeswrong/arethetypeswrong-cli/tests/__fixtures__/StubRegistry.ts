// Replaces a verdaccio container: no foreign image, no auth, no npm publish.
// attw's acquisition needs only { name, version, dist.tarball } — no integrity.

export const FIXTURE_NAME = 'attw-fixture-pkg'
export const FIXTURE_VERSION = '1.0.0'
export const STUB_REGISTRY_PORT = 4873

export const FIXTURE_PACKAGE = {
  name: FIXTURE_NAME,
  version: FIXTURE_VERSION,
  description: 'fixture for attw --from-npm contract scenarios',
  type: 'module',
  main: 'index.js',
  types: 'index.d.ts',
  files: ['index.js', 'index.d.ts'],
} as const

export const FIXTURE_FILES = {
  'index.js': 'export const value = 1\n',
  'index.d.ts': 'export declare const value: number\n',
} as const

export const STUB_REGISTRY_SCRIPT = `
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const PORT = ${STUB_REGISTRY_PORT}
const NAME = ${JSON.stringify(FIXTURE_NAME)}
const VER = ${JSON.stringify(FIXTURE_VERSION)}
const tarball = readFileSync(process.argv[2])
const tarballPath = '/' + NAME + '/-/' + NAME + '-' + VER + '.tgz'
const manifest = JSON.stringify({
  name: NAME,
  version: VER,
  dist: { tarball: 'http://localhost:' + PORT + tarballPath },
})

const server = createServer((req, res) => {
  const url = req.url ?? ''
  if (url === '/' + NAME + '/' + VER || url === '/' + NAME + '/latest' || url === '/' + NAME) {
    res.setHeader('content-type', 'application/json')
    res.end(manifest)
    return
  }
  if (url === tarballPath) {
    res.setHeader('content-type', 'application/octet-stream')
    res.end(tarball)
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, '127.0.0.1', () => console.log('stub registry on ' + PORT))
`
