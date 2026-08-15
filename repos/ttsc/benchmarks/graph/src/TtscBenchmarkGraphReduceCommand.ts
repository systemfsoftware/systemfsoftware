import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { TtscBenchmarkCommandLine } from "./TtscBenchmarkCommandLine.ts";
import { TtscBenchmarkConstant } from "./TtscBenchmarkConstant.ts";
import { TtscBenchmarkGraphReduce } from "./TtscBenchmarkGraphReduce.ts";
import { TtscBenchmarkNumber } from "./TtscBenchmarkNumber.ts";
import { TtscBenchmarkObject } from "./TtscBenchmarkObject.ts";

/** Owns CLI, filesystem, and Go orchestration for graph viewer reduction. */
export namespace TtscBenchmarkGraphReduceCommand {
  interface IRawNode {
    external?: boolean;
    file: string;
    id: string;
    ignored?: boolean;
    kind: string;
    name: string;
  }

  interface IRawEdge {
    from: string;
    kind: string;
    to: string;
  }

  interface IRawDump {
    edges: IRawEdge[];
    nodes: IRawNode[];
    project?: string;
    provenance?: string;
    schemaVersion?: number;
  }

  /**
   * Runs graph reduction relative to the executable bootstrap directory.
   *
   * Raw dumps, demo generation, Go dump execution, default output paths, and
   * stderr summaries retain the original command-line contract.
   *
   * @param entrypointDirectory Directory containing the reduce bootstrap.
   */
  export function main(entrypointDirectory: string): void {
    // Resolved from the package rather than counted up from the bootstrap.
    // Counting was correct only while the executables sat one directory deeper,
    // and it failed silently when they moved: every path below stayed a valid
    // string and pointed one level outside the repository.
    const benchmarkRoot: string = TtscBenchmarkConstant.ROOT;
    const repositoryRoot: string = TtscBenchmarkConstant.REPOSITORY_ROOT;
    const publicGraphDirectory: string = path.join(
      repositoryRoot,
      "website",
      "public",
      "graph",
    );
    const parsed: TtscBenchmarkCommandLine.IArguments =
      TtscBenchmarkCommandLine.parse(process.argv.slice(2), {
        values: [
          "in",
          "max-nodes",
          "name",
          "out",
          "project",
          "root",
          "tsconfig",
        ],
      });
    const maxNodes: number =
      parsed.values["max-nodes"] === undefined
        ? 1500
        : TtscBenchmarkNumber.parsePositive(
            parsed.values["max-nodes"],
            "--max-nodes",
          );
    const selection: { name: string; raw: IRawDump } = selectDump({
      benchmarkRoot,
      parsed,
      repositoryRoot,
    });
    const reduced = TtscBenchmarkGraphReduce.reduce(selection.raw, {
      keepExternal: parsed.flags.has("--keep-external"),
      maxNodes,
    });
    reduced.project = selection.name;

    const output: string =
      parsed.values.out ??
      path.join(publicGraphDirectory, `${selection.name}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(reduced));

    const counts = reduced.counts;
    console.error(
      `${selection.name}: ${counts.nodes} nodes / ${counts.links} links ` +
        `(raw ${counts.rawNodes}/${counts.rawEdges}, dropped ` +
        `${counts.droppedExternal} external + ${counts.droppedIgnored} ignored + ` +
        `${counts.droppedByCap} by cap) -> ${path.relative(repositoryRoot, output)}`,
    );
  }

  function selectDump(options: {
    benchmarkRoot: string;
    parsed: TtscBenchmarkCommandLine.IArguments;
    repositoryRoot: string;
  }): { name: string; raw: IRawDump } {
    if (options.parsed.flags.has("--demo")) {
      return {
        name: options.parsed.values.name ?? "sample",
        raw: createDemoDump(),
      };
    }
    if (options.parsed.values.in !== undefined) {
      const raw: IRawDump = parseRawDump(
        fs.readFileSync(options.parsed.values.in, "utf8"),
      );
      return {
        name: options.parsed.values.name ?? raw.project ?? "graph",
        raw,
      };
    }
    if (options.parsed.values.project !== undefined) {
      const root: string | undefined = options.parsed.values.root;
      const tsconfig: string | undefined = options.parsed.values.tsconfig;
      if (root === undefined || tsconfig === undefined) {
        throw new Error(
          "--project needs --root <fixtureDir> --tsconfig <path>",
        );
      }
      return {
        name: options.parsed.values.name ?? options.parsed.values.project,
        raw: dumpFromGo({
          benchmarkRoot: options.benchmarkRoot,
          repositoryRoot: options.repositoryRoot,
          root,
          tsconfig,
        }),
      };
    }
    throw new Error(
      "nothing to do: pass --demo, --in <raw.json>, or " +
        "--project <name> --root <dir> --tsconfig <path>",
    );
  }

  function createDemoDump(): IRawDump {
    const directory: string = "/build/app/src";
    const id = (file: string, name: string, kind: string): string =>
      `${directory}/${file}#${name}:${kind}`;
    const node = (
      file: string,
      name: string,
      kind: string,
      external: boolean = false,
    ): IRawNode => ({
      external,
      file: `${directory}/${file}`,
      id: id(file, name, kind),
      kind,
      name,
    });
    return {
      schemaVersion: 1,
      project: "demo",
      provenance: "checker-resolved",
      nodes: [
        node("editor.ts", "Editor", "class"),
        node("editor.ts", "Editor.render", "method"),
        node("render/shape.ts", "ShapeRenderer", "class"),
        node("render/shape.ts", "ShapeRenderer.draw", "method"),
        node("render/shape.ts", "rasterize", "function"),
        node("render/canvas.ts", "Canvas", "class"),
        node("model/shape.ts", "Shape", "interface"),
        node("model/shape.ts", "ShapeKind", "type"),
        node("widget.ts", "Widget", "class"),
        node("node_modules/three/three.d.ts", "Object3D", "class", true),
      ],
      edges: [
        edge(
          id("editor.ts", "Editor.render", "method"),
          id("render/shape.ts", "ShapeRenderer", "class"),
          "value-call",
        ),
        edge(
          id("render/shape.ts", "ShapeRenderer.draw", "method"),
          id("render/shape.ts", "rasterize", "function"),
          "value-call",
        ),
        edge(
          id("render/shape.ts", "ShapeRenderer.draw", "method"),
          id("render/canvas.ts", "Canvas", "class"),
          "value-call",
        ),
        edge(
          id("render/shape.ts", "ShapeRenderer", "class"),
          id("render/canvas.ts", "Canvas", "class"),
          "type-ref",
        ),
        edge(
          id("render/canvas.ts", "Canvas", "class"),
          id("node_modules/three/three.d.ts", "Object3D", "class"),
          "heritage",
        ),
        edge(
          id("render/shape.ts", "ShapeRenderer.draw", "method"),
          id("model/shape.ts", "Shape", "interface"),
          "type-ref",
        ),
        edge(
          id("model/shape.ts", "Shape", "interface"),
          id("model/shape.ts", "ShapeKind", "type"),
          "type-ref",
        ),
        edge(
          id("editor.ts", "Editor", "class"),
          id("editor.ts", "Editor.render", "method"),
          "value-call",
        ),
        edge(
          id("editor.ts", "Editor", "class"),
          id("widget.ts", "Widget", "class"),
          "heritage",
        ),
      ],
    };
  }

  function edge(from: string, to: string, kind: string): IRawEdge {
    return { from, kind, to };
  }

  function parseRawDump(text: string): IRawDump {
    const value: unknown = JSON.parse(text);
    if (!isRawDump(value)) {
      throw new TypeError("graph dump must contain valid nodes and edges");
    }
    return value;
  }

  function isRawDump(input: unknown): input is IRawDump {
    return (
      TtscBenchmarkObject.isRecord(input) &&
      (input.schemaVersion === undefined ||
        typeof input.schemaVersion === "number") &&
      (input.project === undefined || typeof input.project === "string") &&
      (input.provenance === undefined ||
        typeof input.provenance === "string") &&
      Array.isArray(input.nodes) &&
      input.nodes.every(isRawNode) &&
      Array.isArray(input.edges) &&
      input.edges.every(isRawEdge)
    );
  }

  function isRawNode(input: unknown): input is IRawNode {
    return (
      TtscBenchmarkObject.isRecord(input) &&
      typeof input.id === "string" &&
      typeof input.name === "string" &&
      typeof input.kind === "string" &&
      typeof input.file === "string" &&
      isOptionalBoolean(input.external) &&
      isOptionalBoolean(input.ignored)
    );
  }

  function isRawEdge(input: unknown): input is IRawEdge {
    return (
      TtscBenchmarkObject.isRecord(input) &&
      typeof input.from === "string" &&
      typeof input.to === "string" &&
      typeof input.kind === "string"
    );
  }

  function isOptionalBoolean(input: unknown): input is boolean | undefined {
    return input === undefined || typeof input === "boolean";
  }

  function dumpFromGo(options: {
    benchmarkRoot: string;
    repositoryRoot: string;
    root: string;
    tsconfig: string;
  }): IRawDump {
    const runRoot: string = path.join(
      options.benchmarkRoot,
      ".work",
      "graph",
      "reduce",
      `run-${process.pid}`,
    );
    const goCache: string = path.join(runRoot, "go-cache");
    const goTemporaryDirectory: string = path.join(runRoot, "go-tmp");
    fs.mkdirSync(goCache, { recursive: true });
    fs.mkdirSync(goTemporaryDirectory, { recursive: true });
    try {
      const stdout: string = execFileSync(
        "go",
        [
          "run",
          "./cmd/graphdump",
          "--cwd",
          path.resolve(options.repositoryRoot, options.root),
          "--tsconfig",
          options.tsconfig,
        ],
        {
          cwd: path.join(options.repositoryRoot, "packages", "ttsc"),
          encoding: "utf8",
          env: {
            ...process.env,
            GOCACHE: goCache,
            GOTMPDIR: goTemporaryDirectory,
          },
          maxBuffer: 1024 * 1024 * 512,
        },
      );
      return parseRawDump(stdout);
    } finally {
      fs.rmSync(runRoot, { recursive: true, force: true });
    }
  }
}
