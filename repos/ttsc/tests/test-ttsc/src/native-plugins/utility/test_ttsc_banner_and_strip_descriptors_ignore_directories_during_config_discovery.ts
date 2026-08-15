import { TestProject } from "@ttsc/testing";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Verifies banner and strip report the same discovery candidates their native
 * config loaders inspect.
 *
 * A directory named like a config is not a native config candidate. The
 * descriptor-side input walk must therefore continue to the selected ancestor
 * file so a persistent bundler generation observes edits to it.
 *
 * 1. Plant a candidate-named directory in a nested project and a real config in
 *    its workspace ancestor.
 * 2. Invoke both package descriptors with that project as the discovery root.
 * 3. Assert each host-input list crosses the directory and stops at the real
 *    selected ancestor.
 */
export const test_ttsc_banner_and_strip_descriptors_ignore_directories_during_config_discovery =
  () => {
    const workspace = TestProject.tmpdir("ttsc-utility-host-inputs-");
    const project = path.join(workspace, "packages", "app");
    fs.mkdirSync(project, { recursive: true });

    for (const plugin of ["banner", "strip"] as const) {
      const localCandidate = path.join(project, `${plugin}.config.ts`);
      fs.mkdirSync(localCandidate);
      const selected = path.join(workspace, `${plugin}.config.json`);
      fs.writeFileSync(selected, "{}\n", "utf8");

      const mod = TestProject.REQUIRE_FROM_TEST(
        path.join(TestProject.WORKSPACE_ROOT, "packages", plugin),
      );
      const factory = mod.createTtscPlugin ?? mod.default ?? mod;
      const filename = TestProject.REQUIRE_FROM_TEST.resolve(
        path.join(TestProject.WORKSPACE_ROOT, "packages", plugin),
      );
      const descriptor = factory({
        binary: "",
        cwd: project,
        dirname: path.dirname(filename),
        filename,
        plugin: { transform: `@ttsc/${plugin}` },
        pluginConfigDir: project,
        projectRoot: project,
        tsconfig: path.join(project, "tsconfig.json"),
      });

      assert.ok(descriptor.hostInputs.includes(localCandidate));
      assert.match(
        descriptor.hostInputHashes[localCandidate],
        /^[0-9a-f]{64}$/,
      );
      assert.ok(descriptor.hostInputs.includes(selected));
      assert.equal(
        descriptor.hostInputs.includes(
          path.join(path.dirname(workspace), `${plugin}.config.json`),
        ),
        false,
      );
    }
  };
