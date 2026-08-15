import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Resolves the exact lint and format source set selected by one or more
 * TypeScript project configurations.
 */
export namespace TtscBenchmarkPerformanceTypeScriptFileSelector {
  interface IDiagnostic {
    messageText: unknown;
  }

  interface ITypeScript {
    sys: {
      readFile(path: string): string | undefined;
    };
    readConfigFile(
      path: string,
      readFile: (path: string) => string | undefined,
    ): {
      config: unknown;
      error?: IDiagnostic;
    };
    parseJsonConfigFileContent(
      config: unknown,
      host: ITypeScript["sys"],
      basePath: string,
      existingOptions: undefined,
      configPath: string,
    ): {
      errors: IDiagnostic[];
      fileNames: string[];
    };
    flattenDiagnosticMessageText(message: unknown, newLine: string): string;
  }

  /**
   * Parses selector arguments and writes the deduplicated project file list.
   *
   * @param executableDirectory Absolute directory of the wrapper used as the
   *   fallback package-resolution base.
   * @param arguments_ Selector CLI arguments excluding the Node executable and
   *   script path.
   */
  export async function main(
    executableDirectory: string,
    arguments_: readonly string[],
  ): Promise<void> {
    const projects: string[] = [];
    let cwd = process.cwd();
    let typescriptRoot = cwd;
    let hasTypescriptRoot = false;
    let shell = false;
    let json = false;

    for (let index = 0; index < arguments_.length; index++) {
      const argument = arguments_[index]!;
      if (argument === "--project" || argument === "-p") {
        projects.push(requireArgument(arguments_, ++index, argument));
      } else if (argument === "--cwd") {
        cwd = path.resolve(requireArgument(arguments_, ++index, argument));
        if (!hasTypescriptRoot) typescriptRoot = cwd;
      } else if (argument === "--typescript-root") {
        typescriptRoot = path.resolve(
          requireArgument(arguments_, ++index, argument),
        );
        hasTypescriptRoot = true;
      } else if (argument === "--shell") {
        shell = true;
      } else if (argument === "--json") {
        json = true;
      } else {
        throw new Error(`unknown argument: ${argument}`);
      }
    }

    if (projects.length === 0) {
      throw new Error("at least one --project is required");
    }

    const typescript = loadTypescript(typescriptRoot, executableDirectory);
    const files = [
      ...new Set(
        projects.flatMap((project) => readProject(typescript, cwd, project)),
      ),
    ];
    if (json) {
      process.stdout.write(`${JSON.stringify(files, null, 2)}\n`);
    } else if (shell) {
      process.stdout.write(files.join(" "));
    } else {
      process.stdout.write(`${files.join("\n")}\n`);
    }
  }

  function readProject(
    typescript: ITypeScript,
    cwd: string,
    project: string,
  ): string[] {
    const configPath = path.resolve(cwd, project);
    const loaded = typescript.readConfigFile(
      configPath,
      typescript.sys.readFile,
    );
    if (loaded.error) {
      const message = typescript.flattenDiagnosticMessageText(
        loaded.error.messageText,
        "\n",
      );
      throw new Error(`${configPath}: ${message}`);
    }
    const parsed = typescript.parseJsonConfigFileContent(
      loaded.config,
      typescript.sys,
      path.dirname(configPath),
      undefined,
      configPath,
    );
    if (parsed.errors.length !== 0) {
      const message = parsed.errors
        .map((error) =>
          typescript.flattenDiagnosticMessageText(error.messageText, "\n"),
        )
        .join("\n");
      throw new Error(`${configPath}: ${message}`);
    }
    return parsed.fileNames
      .map((file) => path.relative(cwd, file).replaceAll(path.sep, "/"))
      .filter(
        (file) =>
          file.length !== 0 &&
          !file.startsWith("..") &&
          isLintFormatSourceFileName(file),
      )
      .sort();
  }

  function isLintFormatSourceFileName(file: string): boolean {
    return [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].some(
      (extension) => file.toLowerCase().endsWith(extension),
    );
  }

  function loadTypescript(
    root: string,
    executableDirectory: string,
  ): ITypeScript {
    let directory = root;
    while (true) {
      const manifest = path.join(directory, "package.json");
      if (fs.existsSync(manifest)) {
        try {
          return createRequire(manifest)("typescript") as ITypeScript;
        } catch {
          // Try the parent package.
        }
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    return createRequire(path.join(executableDirectory, "tsconfig-files.ts"))(
      "typescript",
    ) as ITypeScript;
  }

  function requireArgument(
    arguments_: readonly string[],
    index: number,
    option: string,
  ): string {
    const value = arguments_[index];
    if (value === undefined) throw new Error(`${option} requires a value`);
    return value;
  }
}
