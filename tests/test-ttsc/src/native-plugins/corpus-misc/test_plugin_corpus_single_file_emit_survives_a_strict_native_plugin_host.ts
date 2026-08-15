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
 * Verifies plugin corpus: single-file emit works on a native host that never
 * declared `--tsgo-args`.
 *
 * The widest instance of issue #1188, and the one that needs no flag from the
 * user at all. `runSingleFileEmit` compiles into a private temp directory and
 * asks tsgo to keep every side product there, so `isolatedTsgoOutputArgs`
 * always contributes `--outFile null --declarationDir null --tsBuildInfoFile
 * null --outDir <tmp>` to the forwarded payload. While that payload travelled
 * as a `--tsgo-args` CLI flag, plain `ttsc <file.ts>` therefore exited 2 on
 * every project carrying a typia/nestia-shaped transform host — ttsc's own
 * containment flags crashed the sidecar. Keeping this case separate from the
 * user-forwarded one matters because only this one proves the launcher's own
 * injected payload is delivered safely.
 *
 * 1. Build a project on the strict `go-driver-emit-plugin` host.
 * 2. Run `ttsc src/main.ts` with no flag of any kind.
 * 3. Assert zero exit, the resolved output path on stdout, and the transformed
 *    JavaScript in that file.
 */
export const test_plugin_corpus_single_file_emit_survives_a_strict_native_plugin_host =
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

    const result = spawn(
      ttscBin,
      ["--cwd", root, path.join("src", "main.ts")],
      {
        cwd: root,
        env: { PATH: goPath(), TTSC_CACHE_DIR: SHARED_PLUGIN_CACHE_DIR },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /flag provided but not defined/,
    );
    // The emit lane reports the file it resolved; the transform proves the
    // sidecar actually ran rather than the launcher falling back to plain tsgo.
    assert.match(result.stdout.replace(/\\/g, "/"), /dist\/main\.js/);
    const js = fs.readFileSync(path.join(root, "dist", "main.js"), "utf8");
    assert.match(js, /GO DRIVER EMIT PLUGIN/);
  };
