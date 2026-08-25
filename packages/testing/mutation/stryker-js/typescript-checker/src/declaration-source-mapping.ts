const findSourceMapRegex = /\/\/# sourceMappingURL=(.+)$/m

export function getSourceMappingURL(content: string): string | undefined {
  findSourceMapRegex.lastIndex = 0
  return findSourceMapRegex.exec(content)?.[1]
}
