import fs from "node:fs";
import path from "node:path";

/**
 * Derives the accessor addresses the generated SDK publishes, from the SDK.
 *
 * Nestia writes an `@accessor` tag naming the exact dotted path a consumer
 * calls into every generated operation module, so the surface an evidence
 * `package` reference must enumerate is stated by the generator rather than by
 * this suite. Deriving it means a controller added to the template changes the
 * expectation automatically, and a generator that emits nothing makes the
 * derivation empty — which every caller here treats as a failure, because an
 * empty expectation would assert nothing.
 *
 * The leading `api.` segment is the package's default export alias and is not
 * part of the address the reference publishes: the entry re-exports the
 * generated barrel as `export * as functional`, so `functional.health.get` is
 * what resolves from the entry.
 *
 * @param functionalDirectory Absolute path of `packages/api/src/functional`.
 * @returns Every published accessor address, sorted and deduplicated.
 */
export const sdkAccessorAddresses = (functionalDirectory: string): string[] => {
  const found = new Set<string>();
  for (const file of walk(functionalDirectory))
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const matched: RegExpExecArray | null =
        /^\s*\*\s*@accessor\s+api\.(\S+)\s*$/.exec(line);
      if (matched?.[1] !== undefined) found.add(matched[1]);
    }
  if (found.size === 0)
    throw new Error(
      `${functionalDirectory} publishes no @accessor tag; the SDK was never generated, so no expectation can be derived from it.`,
    );
  return [...found].sort((left, right) => left.localeCompare(right));
};

const walk = (directory: string): string[] => {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location: string = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(location));
    else if (entry.isFile() && entry.name.endsWith(".ts")) found.push(location);
  }
  return found;
};
