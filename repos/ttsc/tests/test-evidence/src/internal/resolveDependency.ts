import path from "node:path";

/**
 * Resolves a dependency's package root, not its entry point.
 *
 * Walks up from the `package.json` rather than trusting a main entry: `ttsc`
 * resolves to a launcher, and what is needed here is the package root.
 */
export const resolveDependency = (specifier: string): string => {
  const manifest: string = require.resolve(`${specifier}/package.json`);
  return path.dirname(manifest);
};
