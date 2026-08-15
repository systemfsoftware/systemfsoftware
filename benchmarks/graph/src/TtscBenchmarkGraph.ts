import path from "node:path";

import type { ITtscBenchmarkGraphProject } from "./structures/ITtscBenchmarkGraphProject.ts";
import type { ITtscBenchmarkGraphRepository } from "./structures/ITtscBenchmarkGraphRepository.ts";

/** Shared prompt, fixture, and path conventions for graph benchmarks. */
export namespace TtscBenchmarkGraph {
  /**
   * Baseline-only prompt that requires evidence from the measured checkout.
   *
   * Graph arms already receive compiler-derived facts from the checkout. Adding
   * this instruction there would force redundant source reads.
   */
  export const GROUNDING =
    "Answer from this checkout's own code, not from what you may already know " +
    "about this project: every claim must trace to a symbol that exists here, " +
    "and cite the files and symbols it rests on.";

  /**
   * Tool-arm prompt that makes mounted graph tools discoverable without
   * favoring one comparator.
   */
  export const TOOL_NUDGE = "> code graph tools are provided";

  /**
   * Graph fixture corpus shared by agent and cold-index runners.
   *
   * Each tsconfig matches the program held by an editor, including tests where
   * the fixture supplies `tsconfig.graph.json`.
   */
  export const PROJECTS = {
    excalidraw: fixture("excalidraw", "ttsc-benchmark-excalidraw", {
      tsconfig: "tsconfig.json",
    }),
    vue: fixture("vue", "ttsc-benchmark-vue"),
    rxjs: fixture("rxjs", "ttsc-benchmark-rxjs"),
    typeorm: fixture("typeorm", "ttsc-benchmark-typeorm", {
      tsconfig: "tsconfig.json",
    }),
    zod: fixture("zod", "ttsc-benchmark-zod"),
    nestjs: fixture("nestjs", "ttsc-benchmark-nestjs"),
    vscode: fixture("vscode", "ttsc-benchmark-vscode", {
      tsconfig: "src/tsconfig.json",
    }),
    "shopping-backend": fixture("shopping-backend", "shopping-backend"),
  } satisfies Record<string, ITtscBenchmarkGraphProject>;

  /** Name of a project registered in the graph fixture corpus. */
  export type ProjectName = keyof typeof PROJECTS;

  /** Upstream and fixture repository metadata shared by graph harnesses. */
  export const REPOSITORIES = {
    excalidraw: repository(
      "https://github.com/excalidraw/excalidraw",
      PROJECTS.excalidraw,
    ),
    vscode: repository("https://github.com/microsoft/vscode", PROJECTS.vscode),
    nestjs: repository("https://github.com/nestjs/nest", PROJECTS.nestjs),
    vue: repository("https://github.com/vuejs/core", PROJECTS.vue),
    zod: repository("https://github.com/colinhacks/zod", PROJECTS.zod),
    typeorm: repository("https://github.com/typeorm/typeorm", PROJECTS.typeorm),
    rxjs: repository("https://github.com/ReactiveX/rxjs", PROJECTS.rxjs),
    "shopping-backend": repository(
      "https://github.com/samchon/shopping-backend",
      PROJECTS["shopping-backend"],
    ),
  } satisfies Record<ProjectName, ITtscBenchmarkGraphRepository>;

  /** Resolves the graph fixture root outside the measured repository. */
  export function resolveWorkDir(repositoryRoot: string): string {
    return (
      process.env.TTSC_GRAPH_BENCH_WORK ??
      path.resolve(repositoryRoot, "..", "graph-benchmark-work")
    );
  }

  /** Resolves the plain `<project>@graph` checkout visible to the agent. */
  export function projectDir(
    workDir: string,
    project: ITtscBenchmarkGraphProject,
  ): string {
    return path.join(workDir, `${project.repoName}@${project.sourceBranch}`);
  }

  function fixture(
    name: string,
    repository: string,
    { tsconfig = "tsconfig.graph.json" }: { tsconfig?: string } = {},
  ): ITtscBenchmarkGraphProject {
    return {
      repoName: name,
      sourceRepo: `https://github.com/samchon/${repository}.git`,
      sourceBranch: "graph",
      tsconfig,
    };
  }

  function repository(
    url: string,
    project: ITtscBenchmarkGraphProject,
  ): ITtscBenchmarkGraphRepository {
    return {
      url,
      fixtureUrl: project.sourceRepo,
      fixtureBranch: project.sourceBranch,
      tsconfig: project.tsconfig,
    };
  }
}
