import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const packagesRoots = [
  join(repoRoot, 'packages'),
  join(repoRoot, 'omp', 'packages'),
  join(repoRoot, 'omp', 'plugins'),
]

let failed = false

for (const root of packagesRoots) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgPath = join(root, entry.name, 'package.json')
    let pkg
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    } catch {
      continue
    }
    if (pkg.private === true) continue

    const repoUrl = pkg.repository?.url
    if (!repoUrl || typeof repoUrl !== 'string' || repoUrl === '') {
      console.error(`[FAIL] ${pkg.name}: missing or empty repository.url`)
      failed = true
    }
  }
}

if (failed) {
  console.error(
    '\nSome publishable packages are missing repository.url — OIDC provenance publishing will fail with 422.',
  )
  console.error(
    'Add "repository": { "type": "git", "url": "git+https://github.com/systemfsoftware/systemfsoftware.git", "directory": "packages/<name>" } to each.',
  )
  process.exit(1)
}

console.log('All publishable packages have repository.url — OIDC provenance publishing should work.')
