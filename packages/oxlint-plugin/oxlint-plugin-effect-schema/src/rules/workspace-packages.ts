import { findWorkspaceProjectsNoCheckSync } from '@pnpm/workspace.projects-reader'
import { findWorkspaceDirSync } from '@pnpm/workspace.root-finder'
import { readWorkspaceManifestSync } from '@pnpm/workspace.workspace-manifest-reader'

const PNPM_PATTERNS_WITHOUT_PACKAGES_FIELD = ['.']

export const packageNameOf = (source: string): string | null => {
  if (source === '' || source.startsWith('.') || source.startsWith('/') || source.startsWith('#')) return null
  if (source.includes(':')) return null
  const [first = '', second] = source.split('/')
  if (!first.startsWith('@')) return first
  return second === undefined || second === '' ? null : `${first}/${second}`
}

const projectNamesByWorkspaceDir = new Map<string, ReadonlySet<string>>()

const projectNamesOf = (workspaceDir: string): ReadonlySet<string> => {
  const cached = projectNamesByWorkspaceDir.get(workspaceDir)
  if (cached !== undefined) return cached
  const patterns = readWorkspaceManifestSync(workspaceDir)?.packages ?? PNPM_PATTERNS_WITHOUT_PACKAGES_FIELD
  const names = new Set<string>()
  for (const { manifest } of findWorkspaceProjectsNoCheckSync(workspaceDir, { patterns })) {
    if (manifest.name !== undefined) names.add(manifest.name)
  }
  projectNamesByWorkspaceDir.set(workspaceDir, names)
  return names
}

const directoryOf = (filename: string): string => {
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'))
  if (slash === -1) return '.'
  return slash === 0 ? '/' : filename.slice(0, slash)
}

export const isPackageOfEnclosingWorkspace = (source: string, filename: string): boolean => {
  const name = packageNameOf(source)
  if (name === null) return false
  const workspaceDir = findWorkspaceDirSync(directoryOf(filename))
  return workspaceDir !== undefined && projectNamesOf(workspaceDir).has(name)
}
