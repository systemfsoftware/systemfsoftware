import type { ITtscBenchmarkPerformanceCell } from "./structures/ITtscBenchmarkPerformanceCell.ts";
import type { ITtscBenchmarkPerformanceCommand } from "./structures/ITtscBenchmarkPerformanceCommand.ts";

/** Command-matrix construction and timing-log operations for performance cells. */
export namespace TtscBenchmarkPerformanceCommand {
  /** Builds the standard legacy, ttsc, and ttsc-lint command matrix. */
  export function compiler(
    options: ITtscBenchmarkPerformanceCommand.ICompilerOptions,
  ): ITtscBenchmarkPerformanceCommand.Matrix {
    const legacy: ITtscBenchmarkPerformanceCommand.IBranch = {
      build: normalize(options.build("tsc")),
      noEmit: normalize(options.noEmit("tsc")),
      eslint: normalize(options.eslint),
    };
    if (options.format?.legacy?.length)
      legacy.format = normalize(options.format.legacy);

    const ttscLint: ITtscBenchmarkPerformanceCommand.IBranch = {
      build: normalize(options.build("ttsc")),
      noEmit: normalize(options.noEmit("ttsc")),
    };
    if (options.format?.ttscLint?.length)
      ttscLint.format = normalize(options.format.ttscLint);

    return {
      legacy,
      ttsc: {
        build: normalize(options.build("ttsc")),
        noEmit: normalize(options.noEmit("ttsc")),
        tsgoBuild: normalize(options.build("tsgo")),
        tsgoNoEmit: normalize(options.noEmit("tsgo")),
      },
      "ttsc-lint": ttscLint,
    };
  }

  /** Creates the RxJS emitting steps for its three source programs. */
  export function rxjsBuild(tool: string): ITtscBenchmarkPerformanceCommand[] {
    return rxjsSourceTsconfigs().map(
      (config): ITtscBenchmarkPerformanceCommand => ({
        cwd: "packages/rxjs",
        cmd: `yarn --ignore-engines exec ${tool} -- -p ${config}`,
      }),
    );
  }

  /** Creates the RxJS type-check-only steps for its three source programs. */
  export function rxjsNoEmit(tool: string): ITtscBenchmarkPerformanceCommand[] {
    return rxjsSourceTsconfigs().map(
      (config): ITtscBenchmarkPerformanceCommand => ({
        cwd: "packages/rxjs",
        cmd: `yarn --ignore-engines exec ${tool} -- -p ${config} --noEmit`,
      }),
    );
  }

  /** Lists the three source-program configs measured in the RxJS fixture. */
  export function rxjsSourceTsconfigs(): string[] {
    return [
      "./src/tsconfig.cjs.json",
      "./src/tsconfig.esm.json",
      "./src/tsconfig.types.json",
    ];
  }

  /** Builds the nine-package NestJS command matrix. */
  export function nestjs(): ITtscBenchmarkPerformanceCommand.Matrix {
    const configs: string[] = nestjsPackageTsconfigs();
    return {
      legacy: {
        build: normalize(nestjsPackageSteps("tsc", false)),
        noEmit: normalize(nestjsPackageSteps("tsc", true)),
        eslint: normalize([
          tsconfigFileStep("npm exec -- eslint --no-ignore", configs),
        ]),
        format: normalize([
          tsconfigFileStep(
            "npm exec -- prettier --check --ignore-path /dev/null",
            configs,
          ),
        ]),
      },
      ttsc: {
        build: normalize(nestjsPackageSteps("ttsc", false)),
        noEmit: normalize(nestjsPackageSteps("ttsc", true)),
        tsgoBuild: normalize(nestjsPackageSteps("tsgo", false)),
        tsgoNoEmit: normalize(nestjsPackageSteps("tsgo", true)),
      },
      "ttsc-lint": {
        build: normalize(nestjsPackageSteps("ttsc", false)),
        noEmit: normalize(nestjsPackageSteps("ttsc", true)),
        format: normalize(
          nestjsPackageSteps("ttsc", false).map(
            (step): ITtscBenchmarkPerformanceCommand => ({
              ...step,
              cmd: step.cmd.replace(/\bttsc\b -p/, "ttsc format -p"),
            }),
          ),
        ),
      },
    };
  }

  /**
   * Describes a lint or format command whose file arguments come from exact
   * tsconfig programs resolved before the benchmark clock starts.
   */
  export function tsconfigFileStep(
    cmd: string,
    projects: string | readonly string[],
    options: Omit<
      ITtscBenchmarkPerformanceCommand,
      "cmd" | "tsconfigProjects"
    > = {},
  ): ITtscBenchmarkPerformanceCommand {
    return {
      ...options,
      cmd,
      tsconfigProjects:
        typeof projects === "string" ? [projects] : [...projects],
    };
  }

  /** Normalizes shorthand command text into independent structured steps. */
  export function normalize(
    value:
      | ITtscBenchmarkPerformanceCommand.Input
      | readonly ITtscBenchmarkPerformanceCommand.Input[],
  ): ITtscBenchmarkPerformanceCommand[] {
    const array: readonly ITtscBenchmarkPerformanceCommand.Input[] =
      Array.isArray(value) ? value : [value];
    return array.map(
      (
        entry: ITtscBenchmarkPerformanceCommand.Input,
      ): ITtscBenchmarkPerformanceCommand =>
        typeof entry === "string" ? { cmd: entry } : { ...entry },
    );
  }

  /** Returns the compiler checker-pool variants in publication order. */
  export function threadingVariants(): ITtscBenchmarkPerformanceCell.IThreadingVariant[] {
    return [
      { name: "single", apply: singleThreaded },
      { name: "checkers2", apply: (steps) => checkers(steps, 2) },
      { name: "checkers4", apply: (steps) => checkers(steps, 4) },
      { name: "checkers8", apply: (steps) => checkers(steps, 8) },
    ];
  }

  /** Returns the meaningful formatter variants without fake checker rows. */
  export function formatThreadingVariants(): ITtscBenchmarkPerformanceCell.IThreadingVariant[] {
    return [
      { name: "single", apply: singleThreaded },
      { name: "multi", apply: (steps) => steps },
    ];
  }

  /** Adds diagnostics only to ttsc steps that do not already request them. */
  export function diagnostics(
    steps: ITtscBenchmarkPerformanceCommand[],
  ): ITtscBenchmarkPerformanceCommand[] {
    return steps.map(
      (
        step: ITtscBenchmarkPerformanceCommand,
      ): ITtscBenchmarkPerformanceCommand => {
        if (
          !/\bttsc\b/.test(step.cmd) ||
          /--(?:extendedDiagnostics|diagnostics)\b/.test(step.cmd)
        )
          return step;
        return { ...step, cmd: `${step.cmd} --diagnostics` };
      },
    );
  }

  /** Classifies a child failure as a retryable race or deterministic error. */
  export function classifyFailure(log: string): "race" | "error" {
    return /concurrent map|fatal error|\bpanic:|DATA RACE/.test(log)
      ? "race"
      : "error";
  }

  /** Tests whether an operation may emit native lint timing diagnostics. */
  export function isLintOperation(
    operation: ITtscBenchmarkPerformanceCell.Operation,
  ): boolean {
    return operation === "build" || operation === "noEmit";
  }

  /** Parses summed ttsc lint-sidecar time in milliseconds. */
  export function parseLintSidecarTime(log: string): number | undefined {
    return parseSummedTiming(
      log,
      /^ttsc check plugin @ttsc\/lint time:\s*([0-9.]+)s\s*$/gm,
    );
  }

  /** Parses summed native lint plugin time in milliseconds. */
  export function parseLintPluginTime(log: string): number | undefined {
    return parseSummedTiming(log, /^@ttsc\/lint time:\s*([0-9.]+)s\s*$/gm);
  }

  /** Parses summed transform-host time in milliseconds. */
  export function parseTransformHostTime(log: string): number | undefined {
    return parseSummedTiming(
      log,
      /^ttsc transform host \[[^\]]*] time:\s*([0-9.]+)s\s*$/gm,
    );
  }

  /** Resolves the report label for a cell's compiler, linter, or formatter. */
  export function tool(
    branch: ITtscBenchmarkPerformanceCell.Branch,
    operation: ITtscBenchmarkPerformanceCell.Operation,
    explicit?: string,
  ): string {
    if (explicit !== undefined) return explicit;
    if (operation === "eslint") return "eslint";
    if (operation === "format")
      return branch === "legacy" ? "prettier" : "ttsc-format";
    if (branch === "legacy") return "tsc";
    return branch === "ttsc-lint" ? "ttsc+@ttsc/lint" : "ttsc";
  }

  function nestjsPackageSteps(
    tool: string,
    noEmit: boolean,
  ): ITtscBenchmarkPerformanceCommand[] {
    return nestjsPackageTsconfigs().map(
      (config): ITtscBenchmarkPerformanceCommand => ({
        cmd: `npm exec -- ${tool} -p ${config}${noEmit ? " --noEmit" : ""}`,
      }),
    );
  }

  function nestjsPackageTsconfigs(): string[] {
    return [
      "common",
      "core",
      "microservices",
      "platform-express",
      "platform-fastify",
      "platform-socket.io",
      "platform-ws",
      "testing",
      "websockets",
    ].map((pkg: string): string => `packages/${pkg}/tsconfig.build.json`);
  }

  function singleThreaded(
    steps: ITtscBenchmarkPerformanceCommand[],
  ): ITtscBenchmarkPerformanceCommand[] {
    return steps.map(
      (
        step: ITtscBenchmarkPerformanceCommand,
      ): ITtscBenchmarkPerformanceCommand => {
        if (step.singleThreadedCmd !== undefined) {
          const { singleThreadedCmd, ...rest } = step;
          return { ...rest, cmd: singleThreadedCmd };
        }
        if (
          !/\b(?:ttsc|tsgo)\b/.test(step.cmd) ||
          /--singleThreaded\b/.test(step.cmd)
        )
          return step;
        return { ...step, cmd: `${step.cmd} --singleThreaded` };
      },
    );
  }

  function checkers(
    steps: ITtscBenchmarkPerformanceCommand[],
    count: number,
  ): ITtscBenchmarkPerformanceCommand[] {
    return steps.map(
      (
        step: ITtscBenchmarkPerformanceCommand,
      ): ITtscBenchmarkPerformanceCommand => {
        if (
          !/\b(?:ttsc|tsgo)\b/.test(step.cmd) ||
          /--checkers\b/.test(step.cmd)
        )
          return step;
        return { ...step, cmd: `${step.cmd} --checkers ${count}` };
      },
    );
  }

  function parseSummedTiming(log: string, pattern: RegExp): number | undefined {
    let total: number = 0;
    let count: number = 0;
    for (const match of log.matchAll(pattern)) {
      const seconds: number = Number(match[1]);
      if (Number.isFinite(seconds)) {
        total += seconds * 1000;
        ++count;
      }
    }
    return count === 0 ? undefined : total;
  }
}
