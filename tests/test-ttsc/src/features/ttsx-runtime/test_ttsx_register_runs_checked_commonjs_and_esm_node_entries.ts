import { TestProject } from "@ttsc/testing";
import assert from "node:assert/strict";

import { TTSX_REGISTER, linkTtscPackage } from "../../internal/ttsx-register";

/**
 * Verifies ttsx register runs checked CommonJS and ESM Node entries.
 *
 * The public preload has to own Node's main-module boundary in both module
 * systems. The enum in each source also proves the compiler's emitted
 * JavaScript ran instead of Node's erasable-syntax TypeScript stripping.
 *
 * 1. Create equivalent CommonJS and ESM consumer projects.
 * 2. Run each with `node --require ttsc/register` and its `.ts` main file.
 * 3. Assert both checked emits execute and print their module-specific result.
 */
export const test_ttsx_register_runs_checked_commonjs_and_esm_node_entries =
  () => {
    for (const fixture of [
      { module: "commonjs", name: "commonjs", packageType: "commonjs" },
      { module: "nodenext", name: "esm", packageType: "module" },
    ]) {
      const root = TestProject.createProject({
        "package.json": JSON.stringify({
          name: `ttsx-register-${fixture.name}`,
          type: fixture.packageType,
          version: "1.0.0",
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            module: fixture.module,
            outDir: "dist",
            rootDir: "src",
            strict: true,
            target: "ES2022",
          },
          include: ["src"],
        }),
        "src/main.ts": [
          `enum RuntimeKind { Value = ${JSON.stringify(fixture.name)} }`,
          `const value: string = RuntimeKind.Value;`,
          `console.log(value);`,
          "",
        ].join("\n"),
      });
      linkTtscPackage(root);

      const result = TestProject.spawn(
        process.execPath,
        ["--require", TTSX_REGISTER, "src/main.ts"],
        { cwd: root },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), fixture.name);
    }
  };
