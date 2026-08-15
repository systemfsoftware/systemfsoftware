import { TestProject } from "@ttsc/testing";
import childProcess from "node:child_process";

import {
  COMMONJS_PLUGIN_DESCRIPTOR_SHIM_SOURCE,
  assert,
  fs,
  path,
} from "../../internal/project";

/** A same-content link retarget during evaluation must drop cache proof. */
export const test_commonjs_plugin_descriptor_retarget_omits_stale_identity_proof =
  (): void => {
    const root = TestProject.tmpdir("ttsc-descriptor-link-retarget-");
    const oldTarget = path.join(root, "old");
    const newTarget = path.join(root, "new");
    const link = path.join(root, "selection-link");
    const descriptor = path.join(root, "plugin.cjs");
    const output = path.join(root, "descriptor.json");
    fs.mkdirSync(oldTarget);
    fs.mkdirSync(newTarget);
    const selectionSource = 'module.exports = require("./value.cjs");\n';
    fs.writeFileSync(
      path.join(oldTarget, "selection.cjs"),
      selectionSource,
      "utf8",
    );
    fs.writeFileSync(
      path.join(newTarget, "selection.cjs"),
      selectionSource,
      "utf8",
    );
    fs.writeFileSync(
      path.join(oldTarget, "value.cjs"),
      'module.exports = { name: "old", source: "old" };\n',
      "utf8",
    );
    fs.writeFileSync(
      path.join(newTarget, "value.cjs"),
      'module.exports = { name: "new", source: "new" };\n',
      "utf8",
    );
    fs.symlinkSync(
      oldTarget,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    const linkedSelection = path.join(link, "selection.cjs");
    fs.writeFileSync(
      descriptor,
      [
        'const fs = require("node:fs");',
        `const selected = require(${JSON.stringify(linkedSelection)});`,
        "module.exports = () => {",
        `  fs.rmSync(${JSON.stringify(link)}, { force: true, recursive: true });`,
        `  fs.symlinkSync(${JSON.stringify(newTarget)}, ${JSON.stringify(link)}, ${JSON.stringify(process.platform === "win32" ? "junction" : "dir")});`,
        "  return selected;",
        "};",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = childProcess.spawnSync(
      process.execPath,
      ["-e", COMMONJS_PLUGIN_DESCRIPTOR_SHIM_SOURCE],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TTSC_PLUGIN_CONTEXT: JSON.stringify({}),
          TTSC_PLUGIN_DESCRIPTOR_OUT: output,
          TTSC_PLUGIN_ENTRY: descriptor,
        },
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(fs.readFileSync(output, "utf8")) as {
      descriptor: { name: string };
      inputHashes: Record<string, string | null>;
      inputRealpaths: Record<string, string | null>;
      inputs: string[];
    };
    assert.equal(payload.descriptor.name, "old");
    assert.ok(payload.inputs.includes(linkedSelection));
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        payload.inputHashes,
        linkedSelection,
      ),
      false,
      "the retargeted alias must remain watched without certifying old output",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        payload.inputRealpaths,
        linkedSelection,
      ),
      false,
    );
  };
