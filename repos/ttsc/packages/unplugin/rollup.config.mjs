import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { builtinModules, createRequire } from "node:module";
import { globSync } from "tinyglobby";
// `@rollup/plugin-typescript` is re-exported from the build-config package so
// its `typescript` peer resolves to the legacy v6 compiler pinned there; native
// TypeScript 7 drops the classic JS API the plugin needs.
import typescript from "../../config/typescript-plugin.mjs";

const manifest = createRequire(import.meta.url)("./package.json");
const inputs = globSync("./src/**/*.ts");

// Externalise Node builtins, the host `ttsc` (supplied by the consuming project,
// never bundled), and every declared dependency so the published package never
// inlines a second copy of a runtime it shares with its consumer. The names come
// straight from package.json instead of `rollup-plugin-node-externals`: that
// plugin's v9 calls the ES2025 `RegExp.escape`, so it needs Node 24 and crashes
// the build on Node 22. Deriving the set here covers the same specifiers with no
// Node-version floor, and folds in the old `rollup-plugin-auto-external` too.
const externalPackages = new Set([
  "ttsc",
  "unplugin",
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
]);
const external = (id) =>
  id.startsWith("node:") ||
  builtinModules.includes(id) ||
  [...externalPackages].some((name) => id === name || id.startsWith(`${name}/`));

const output = (format, extension) => ({
  dir: "./lib",
  entryFileNames: (chunkInfo) => {
    if (chunkInfo.name.includes("node_modules")) {
      throw new Error(`Invalid chunk name: ${chunkInfo.name}`);
    }
    return `[name].${extension}`;
  },
  exports: "named",
  format,
  preserveModules: true,
  preserveModulesRoot: "src",
  sourcemap: true,
});

export default {
  external,
  input: inputs,
  output: [output("cjs", "js"), output("esm", "mjs")],
  plugins: [
    nodeResolve({
      extensions: [".mjs", ".js", ".json", ".ts"],
    }),
    commonjs(),
    typescript({
      compilerOptions: {
        declaration: false,
        declarationMap: false,
        emitDeclarationOnly: false,
        module: "ESNext",
        moduleResolution: "Bundler",
        noEmit: false,
      },
      tsconfig: "tsconfig.json",
    }),
  ],
};
