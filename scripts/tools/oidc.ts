// oidc.ts — the facts `publish:unpublished` needs about this repository and
// its packages: the GitHub slug `npm trust github` must name, and every
// non-private workspace package with the manifest it lives in.
//
// A module, never an entry point.

import { run } from './run.ts'
import { rawWorkspacePackages } from './workspace.ts'

export const WORKFLOW_FILE = 'release.yml'

/** `owner/repo` from a git remote URL, or null when the URL names no repository. */
const parseSlug = (raw: string): string | null => {
  const cleaned = raw.trim()
    .replace(/^git\+/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return `${parts[0]}/${parts[1]}`
}

export const expectedSlug = async (): Promise<string> => {
  const env = Deno.env.get('GITHUB_REPOSITORY')
  if (env && env.includes('/')) return env
  const remoteUrl = await run('git', ['remote', 'get-url', 'origin'])
  const slug = parseSlug(remoteUrl)
  if (!slug) throw new Error(`Could not derive repository slug from git remote: ${remoteUrl}`)
  return slug
}

export type WorkspacePackage = {
  name: string
  version: string
  filePath: string
  repositorySlug: string | null
}

export const publicWorkspacePackages = async (): Promise<WorkspacePackage[]> => {
  const members = await rawWorkspacePackages()
  const out: WorkspacePackage[] = []
  for (const member of members) {
    const packageJsonPath = `${member.path}/package.json`
    let repoSlug: string | null = null
    try {
      const manifest = JSON.parse(await Deno.readTextFile(packageJsonPath)) as {
        repository?: string | { url?: string }
      }
      const rawUrl = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
      if (rawUrl) repoSlug = parseSlug(rawUrl)
    } catch {
      repoSlug = null
    }
    out.push({
      name: member.name,
      version: member.version,
      filePath: packageJsonPath,
      repositorySlug: repoSlug,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
