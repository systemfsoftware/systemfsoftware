import { TestProject } from "@ttsc/testing";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { TestMetroRuntime } from "./metro-runtime";

/**
 * Asserts that `@ttsc/unplugin` stays external in the built Metro output and
 * that the rollup build no longer depends on `rollup-plugin-node-externals` /
 * `rollup-plugin-auto-external`.
 *
 * The externals plugin's v9 calls the ES2025 `RegExp.escape`, so it requires
 * Node 24 and crashes the rollup build on Node 22; the config now derives its
 * external set from package.json instead. Pinning the external `@ttsc/unplugin`
 * import, the absence of those plugin imports, and the absence of
 * virtual-module shims keeps the Metro build working on Node 22 and blocks the
 * plugin's return.
 */
export function assertMetroBuildKeepsRuntimeDependenciesExternal(): void {
  const cjs = readLib("transformer", "js");
  const esm = readLib("transformer", "mjs");

  assert.match(cjs, /require\('@ttsc\/unplugin\/api'\)/);
  assert.match(esm, /from '@ttsc\/unplugin\/api'/);

  const rollupConfig = fs.readFileSync(
    path.resolve(
      TestProject.WORKSPACE_ROOT,
      "packages/metro/rollup.config.mjs",
    ),
    "utf8",
  );
  for (const removedPlugin of [
    "rollup-plugin-node-externals",
    "rollup-plugin-auto-external",
  ]) {
    // Match the import statement, not a bare mention: the config comment names
    // these plugins to explain why externals come from package.json instead.
    assert.doesNotMatch(
      rollupConfig,
      new RegExp(`from ["']${escapeRegExp(removedPlugin)}["']`),
      removedPlugin,
    );
  }

  for (const output of [cjs, esm]) {
    assert.doesNotMatch(output, /_virtual/);
  }
}

function readLib(entry: string, extension: "js" | "mjs"): string {
  const file = TestMetroRuntime.libPath(entry, extension);
  assert.equal(fs.existsSync(file), true, file);
  return fs.readFileSync(file, "utf8");
}

/** Escapes all regex meta-characters in `value` for use in `new RegExp(...)`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
