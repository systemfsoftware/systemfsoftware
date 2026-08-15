import { SHARED_PLUGIN_CACHE_DIR } from "../../internal/plugin-cache";
import {
  assert,
  commonJsProject,
  copyDirectory,
  fs,
  goPath,
  path,
  spawn,
  ttscBin,
  workspaceRoot,
} from "../../internal/plugin-corpus";

/**
 * Verifies plugin corpus: a forwarded tsgo flag reaches a native host that
 * never declared `--tsgo-args`.
 *
 * Pins issue #1188. #113 shipped the forwarded-flag payload as a `--tsgo-args`
 * CLI flag, an addition to a plugin protocol third-party hosts had already
 * frozen: a host parsing with `flag.ContinueOnError` answers `flag provided but
 * not defined: -tsgo-args` and exits 2 before its build starts, so every
 * documented forwarded flag failed on any typia/nestia-shaped project. The
 * payload now rides `TTSC_TSGO_ARGS`, which such a host picks up simply by
 * calling `driver.LoadProgram`. The `go-driver-emit-plugin` host is exactly
 * that shape — strict `flag.FlagSet`, no `--tsgo-args`, `driver.LoadProgram`,
 * `EmitWithPluginTransformers` — the same shape typia's `ttsc-typia` has.
 *
 * The assertion is delivery, not survival: the project declares no `sourceMap`,
 * so a `.js.map` can only exist if `--sourceMap` actually reached the sidecar's
 * own compiler options. A zero exit alone would also pass if ttsc had merely
 * dropped the flag.
 *
 * 1. Build a project on the strict `go-driver-emit-plugin` host, with no
 *    `sourceMap` in its tsconfig.
 * 2. Run `ttsc --emit --sourceMap`.
 * 3. Assert zero exit, the transformed JavaScript, and an emitted `.js.map` with
 *    its trailer.
 */
export const test_plugin_corpus_forwarded_tsgo_flag_reaches_a_strict_native_plugin_host =
  () => {
    const root = commonJsProject(
      {
        "plugin.cjs": [
          `const path = require("node:path");`,
          `module.exports = (context) => ({`,
          `  name: "go-driver-emit-plugin",`,
          `  source: path.resolve(context.dirname, "go-plugin"),`,
          `});`,
          ``,
        ].join("\n"),
        "src/main.ts": [
          `export const payload = { value: "before" };`,
          `console.log(payload.value);`,
          ``,
        ].join("\n"),
      },
      {
        compilerOptions: {
          plugins: [{ transform: "./plugin.cjs" }],
        },
      },
    );
    copyDirectory(
      path.join(
        workspaceRoot,
        "tests",
        "projects",
        "go-driver-emit-plugin",
        "go-plugin",
      ),
      path.join(root, "go-plugin"),
    );

    const result = spawn(ttscBin, ["--cwd", root, "--emit", "--sourceMap"], {
      cwd: root,
      env: { PATH: goPath(), TTSC_CACHE_DIR: SHARED_PLUGIN_CACHE_DIR },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /flag provided but not defined/,
    );

    const js = fs.readFileSync(path.join(root, "dist", "main.js"), "utf8");
    assert.match(js, /GO DRIVER EMIT PLUGIN/);
    assert.match(js, /\/\/# sourceMappingURL=main\.js\.map/);
    assert.ok(
      fs.existsSync(path.join(root, "dist", "main.js.map")),
      "forwarded --sourceMap did not reach the native host's compiler options",
    );
  };
