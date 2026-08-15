import { type BuildTool, BuildToolSchema } from './analysis.schema.js'

export const allBuildTools: readonly BuildTool[] = BuildToolSchema.literals

const KNOWN_BUILD_TOOLS: Record<string, true> = Object.fromEntries(
  allBuildTools.map((tool) => [tool, true]),
)

export const getBuildTools = (packageJson: {
  devDependencies?: Record<string, string>
}): Partial<Record<BuildTool, string>> => {
  if (!packageJson.devDependencies) {
    return {}
  }
  const result: Partial<Record<BuildTool, string>> = {}
  for (const dep of Object.keys(packageJson.devDependencies)) {
    if (KNOWN_BUILD_TOOLS[dep] === true) {
      result[dep as BuildTool] = packageJson.devDependencies[dep]
    }
  }
  return result
}
