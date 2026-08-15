import { TestProject } from "@ttsc/testing";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MOCHA_BIN,
  TTSX_REGISTER,
  linkTtscPackage,
} from "../../internal/ttsx-register";

/**
 * Verifies ttsx register runs multiple out-of-include Mocha roots.
 *
 * Mocha is a JavaScript host that loads every TypeScript test after the public
 * preload runs. Each excluded test therefore needs its own checked entry emit,
 * and those emits must coexist until Mocha has loaded the complete suite.
 *
 * 1. Create two strict projects whose `include` covers only `src`, not tests.
 * 2. Run real Mocha with three `.ts` tests and `--require ttsc/register`.
 * 3. Assert all pass, same-project emits coexist, and exit cleans both caches.
 */
export const test_ttsx_register_runs_multiple_out_of_include_mocha_roots =
  () => {
    const root = TestProject.createProject({
      "package.json": JSON.stringify({
        name: "ttsx-register-mocha",
        type: "commonjs",
        version: "1.0.0",
      }),
      "one/tsconfig.json": projectConfig(),
      "one/src/value.ts": `export enum Value { One = "one" }\n`,
      "one/test/first/index.ts": mochaTest("first", "one"),
      "one/test/second/index.ts": mochaTest("second", "one"),
      "two/tsconfig.json": projectConfig(),
      "two/src/value.ts": `export enum Value { Two = "two" }\n`,
      "two/test/third/index.ts": mochaTest("third", "two", true),
    });
    linkTtscPackage(root);

    const result = TestProject.spawn(
      process.execPath,
      [
        MOCHA_BIN,
        "--require",
        TTSX_REGISTER,
        "--extension",
        "ts",
        "one/test/first/index.ts",
        "one/test/second/index.ts",
        "two/test/third/index.ts",
      ],
      { cwd: root },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /3 passing/);
    for (const suite of ["first", "second", "third"]) {
      assert.match(result.stdout, new RegExp(`\\b${suite}\\b`));
    }
    for (const project of ["one", "two"]) {
      const runtimeRoot = path.join(
        root,
        project,
        "node_modules",
        ".cache",
        "ttsc",
        "ttsx",
        "project",
      );
      assert.deepEqual(
        fs.existsSync(runtimeRoot) ? fs.readdirSync(runtimeRoot) : [],
        [],
      );
    }
  };

function projectConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      module: "commonjs",
      outDir: "dist",
      rootDir: "src",
      strict: true,
      target: "ES2022",
    },
    include: ["src"],
  });
}

function mochaTest(
  suite: string,
  expected: string,
  assertCoexistence: boolean = false,
): string {
  const coexistence = !assertCoexistence
    ? ""
    : [
        `    const fs = require("node:fs");`,
        `    const path = require("node:path");`,
        `    const cache = (project: string) => path.join(process.cwd(), project, "node_modules", ".cache", "ttsc", "ttsx", "project");`,
        `    if (fs.readdirSync(cache("one")).length !== 2) throw new Error("expected two coexisting roots in project one");`,
        `    if (fs.readdirSync(cache("two")).length !== 1) throw new Error("expected one independent root in project two");`,
      ].join("\n");
  return [
    `declare function describe(name: string, body: () => void): void;`,
    `declare function it(name: string, body: () => void): void;`,
    `declare function require(name: string): any;`,
    `declare const process: { cwd(): string };`,
    `enum Expected { Value = ${JSON.stringify(expected)} }`,
    `describe(${JSON.stringify(suite)}, () => {`,
    `  it("uses the checked emit", () => {`,
    `    if (Expected.Value !== ${JSON.stringify(expected)}) throw new Error("wrong value");`,
    coexistence,
    `  });`,
    `});`,
    "",
  ].join("\n");
}
