import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { TtscBenchmarkConstant } from "./TtscBenchmarkConstant.ts";
import { TtscBenchmarkGraph } from "./TtscBenchmarkGraph.ts";

/** Regenerates the graph prompt manifest from the checked-in question files. */
export namespace TtscBenchmarkGraphManifest {
  interface IRepository {
    fixtureBranch: "graph";
    tsconfig: string;
  }

  interface IQuestion {
    family: "common" | "dedicated";
    file: string;
    fixtureBranch: "graph";
    id: string;
    questionSha256: string;
    repo: string;
    tsconfig: string;
  }

  /**
   * Runs manifest generation relative to the graph executable directory.
   *
   * The generated document preserves repository order and pins every prompt by
   * SHA-256 without embedding answers or scoring policy.
   *
   * Resolves the corpus through {@link TtscBenchmarkConstant.QUESTIONS_ROOT}
   * rather than counting directories up from the bootstrap. Counting was wrong
   * the moment the package moved, and it stayed wrong silently: a manifest
   * generated against a missing corpus still writes a file.
   */
  export function main(): void {
    const questionDirectory: string = TtscBenchmarkConstant.QUESTIONS_ROOT;
    const has = (relativePath: string): boolean =>
      fs.existsSync(path.join(questionDirectory, relativePath));
    const sha = (relativePath: string): string =>
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(questionDirectory, relativePath)))
        .digest("hex");
    const prompt = (
      repo: string,
      family: IQuestion["family"],
      file: string,
      meta: IRepository,
    ): IQuestion => ({
      id: `${repo}-${family}-v1`,
      repo,
      family,
      file,
      fixtureBranch: meta.fixtureBranch,
      tsconfig: meta.tsconfig,
      questionSha256: sha(file),
    });

    const prompts: IQuestion[] = [];
    for (const [repo, repository] of Object.entries(
      TtscBenchmarkGraph.REPOSITORIES,
    )) {
      const meta: IRepository = {
        fixtureBranch: "graph",
        tsconfig: repository.tsconfig,
      };
      const dedicated: string = `${repo}.md`;
      if (has(dedicated)) {
        prompts.push(prompt(repo, "dedicated", dedicated, meta));
      } else {
        console.warn(`warning: ${repo} has no ${dedicated}; skipped`);
      }
      prompts.push(prompt(repo, "common", "common.md", meta));
    }

    fs.writeFileSync(
      path.join(questionDirectory, "manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, prompts }, null, 2)}\n`,
    );
    console.log(`manifest.json: ${prompts.length} prompts`);
    for (const item of prompts) {
      console.log(
        `  ${item.id.padEnd(34)} ${item.family.padEnd(10)} ${item.file}`,
      );
    }
  }
}
