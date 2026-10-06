// repo-slug.ts — the `owner/repo` slug the GitHub Releases step names.
//
// A module, never an entry point. Once the sole consumer, it is now just the
// slug deriver `create-github-releases.ts` needs to address the GitHub API.

import { run } from './run.ts'

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
