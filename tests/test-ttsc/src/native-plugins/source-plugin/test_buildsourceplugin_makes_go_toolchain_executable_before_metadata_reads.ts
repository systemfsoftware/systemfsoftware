import { TestProject } from "@ttsc/testing";

import {
  assert,
  buildSourcePlugin,
  createFakeGoBinary,
  ensureExecutableGoToolchain,
  fs,
  os,
  path,
} from "../../internal/source-build";

/**
 * Verifies buildSourcePlugin makes the Go toolchain executable before reading
 * go.mod metadata.
 *
 * Npm package extraction can leave bundled Go files without the executable bit
 * set. The source-plugin builder reads `go.mod` metadata via `go mod edit
 * -json` before running `go build`, so the permission fix must happen before
 * any Go command is spawned, not only before the final compile step.
 *
 * 1. Create a plugin source tree with the required standard subdirectories.
 * 2. Write a fake `go` executable with unsafe writable permissions (mode 0o666).
 * 3. Prove a bundled tool is normalized to 0o755, then call `buildSourcePlugin`
 *    and assert only the required owner execute bit is added to the explicitly
 *    selected toolchain.
 * 4. Give the external tool a restrictive executable mode and assert a cache hit
 *    does not widen the user's permissions.
 */
export const test_buildsourceplugin_makes_go_toolchain_executable_before_metadata_reads =
  () => {
    if (process.platform === "win32") {
      return;
    }

    const root = TestProject.tmpdir("ttsc-go-mode-");
    const plugin = path.join(root, "plugin");
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(
      path.join(plugin, "go.mod"),
      "module example.com/plugin\n\ngo 1.26\n",
      "utf8",
    );
    fs.writeFileSync(path.join(plugin, "main.go"), "package main\n", "utf8");
    for (const file of [
      "vendor/local/value.go",
      "lib/helper.go",
      "dist/generated.go",
      "build/generated.go",
    ]) {
      fs.mkdirSync(path.dirname(path.join(plugin, file)), { recursive: true });
      fs.writeFileSync(path.join(plugin, file), "package main\n", "utf8");
    }

    const fakeGo = createFakeGoBinary(root, { executable: false });
    fs.chmodSync(fakeGo, 0o666);
    ensureExecutableGoToolchain(fakeGo, true);
    assert.equal(fs.statSync(fakeGo).mode & 0o7777, 0o755);
    fs.chmodSync(fakeGo, 0o666);
    const previousGo = process.env.TTSC_GO_BINARY;
    process.env.TTSC_GO_BINARY = fakeGo;
    try {
      const binary = buildSourcePlugin({
        baseDir: root,
        cacheDir: path.join(root, "cache"),
        overlayDirs: [],
        pluginName: "go-mode",
        source: plugin,
        quiet: true,
        ttscVersion: "1.0.0",
        tsgoVersion: "7.0.0-dev",
      });
      assert.equal(fs.existsSync(binary), true);
      assert.equal(fs.statSync(fakeGo).mode & 0o7777, 0o766);
      fs.chmodSync(fakeGo, 0o700);
      buildSourcePlugin({
        baseDir: root,
        cacheDir: path.join(root, "cache"),
        overlayDirs: [],
        pluginName: "go-mode",
        source: plugin,
        quiet: true,
        ttscVersion: "1.0.0",
        tsgoVersion: "7.0.0-dev",
      });
      assert.equal(fs.statSync(fakeGo).mode & 0o7777, 0o700);
    } finally {
      if (previousGo === undefined) delete process.env.TTSC_GO_BINARY;
      else process.env.TTSC_GO_BINARY = previousGo;
    }
  };
