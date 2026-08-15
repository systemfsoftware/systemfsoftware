import fs from "node:fs";
import path from "node:path";

import { readClaimNames } from "./activationGates";

/** One lint configuration that declares evidence claims, and the gate for it. */
export interface IClaimConfiguration {
  /** Absolute path of the `lint.config.ts` declaring the claims. */
  readonly file: string;

  /** Absolute path of the package directory whose scripts gate it. */
  readonly packageDirectory: string;

  /**
   * The package script that compiles the Program this configuration governs.
   *
   * A claim populates only from the Program that owns its hosts, so proving a
   * claim means running the gate that builds that Program and no other. A
   * configuration beside a package's `tsconfig.json` is proved by the package's
   * own `lint`; one inside `test/` governs the nested test Program, which
   * `build:test` is what compiles.
   */
  readonly script: string;

  /** Claim names this configuration declares, in file order. */
  readonly claims: readonly string[];
}

/**
 * Finds every lint configuration in a prepared workspace that declares claims.
 *
 * Discovering them beats naming them. Which package owns which claim is a
 * template decision that moves — the backend graph has already been split
 * across two Programs, and the DTO claims belong wherever the `tsconfig` that
 * includes `src/structures/` lives. A case that named its configuration files
 * would keep passing after such a move while quietly covering fewer claims than
 * it did before, which is the same silent shrinkage this suite exists to
 * catch.
 *
 * @param workspace Absolute path of the prepared workspace.
 */
export const discoverClaimConfigurations = (
  workspace: string,
): IClaimConfiguration[] => {
  const packages: string = path.join(workspace, "packages");
  const found: IClaimConfiguration[] = [];
  for (const entry of fs.readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory: string = path.join(packages, entry.name);
    for (const [relative, script] of [
      ["lint.config.ts", "lint"],
      [path.join("test", "lint.config.ts"), "build:test"],
    ] as const) {
      const file: string = path.join(directory, relative);
      if (!fs.existsSync(file)) continue;
      const claims: string[] = readClaimNames(file);
      if (claims.length === 0) continue;
      found.push({ file, packageDirectory: directory, script, claims });
    }
  }
  return found.sort((left, right) => left.file.localeCompare(right.file));
};
