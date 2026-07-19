import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(repoRoot, 'packages')

const bumped = []

function discover(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const packagePath = join(dir, entry.name)
    const manifestPath = join(packagePath, 'package.json')

    const manifestExists = (() => {
      try {
        return readdirSync(packagePath).includes('package.json')
      } catch {
        return false
      }
    })()

    if (!manifestExists) {
      discover(packagePath)
      continue
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.private === true) continue
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      throw new Error(
        `Publishable package at ${relative(packagesRoot, packagePath)} is missing a valid "name" field`,
      )
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
      throw new Error(
        `Package at ${relative(packagesRoot, packagePath)} has no valid "version" field`,
      )
    }
    const parts = manifest.version.split('.')
    if (parts.length < 3 || parts.some((p) => isNaN(Number(p)))) {
      throw new Error(
        `Package ${manifest.name} has non-semver version "${manifest.version}"`,
      )
    }
    const [major, minor] = parts.map(Number)
    const next = `${major}.${minor + 1}.0`
    const old = manifest.version
    manifest.version = next
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

    bumped.push({ name: manifest.name, old, next })
  }
}

discover(packagesRoot)

if (bumped.length === 0) {
  console.log('Nothing to bump — all packages are private or already at the target version.')
  process.exit(0)
}

const maxNameLen = Math.max(...bumped.map((p) => p.name.length))
for (const { name, old, next } of bumped) {
  console.log(`${name.padEnd(maxNameLen + 2)} ${old} → ${next}`)
}

// Regenerate lockfile to reflect version changes
execSync('pnpm install', { cwd: repoRoot, stdio: 'pipe' })
console.log(`\nBumped ${bumped.length} package(s). Lockfile updated.`)
