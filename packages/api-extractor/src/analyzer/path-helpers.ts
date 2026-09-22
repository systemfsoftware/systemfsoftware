export const convertToSlashes = (inputPath: string): string => inputPath.replace(/\\/g, '/')

export const isUnderOrEqual = (childPath: string, parentFolderPath: string): boolean => {
  const c = convertToSlashes(childPath).replace(/\/+$/, '')
  const p = convertToSlashes(parentFolderPath).replace(/\/+$/, '')
  return c === p || c.startsWith(`${p}/`)
}

export const dirname = (p: string): string => {
  const normalized = convertToSlashes(p).replace(/\/+$/, '')
  const slash = normalized.lastIndexOf('/')
  return slash <= 0 ? (slash === 0 ? '/' : '.') : normalized.substring(0, slash)
}

export const resolve = (base: string, relative: string): string => {
  const b = convertToSlashes(base).replace(/\/+$/, '')
  const r = convertToSlashes(relative).replace(/^\.?\//, '')
  return r.startsWith('/') ? r : `${b}/${r}`
}

export const relative = (from: string, to: string): string => {
  const f = convertToSlashes(from).replace(/\/+$/, '')
  const t = convertToSlashes(to).replace(/\/+$/, '')
  if (f === t) {
    return ''
  }
  if (t.startsWith(`${f}/`)) {
    return t.substring(f.length + 1)
  }
  return t
}
