import {
  TtscCompiler,
  assert,
  createProject,
  tsgo,
} from "../../internal/compiler";

/**
 * Verifies TtscCompiler.transform preserves empty graph entries for independent
 * root files.
 *
 * TypeScript-Go publishes a leaf as `edges[file] = []` so the source remains in
 * the graph's node universe and its compiler-time proof can be validated.
 * Dropping that key at the JavaScript boundary makes an import-free root
 * invisible to persistent cache validation.
 *
 * 1. Create a project with two root files that do not reference each other.
 * 2. Transform it through the real TypeScript-Go compiler.
 * 3. Assert both sources retain exact empty adjacency entries.
 */
export const test_ttsccompiler_transform_preserves_independent_graph_leaf_entries =
  () => {
    const root = createProject({
      files: {
        "src/isolated.ts": "export const isolated: number = 2;\n",
      },
      source: "export const main: number = 1;\n",
    });
    const compiler = new TtscCompiler({
      binary: tsgo,
      cwd: root,
      plugins: false,
    });

    const result = compiler.transform();

    assert.equal(result.type, "success");
    assert.deepEqual(result.graph?.edges["src/main.ts"], []);
    assert.deepEqual(result.graph?.edges["src/isolated.ts"], []);
  };
