const ROOT_MANIFEST = 'package.json'

const ancestorManifestsOf = (manifestPath: string): string[] => {
  const dirs = manifestPath.split('/').slice(0, -1)
  return dirs.slice(0, -1).map((_, depth) => `${dirs.slice(0, depth + 1).join('/')}/${ROOT_MANIFEST}`)
}

export const workspaceMembers = (manifestPaths: readonly string[]): string[] => {
  const tracked = new Set(manifestPaths)
  return manifestPaths.filter((path) =>
    path !== ROOT_MANIFEST && !ancestorManifestsOf(path).some((ancestor) => tracked.has(ancestor))
  )
}
