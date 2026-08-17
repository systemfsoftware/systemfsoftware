import { type BuildTool, BuildToolSchema } from './analysis.schema.js'

export const allBuildTools: readonly BuildTool[] = [...BuildToolSchema.literals]

export const getBuildTools = (packageJson: {
  devDependencies?: Record<string, string>
}): Partial<Record<BuildTool, string>> => {
  if (!packageJson.devDependencies) {
    return {}
  }
  const result: Partial<Record<BuildTool, string>> = {}
  for (const dep of Object.keys(packageJson.devDependencies)) {
    const tool = allBuildTools.find((candidate) => candidate === dep)
    if (tool === undefined) continue
    result[tool] = packageJson.devDependencies[dep]
  }
  return result
}
