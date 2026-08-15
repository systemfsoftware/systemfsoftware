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
 * Verifies plugin corpus: a project that did not ask for build information does
 * not get any from the native plugin emit lane.
 *
 * The negative twin of
 * `test_plugin_corpus_incremental_project_writes_build_info_on_the_plugin_lane`.
 * `tsBuildInfoFile` names where build information would go; only `incremental`
 * or `composite` asks for it to be produced, which is the pair
 * `CompilerOptions.IsIncremental` tests. A predicate that keyed on the path
 * option instead — or one that simply routed every emit through tsgo's
 * incremental lane — would keep the positive case green while silently growing
 * a `.tsbuildinfo` in every ordinary plugin project, and paying for a snapshot
 * nothing reads on every build.
 *
 * 1. Build the same project on the same host, with `tsBuildInfoFile` declared and
 *    `incremental` absent.
 * 2. Run `ttsc --emit`.
 * 3. Assert the transformed JavaScript is emitted and no build information is.
 */
export const test_plugin_corpus_non_incremental_project_writes_no_build_info_on_the_plugin_lane =
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
    assert.equal(
      fs.existsSync(path.join(root, ".cache", "app.tsbuildinfo")),
      false,
      "build information was written for a project that never asked for it",
    );
  };
