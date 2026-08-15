import { TtscBenchmarkPerformanceCommand } from "./TtscBenchmarkPerformanceCommand.ts";
import type { ITtscBenchmarkPerformanceProject } from "./structures/ITtscBenchmarkPerformanceProject.ts";

/**
 * Canonical fixture corpus and workload configuration for performance
 * benchmarks.
 */
export namespace TtscBenchmarkPerformanceConfiguration {
  /** Resolves a fixture by dashboard name or repository basename. */
  export function project(
    name: string,
  ): ITtscBenchmarkPerformanceProject | undefined {
    return PROJECTS.find(
      (project: ITtscBenchmarkPerformanceProject): boolean =>
        project.name === name || project.repoName === name,
    );
  }

  const PACKAGE_CONFIGS = {
    vue: {
      kind: "frontend monorepo",
      repoName: "ttsc-benchmark-vue",
      repo: "https://github.com/samchon/ttsc-benchmark-vue.git",
      packageManager: "pnpm",
      filesRoot: "packages",
      commands: TtscBenchmarkPerformanceCommand.compiler({
        build: (tool) => [`pnpm exec ${tool} -p tsconfig.json`],
        noEmit: (tool) => [`pnpm exec ${tool} -p tsconfig.json --noEmit`],
        eslint: [
          TtscBenchmarkPerformanceCommand.tsconfigFileStep(
            "pnpm exec eslint --no-ignore",
            "tsconfig.json",
          ),
        ],
        format: {
          legacy: [
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "pnpm exec prettier --check --ignore-path /dev/null",
              "tsconfig.json",
            ),
          ],
          ttscLint: ["pnpm exec ttsc format -p tsconfig.json"],
        },
      }),
    },
    rxjs: {
      kind: "library monorepo",
      repoName: "ttsc-benchmark-rxjs",
      repo: "https://github.com/samchon/ttsc-benchmark-rxjs.git",
      packageManager: "yarn",
      filesRoot: "packages",
      commands: TtscBenchmarkPerformanceCommand.compiler({
        build: (tool) => [
          {
            cwd: "packages/observable",
            cmd: `yarn --ignore-engines exec ${tool} -- -p tsconfig.json`,
          },
          ...TtscBenchmarkPerformanceCommand.rxjsBuild(tool),
        ],
        noEmit: (tool) => [
          {
            cwd: "packages/observable",
            cmd: `yarn --ignore-engines exec ${tool} -- -p tsconfig.json --noEmit`,
          },
          ...TtscBenchmarkPerformanceCommand.rxjsNoEmit(tool),
        ],
        eslint: [
          TtscBenchmarkPerformanceCommand.tsconfigFileStep(
            "yarn --ignore-engines exec eslint --no-ignore",
            "tsconfig.json",
            { cwd: "packages/observable" },
          ),
          TtscBenchmarkPerformanceCommand.tsconfigFileStep(
            "yarn --ignore-engines exec eslint --no-ignore",
            TtscBenchmarkPerformanceCommand.rxjsSourceTsconfigs(),
            { cwd: "packages/rxjs" },
          ),
        ],
        format: {
          legacy: [
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "yarn --ignore-engines exec prettier --check --ignore-path /dev/null",
              "tsconfig.json",
              { cwd: "packages/observable" },
            ),
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "yarn --ignore-engines exec prettier --check --ignore-path /dev/null",
              TtscBenchmarkPerformanceCommand.rxjsSourceTsconfigs(),
              { cwd: "packages/rxjs" },
            ),
          ],
          ttscLint: [
            {
              cwd: "packages/observable",
              cmd: "yarn --ignore-engines exec ttsc -- format -p tsconfig.json",
            },
            {
              cwd: "packages/rxjs",
              cmd: "yarn --ignore-engines exec ttsc -- format -p ./src/tsconfig.cjs.json",
            },
            {
              cwd: "packages/rxjs",
              cmd: "yarn --ignore-engines exec ttsc -- format -p ./src/tsconfig.esm.json",
            },
            {
              cwd: "packages/rxjs",
              cmd: "yarn --ignore-engines exec ttsc -- format -p ./src/tsconfig.types.json",
            },
          ],
        },
      }),
    },
    typeorm: {
      kind: "ORM library",
      repoName: "ttsc-benchmark-typeorm",
      repo: "https://github.com/samchon/ttsc-benchmark-typeorm.git",
      packageManager: "pnpm",
      installCommand:
        "pnpm install --virtual-store-dir node_modules/.pnpm --no-frozen-lockfile --ignore-scripts --config.minimumReleaseAge=0",
      installTarballsCommand: (specs: string): string =>
        `pnpm add -w --virtual-store-dir node_modules/.pnpm -D --ignore-scripts --config.minimumReleaseAge=0 ${specs}`,
      prepareCommand: "pnpm exec ttsc prepare -p tsconfig.json",
      filesRoot: "src",
      commands: TtscBenchmarkPerformanceCommand.compiler({
        build: (tool) => [`pnpm exec ${tool} -p tsconfig.json`],
        noEmit: (tool) => [`pnpm exec ${tool} -p tsconfig.json --noEmit`],
        eslint: [
          TtscBenchmarkPerformanceCommand.tsconfigFileStep(
            "pnpm exec eslint --no-ignore --quiet",
            "tsconfig.json",
          ),
        ],
        format: {
          legacy: [
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "pnpm exec prettier --check --ignore-path /dev/null",
              "tsconfig.json",
            ),
          ],
          ttscLint: ["pnpm exec ttsc format -p tsconfig.json"],
        },
      }),
    },
    zod: {
      kind: "schema library monorepo",
      repoName: "ttsc-benchmark-zod",
      repo: "https://github.com/samchon/ttsc-benchmark-zod.git",
      packageManager: "pnpm",
      filesRoot: "packages/zod/src",
      commands: TtscBenchmarkPerformanceCommand.compiler({
        build: (tool) => [
          {
            cwd: "packages/zod",
            cmd: `pnpm exec ${tool} -p tsconfig.build.json`,
          },
        ],
        noEmit: (tool) => [
          {
            cwd: "packages/zod",
            cmd: `pnpm exec ${tool} -p tsconfig.json --noEmit`,
          },
        ],
        eslint: [
          TtscBenchmarkPerformanceCommand.tsconfigFileStep(
            "pnpm exec eslint --no-ignore",
            "tsconfig.json",
            { cwd: "packages/zod" },
          ),
        ],
        format: {
          legacy: [
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "pnpm exec prettier --check --ignore-path /dev/null",
              "tsconfig.json",
              { cwd: "packages/zod" },
            ),
          ],
          ttscLint: [
            {
              cwd: "packages/zod",
              cmd: "pnpm exec ttsc format -p tsconfig.json",
            },
          ],
        },
      }),
    },
    nestjs: {
      kind: "backend framework monorepo",
      repoName: "ttsc-benchmark-nestjs",
      repo: "https://github.com/samchon/ttsc-benchmark-nestjs.git",
      packageManager: "npm",
      filesRoot: "packages",
      commands: TtscBenchmarkPerformanceCommand.nestjs(),
    },
    vscode: {
      kind: "application monorepo",
      repoName: "ttsc-benchmark-vscode",
      repo: "https://github.com/samchon/ttsc-benchmark-vscode.git",
      packageManager: "npm",
      installCommand:
        "npm install --legacy-peer-deps --ignore-scripts --prefer-online",
      installTarballsCommand: (specs: string): string =>
        `npm install --legacy-peer-deps --ignore-scripts --prefer-online --save-dev ${specs}`,
      prepareCommand: "./node_modules/.bin/ttsc prepare -p src/tsconfig.json",
      filesRoot: "src",
      commands: TtscBenchmarkPerformanceCommand.compiler({
        build: (tool) => [
          {
            cmd: `./node_modules/.bin/${tool} -p src/tsconfig.json`,
            env: { NODE_OPTIONS: "--max-old-space-size=8192" },
          },
        ],
        noEmit: (tool) => [
          {
            cmd: `./node_modules/.bin/${tool} -p src/tsconfig.json --noEmit`,
            env: { NODE_OPTIONS: "--max-old-space-size=8192" },
          },
        ],
        eslint: [
          TtscBenchmarkPerformanceCommand.tsconfigFileStep(
            "./node_modules/.bin/eslint --no-ignore --quiet",
            "src/tsconfig.json",
          ),
        ],
        format: {
          legacy: [
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "./node_modules/.bin/prettier --check --ignore-path /dev/null",
              "src/tsconfig.json",
            ),
          ],
          ttscLint: [
            {
              cmd: "./node_modules/.bin/ttsc format -p src/tsconfig.json",
              env: { NODE_OPTIONS: "--max-old-space-size=8192" },
            },
          ],
        },
      }),
    },
    "shopping-backend": {
      kind: "plugin-heavy service",
      repoName: "shopping-backend",
      repo: "https://github.com/samchon/shopping-backend.git",
      packageManager: "pnpm",
      filesRoot: "src",
      installCommand: "pnpm install --ignore-scripts --no-frozen-lockfile",
      installTarballsCommand: (specs: string): string =>
        `pnpm add -w -D --ignore-scripts --config.minimumReleaseAge=0 ${specs}`,
      prerequisites: TtscBenchmarkPerformanceCommand.normalize([
        {
          cmd: "pnpm run build:prisma",
          env: { TS_NODE_TRANSPILE_ONLY: "1" },
        },
        {
          cmd: 'pnpm exec prettier --write --ignore-path /dev/null "src/prisma/**/*.ts"',
        },
      ]),
      cleanExcludes: [".env", "src/prisma", "src/prisma/**"],
      commands: {
        legacy: {
          build: TtscBenchmarkPerformanceCommand.normalize([
            "pnpm exec tsc -p tsconfig.json",
          ]),
          noEmit: TtscBenchmarkPerformanceCommand.normalize([
            "pnpm exec tsc -p tsconfig.json --noEmit",
          ]),
          eslint: TtscBenchmarkPerformanceCommand.normalize([
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "pnpm exec eslint --no-ignore",
              "tsconfig.json",
            ),
          ]),
          format: TtscBenchmarkPerformanceCommand.normalize([
            TtscBenchmarkPerformanceCommand.tsconfigFileStep(
              "pnpm exec prettier --check --ignore-path /dev/null",
              "tsconfig.json",
            ),
          ]),
        },
        ttsc: {
          build: TtscBenchmarkPerformanceCommand.normalize([
            "pnpm exec ttsc -p tsconfig.json",
          ]),
          noEmit: TtscBenchmarkPerformanceCommand.normalize([
            "pnpm exec ttsc -p tsconfig.json --noEmit",
          ]),
        },
        "ttsc-lint": {
          build: TtscBenchmarkPerformanceCommand.normalize([
            "pnpm exec ttsc -p tsconfig.json",
          ]),
          noEmit: TtscBenchmarkPerformanceCommand.normalize([
            "pnpm exec ttsc -p tsconfig.json --noEmit",
          ]),
          format: TtscBenchmarkPerformanceCommand.normalize([
            "pnpm exec ttsc format -p tsconfig.json",
          ]),
        },
      },
    },
  } satisfies Record<string, ITtscBenchmarkPerformanceProject.IConfig>;

  const PROJECT_ORDER_BY_STARS: readonly string[] = [
    "vscode",
    "nestjs",
    "vue",
    "zod",
    "typeorm",
    "rxjs",
    "shopping-backend",
  ];

  /**
   * Active fixtures ordered by upstream recognition for stable dashboard rows.
   *
   * Every command matrix preserves the exact program and operation measured by
   * the legacy JavaScript harness.
   */
  export const PROJECTS: readonly ITtscBenchmarkPerformanceProject[] =
    Object.entries<ITtscBenchmarkPerformanceProject.IConfig>(PACKAGE_CONFIGS)
      .filter(([, config]) => config.disabled !== true)
      .map(
        ([name, config]): ITtscBenchmarkPerformanceProject => ({
          name,
          ...config,
        }),
      )
      .sort(
        (
          left: ITtscBenchmarkPerformanceProject,
          right: ITtscBenchmarkPerformanceProject,
        ): number => projectSortRank(left.name) - projectSortRank(right.name),
      );

  function projectSortRank(name: string): number {
    const index: number = PROJECT_ORDER_BY_STARS.indexOf(name);
    return index === -1 ? PROJECT_ORDER_BY_STARS.length : index;
  }
}
