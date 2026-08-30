export async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await Deno.stat(path)
    return s.isDirectory
  } catch {
    return false
  }
}

export async function isFile(path: string): Promise<boolean> {
  try {
    const s = await Deno.stat(path)
    return s.isFile
  } catch {
    return false
  }
}

export async function isSymlink(path: string): Promise<boolean> {
  try {
    const s = await Deno.lstat(path)
    return s.isSymlink
  } catch {
    return false
  }
}
