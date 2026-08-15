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
 * Verifies plugin corpus: an `incremental` project gets its `tsBuildInfoFile`
 * even when a native plugin owns the emit.
 *
 * The other half of issue #1188. tsgo writes build information from
 * `performIncrementalCompilation`, a branch inside its CLI that a host building
 * its Program through `driver.LoadProgram` never reaches, so `incremental` and
 * `tsBuildInfoFile` parsed cleanly and were then discarded: the build emitted
 * JavaScript, exited 0, and produced no `.tsbuildinfo` at all. The reporter's
 * CI keyed its compiled-output cache on that file and recompiled every run.
 *
 * The host here is `go-driver-emit-plugin`, which emits through
 * `EmitWithPluginTransformers` — the hand-assembled lane typia uses, and the
 * one that needs its own build-information pass because its JavaScript never
 * goes through tsgo's emitter.
 *
 * 1. Build a project on that host with `incremental` and a `tsBuildInfoFile`
 *    outside `outDir`.
 * 2. Run `ttsc --emit`.
 * 3. Assert the transformed JavaScript and a versioned build-information document
 *    at exactly the configured path.
 */
export const test_plugin_corpus_incremental_project_writes_build_info_on_the_plugin_lane =
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
          incremental: true,
          plugins: [{ transform: "./plugin.cjs" }],
          // Deliberately outside `outDir`: that is tsgo's own default
          // neighbourhood for the file, and the placement
          // `driver/emit_containment.go` exempts from the outDir guard.
          tsBuildInfoFile: "./.cache/app.tsbuildinfo",
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

    const result = spawn(ttscBin, ["--cwd", root, "--emit"], {
      cwd: root,
      env: { PATH: goPath(), TTSC_CACHE_DIR: SHARED_PLUGIN_CACHE_DIR },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const js = fs.readFileSync(path.join(root, "dist", "main.js"), "utf8");
    assert.match(js, /GO DRIVER EMIT PLUGIN/);

    const buildInfoPath = path.join(root, ".cache", "app.tsbuildinfo");
    assert.ok(
      fs.existsSync(buildInfoPath),
      "tsBuildInfoFile was not written by the native plugin emit lane",
    );
    // A file a consumer can read back, not merely a file that exists: tsgo
    // rejects build information whose recorded compiler version it cannot
    // match, so the version field is what makes the artifact usable.
    const buildInfo = JSON.parse(
      fs.readFileSync(buildInfoPath, "utf8"),
    ) as Record<string, unknown>;
    assert.equal(typeof buildInfo.version, "string");
  };
