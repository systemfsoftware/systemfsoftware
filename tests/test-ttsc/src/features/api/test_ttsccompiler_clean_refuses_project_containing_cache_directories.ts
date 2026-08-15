import { resolveSafeCacheCleanupTargets } from "../../../../../packages/ttsc/lib/internal/resolveSafeCacheCleanupTargets.js";
import {
  TtscCompiler,
  assert,
  fs,
  os,
  path,
  writeBasicProject,
} from "../../internal/compiler";

/**
 * Verifies TtscCompiler.clean validates every cache cleanup target before
 * mutating the filesystem.
 *
 * A mistaken `cacheDir: "."`, external `TTSC_GO_CACHE_DIR`, project ancestor,
 * physical alias, or filesystem root must be rejected with every sentinel
 * intact. A real regression is contained to a test-owned temporary parent; the
 * alias and filesystem-root cases call the pure guard only.
 *
 * 1. Reject explicit project and ancestor cache roots without removing data.
 * 2. Reject a physical alias and an environment-selected project ancestor.
 * 3. Reject a filesystem root and assert every earlier sentinel still exists.
 */
export const test_ttsccompiler_clean_refuses_project_containing_cache_directories =
  () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "ttsc-clean-safety-"));
    const project = path.join(parent, "project");
    const projectSentinel = path.join(project, "src", "main.ts");
    const siblingSentinel = path.join(parent, "keep.txt");
    const pluginSentinel = path.join(
      project,
      "node_modules",
      ".cache",
      "ttsc",
      "plugins",
      "keep.txt",
    );
    const aliasRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "ttsc-clean-safety-alias-"),
    );
    try {
      writeBasicProject(project, 'export const keep = "project";\n');
      fs.writeFileSync(siblingSentinel, "sibling", "utf8");
      fs.mkdirSync(path.dirname(pluginSentinel), { recursive: true });
      fs.writeFileSync(pluginSentinel, "plugin", "utf8");

      for (const cacheDir of [project, parent]) {
        const compiler = new TtscCompiler({ cacheDir, cwd: project });
        assert.throws(
          () => compiler.clean(),
          /refusing to clean cache directory.*equals or contains project root/,
        );
        assert.equal(fs.readFileSync(projectSentinel, "utf8").length > 0, true);
        assert.equal(fs.readFileSync(siblingSentinel, "utf8"), "sibling");
      }

      const alias = path.join(aliasRoot, "parent");
      fs.symlinkSync(parent, alias, "junction");
      assert.throws(
        () =>
          resolveSafeCacheCleanupTargets(project, [
            path.join(alias, "project"),
          ]),
        /refusing to clean cache directory.*equals or contains project root/,
      );

      assert.throws(
        () =>
          new TtscCompiler({
            cwd: project,
            env: {
              TTSC_CACHE_DIR: path.join(
                project,
                "node_modules",
                ".cache",
                "ttsc",
              ),
              TTSC_GO_CACHE_DIR: parent,
            },
          }).clean(),
        /refusing to clean cache directory.*equals or contains project root/,
      );
      assert.equal(fs.readFileSync(pluginSentinel, "utf8"), "plugin");
      assert.equal(fs.readFileSync(projectSentinel, "utf8").length > 0, true);
      assert.equal(fs.readFileSync(siblingSentinel, "utf8"), "sibling");

      assert.throws(
        () =>
          resolveSafeCacheCleanupTargets(project, [
            path.parse(path.resolve(project)).root,
          ]),
        /filesystem roots are never valid cache directories/,
      );
      assert.equal(fs.existsSync(projectSentinel), true);
      assert.equal(fs.existsSync(siblingSentinel), true);
    } finally {
      fs.rmSync(aliasRoot, { force: true, recursive: true });
      fs.rmSync(parent, { force: true, recursive: true });
    }
  };
