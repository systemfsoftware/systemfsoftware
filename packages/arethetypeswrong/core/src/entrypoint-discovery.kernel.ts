export const getSubpaths = (exportsObject: unknown): readonly string[] => {
  if (!exportsObject || typeof exportsObject !== 'object' || Array.isArray(exportsObject)) {
    return []
  }
  const keys = Object.keys(exportsObject)
  if (keys[0]?.startsWith('.')) {
    return keys.filter((key) => hasExportTarget((exportsObject as Record<string, unknown>)[key]))
  }
  return keys.flatMap((key) => getSubpaths((exportsObject as Record<string, unknown>)[key]))
}

export const hasExportTarget = (exportsObject: unknown): boolean => {
  if (exportsObject === null || exportsObject === undefined) {
    return false
  }
  if (typeof exportsObject !== 'object') {
    return true
  }
  if (Array.isArray(exportsObject)) {
    return exportsObject.some(hasExportTarget)
  }
  return Object.keys(exportsObject).some((key) => hasExportTarget((exportsObject as Record<string, unknown>)[key]))
}

export const formatEntrypointString = (path: string, packageName: string): string => {
  const normalized = path === '.' || path.startsWith('./')
    ? path
    : path === packageName
    ? '.'
    : path.startsWith(`${packageName}/`)
    ? `.${path.slice(packageName.length)}`
    : `./${path}`
  return normalized.trim()
}
