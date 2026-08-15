import fs from "node:fs";
import path from "node:path";

/**
 * Package-manifest and pinned-runtime version operations for performance
 * fixtures.
 */
export namespace TtscBenchmarkPerformancePackage {
  /** Tests whether an unknown JSON value is a non-null object record. */
  export function isRecord(input: unknown): input is Record<string, unknown> {
    return (
      typeof input === "object" &&
      input !== null &&
      Array.isArray(input) === false
    );
  }

  /** Requires a string field at a trusted package metadata boundary. */
  export function requireString(input: unknown, message: string): string {
    if (typeof input !== "string" || input.length === 0)
      throw new Error(message);
    return input;
  }

  /** Parses JSON text and requires an object root with a contextual error. */
  export function parseJsonRecord(
    text: string,
    label: string,
  ): Record<string, unknown> {
    const input: unknown = JSON.parse(text);
    if (isRecord(input) === false)
      throw new Error(`${label} must contain a JSON object`);
    return input;
  }

  /** Reads a package version and fails when its manifest is malformed. */
  export function readRequiredVersion(file: string): string {
    const manifest: Record<string, unknown> = parseJsonRecord(
      fs.readFileSync(file, "utf8"),
      file,
    );
    return requireString(
      manifest.version,
      `${file} must contain a non-empty string version`,
    );
  }

  /** Reads an installed package version, returning undefined when unavailable. */
  export function version(directory: string): string | undefined {
    try {
      const manifest: Record<string, unknown> = parseJsonRecord(
        fs.readFileSync(path.join(directory, "package.json"), "utf8"),
        path.join(directory, "package.json"),
      );
      return typeof manifest.version === "string"
        ? manifest.version
        : undefined;
    } catch {
      return undefined;
    }
  }

  /** Resolves the pinned TypeScript-Go version from the pnpm lockfile. */
  export function readTypeScriptGoLockVersion(
    repositoryRoot: string,
  ): string | undefined {
    try {
      const file: string = fs.readFileSync(
        path.join(repositoryRoot, "pnpm-lock.yaml"),
        "utf8",
      );
      const match: RegExpMatchArray | null = file.match(
        /^\s*typescript:\n\s+specifier:\s+catalog:typescript\n\s+version:\s+([^\s#]+)\s*$/m,
      );
      return match?.[1]?.replace(/^['"]|['"]$/g, "");
    } catch {
      return undefined;
    }
  }

  /** Resolves the TypeScript-Go version from the workspace catalog fallback. */
  export function readTypeScriptGoCatalogVersion(
    repositoryRoot: string,
  ): string | undefined {
    try {
      const file: string = fs.readFileSync(
        path.join(repositoryRoot, "pnpm-workspace.yaml"),
        "utf8",
      );
      const match: RegExpMatchArray | null = file.match(
        /^\s*typescript:\s*([^\s#]+)\s*$/m,
      );
      return match?.[1]?.replace(/^['"]|['"]$/g, "");
    } catch {
      return undefined;
    }
  }

  /** Reads a named dependency version from a fixture package manifest. */
  export function dependencyVersion(
    root: string,
    name: string,
  ): string | undefined {
    try {
      return readRequiredVersion(
        path.join(root, "node_modules", name, "package.json"),
      );
    } catch {
      return undefined;
    }
  }
}
