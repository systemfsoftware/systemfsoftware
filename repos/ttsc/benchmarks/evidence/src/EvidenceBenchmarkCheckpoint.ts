import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import typia from "typia";

import { EvidenceBenchmarkLayout } from "./EvidenceBenchmarkLayout";
import type { ITtscEvidenceBenchmarkCheckpointStorage } from "./structures/ITtscEvidenceBenchmarkCheckpointStorage";
import type { ITtscEvidenceBenchmarkInputIdentity } from "./structures/ITtscEvidenceBenchmarkInputIdentity";
import type { ITtscEvidenceBenchmarkWorkspaceIdentity } from "./structures/ITtscEvidenceBenchmarkWorkspaceIdentity";
import type { EvidenceBenchmarkArm } from "./typings/EvidenceBenchmarkArm";

interface IWorkspaceSnapshotManifest {
  schemaVersion: 1;
  name: "backend-start";
  createdAt: string;
  workspaceSha256: string;
  workspaceMaterialSha256: string;
  workspaceFileCount: number;
  workspaceGitHead: string;
  workspaceGitStatus: string;
  inheritedWallElapsedMs: number;
}

/** Creates and restores immutable benchmark recovery points. */
export namespace EvidenceBenchmarkCheckpoint {
  /** Identifies the exact material workspace state at an audit boundary. */
  export function identifyWorkspace(
    workspace: string,
  ): ITtscEvidenceBenchmarkWorkspaceIdentity {
    const resolved: string = path.resolve(workspace);
    const files: string[] = materialWorkspaceFiles(resolved);
    return {
      materialSha256: hashFileSet(resolved, files),
      fileCount: files.length,
      gitHead: git(resolved, ["rev-parse", "HEAD"]).trim(),
      gitStatus: git(resolved, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]),
    };
  }

  /** Hashes the exact selected template, requirements, and instruction trees. */
  export function identifyInputs(props: {
    repository: string;
    subject: string;
    arm: EvidenceBenchmarkArm;
  }): ITtscEvidenceBenchmarkInputIdentity {
    const repository: string = path.resolve(props.repository);
    return {
      templateSha256: hashRoots([
        [
          "base",
          path.join(
            EvidenceBenchmarkLayout.assetsRoot(repository),
            "template",
            "base",
          ),
        ],
        [
          props.arm,
          path.join(
            EvidenceBenchmarkLayout.assetsRoot(repository),
            "template",
            props.arm,
          ),
        ],
      ]),
      requirementsSha256: hashRoots([
        [
          props.subject,
          path.join(
            EvidenceBenchmarkLayout.assetsRoot(repository),
            "requirements",
            props.subject,
          ),
        ],
      ]),
      instructionsSha256: hashRoots([
        [
          props.arm,
          path.join(
            EvidenceBenchmarkLayout.assetsRoot(repository),
            "instructions",
            props.arm,
          ),
        ],
      ]),
    };
  }

  /** Copies the exact Git-visible workspace and its baseline repository. */
  export function createWorkspaceSnapshot(props: {
    runRoot: string;
    workspace: string;
    inheritedWallElapsedMs: number;
  }): ITtscEvidenceBenchmarkCheckpointStorage {
    const runRoot: string = path.resolve(props.runRoot);
    const workspace: string = path.resolve(props.workspace);
    const checkpoints: string = path.join(runRoot, "checkpoints");
    const destination: string = path.join(checkpoints, "backend-start");
    if (fs.existsSync(destination))
      return readWorkspaceSnapshot(runRoot, destination);

    fs.mkdirSync(checkpoints, { recursive: true });
    // Backend Start requires a persistent `check:watch`, and the review stages
    // keep it running, so the workspace is still being written when this
    // snapshot is taken. A single racing write must not cost the cell its
    // checkpoint: retry the whole snapshot until one pass observes a quiet
    // workspace. The consistency guarantee below is unchanged; only the number
    // of chances to satisfy it is.
    const attempts: number = 5;
    for (let attempt: number = 1; ; ++attempt)
      try {
        return attemptWorkspaceSnapshot({
          runRoot,
          workspace,
          checkpoints,
          destination,
          inheritedWallElapsedMs: props.inheritedWallElapsedMs,
        });
      } catch (error) {
        if (
          attempt >= attempts ||
          !(error instanceof Error) ||
          error.message !== VOLATILE_WORKSPACE_MESSAGE
        )
          throw error;
      }
  }

  const VOLATILE_WORKSPACE_MESSAGE =
    "Backend-start workspace changed while its checkpoint was created.";

  /** Copies the workspace once, rejecting the copy if it changed underneath. */
  function attemptWorkspaceSnapshot(props: {
    runRoot: string;
    workspace: string;
    checkpoints: string;
    destination: string;
    inheritedWallElapsedMs: number;
  }): ITtscEvidenceBenchmarkCheckpointStorage {
    const runRoot: string = props.runRoot;
    const workspace: string = props.workspace;
    const destination: string = props.destination;
    const stage: string = fs.mkdtempSync(path.join(props.checkpoints, ".tmp-"));
    try {
      const snapshot: string = path.join(stage, "workspace");
      fs.mkdirSync(snapshot);
      const files: string[] = materialWorkspaceFiles(workspace);
      const workspaceFilesSha256: string = hashFileSet(workspace, files);
      const gitSha256: string = hashTree(path.join(workspace, ".git"));
      fs.cpSync(path.join(workspace, ".git"), path.join(snapshot, ".git"), {
        recursive: true,
        dereference: false,
        preserveTimestamps: true,
      });
      for (const relative of files) {
        const source: string = resolveWithin(workspace, relative);
        const target: string = resolveWithin(snapshot, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.cpSync(source, target, {
          dereference: false,
          preserveTimestamps: true,
        });
      }
      const filesAfter: string[] = materialWorkspaceFiles(workspace);
      if (
        filesAfter.length !== files.length ||
        filesAfter.some((relative, index) => relative !== files[index]) ||
        hashFileSet(workspace, filesAfter) !== workspaceFilesSha256 ||
        hashFileSet(snapshot, files) !== workspaceFilesSha256 ||
        hashTree(path.join(workspace, ".git")) !== gitSha256 ||
        hashTree(path.join(snapshot, ".git")) !== gitSha256
      )
        throw new Error(VOLATILE_WORKSPACE_MESSAGE);
      const workspaceGitHead: string = git(snapshot, [
        "rev-parse",
        "HEAD",
      ]).trim();
      const workspaceGitStatus: string = git(snapshot, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]);
      const manifest: IWorkspaceSnapshotManifest = {
        schemaVersion: 1,
        name: "backend-start",
        createdAt: new Date().toISOString(),
        workspaceSha256: hashTree(snapshot),
        workspaceMaterialSha256: workspaceFilesSha256,
        workspaceFileCount: files.length,
        workspaceGitHead,
        workspaceGitStatus,
        inheritedWallElapsedMs: props.inheritedWallElapsedMs,
      } satisfies IWorkspaceSnapshotManifest;
      fs.writeFileSync(
        path.join(stage, "checkpoint.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      fs.renameSync(stage, destination);
      return storage(runRoot, destination, manifest);
    } catch (error) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }

  /** Restores one verified workspace snapshot into a new run root. */
  export function restoreWorkspaceSnapshot(props: {
    sourceRunRoot: string;
    workspaceRelativePath: string;
    workspaceSha256: string;
    destinationRunRoot: string;
  }): string {
    const sourceRunRoot: string = path.resolve(props.sourceRunRoot);
    const source: string = resolveWithin(
      sourceRunRoot,
      props.workspaceRelativePath,
    );
    const manifestRoot: string = path.dirname(source);
    const retained = readWorkspaceSnapshot(sourceRunRoot, manifestRoot);
    if (retained.workspaceSha256 !== props.workspaceSha256)
      throw new Error("Backend-start checkpoint digest does not match state.");

    const destinationRunRoot: string = path.resolve(props.destinationRunRoot);
    if (fs.existsSync(destinationRunRoot))
      throw new Error(
        `Checkpoint destination already exists: ${destinationRunRoot}.`,
      );
    const parent: string = path.dirname(destinationRunRoot);
    fs.mkdirSync(parent, { recursive: true });
    const stage: string = fs.mkdtempSync(path.join(parent, ".tmp-"));
    try {
      fs.cpSync(
        manifestRoot,
        path.join(stage, "checkpoints", "backend-start"),
        {
          recursive: true,
          dereference: false,
          preserveTimestamps: true,
        },
      );
      fs.cpSync(source, path.join(stage, "workspace"), {
        recursive: true,
        dereference: false,
        preserveTimestamps: true,
      });
      fs.renameSync(stage, destinationRunRoot);
      return path.join(destinationRunRoot, "workspace");
    } catch (error) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }
  }

  /** Revalidates a restored workspace after dependency installation. */
  export function assertRestoredWorkspace(props: {
    workspace: string;
    materialSha256: string;
    gitHead: string;
    gitStatus: string;
  }): void {
    const files: string[] = materialWorkspaceFiles(props.workspace);
    if (hashFileSet(props.workspace, files) !== props.materialSha256)
      throw new Error("Restored checkpoint material files have changed.");
    if (git(props.workspace, ["rev-parse", "HEAD"]).trim() !== props.gitHead)
      throw new Error("Restored checkpoint uses a different Git baseline.");
    if (
      git(props.workspace, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]) !== props.gitStatus
    )
      throw new Error("Restored checkpoint workspace bytes have changed.");
  }

  /** Applies current agent instructions without counting them as product work. */
  export function applyInstructionSurface(props: {
    workspace: string;
    source: string;
  }): string {
    const workspace: string = path.resolve(props.workspace);
    const source: string = path.resolve(props.source);
    if (!fs.statSync(source).isDirectory())
      throw new Error(`Instruction surface is not a directory: ${source}.`);
    const relatives = ["AGENTS.md", ".agents/skills"] as const;
    const expectedSha256: string = hashInstructionSurface(source);
    for (const relative of relatives)
      assertInstructionPathClean({ workspace, relative });
    for (const relative of relatives)
      applyInstructionPath({ workspace, source, relative });
    const actualSha256: string = hashInstructionSurface(workspace);
    if (actualSha256 !== expectedSha256)
      throw new Error("Recovered instruction surface failed verification.");
    return actualSha256;
  }

  const assertInstructionPathClean = (props: {
    workspace: string;
    relative: "AGENTS.md" | ".agents/skills";
  }): void => {
    const existingStatus: string = git(props.workspace, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      props.relative,
    ]);
    if (existingStatus.length !== 0)
      throw new Error(
        `Checkpoint instruction surface was modified before recovery: ${props.relative}.`,
      );
  };

  const applyInstructionPath = (props: {
    workspace: string;
    source: string;
    relative: "AGENTS.md" | ".agents/skills";
  }): void => {
    const source: string = resolveWithin(props.source, props.relative);
    const relative: string = props.relative;
    const workspace: string = props.workspace;
    const target: string = resolveWithin(workspace, relative);
    const tracked: string[] = git(workspace, ["ls-files", "-z", "--", relative])
      .split("\0")
      .filter((file) => file.length !== 0);

    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, {
      recursive: fs.statSync(source).isDirectory(),
      dereference: false,
      preserveTimestamps: true,
    });
    for (const file of tracked)
      git(workspace, ["update-index", "--skip-worktree", "--", file]);

    const exclude: string = path.join(workspace, ".git", "info", "exclude");
    const pattern: string =
      relative === "AGENTS.md" ? "/AGENTS.md" : "/.agents/skills/";
    const contents: string = fs.existsSync(exclude)
      ? fs.readFileSync(exclude, "utf8")
      : "";
    if (!contents.split(/\r?\n/u).includes(pattern)) {
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.appendFileSync(
        exclude,
        `${contents.length !== 0 && !contents.endsWith("\n") ? "\n" : ""}${pattern}\n`,
        "utf8",
      );
    }
  };

  const hashInstructionSurface = (root: string): string => {
    const agents: string = resolveWithin(root, "AGENTS.md");
    const skills: string = resolveWithin(root, ".agents/skills");
    if (!fs.lstatSync(agents).isFile())
      throw new Error(`Instruction entry is not a regular file: ${agents}.`);
    if (!fs.lstatSync(skills).isDirectory())
      throw new Error(`Instruction entry is not a directory: ${skills}.`);
    const files: string[] = ["AGENTS.md"];
    visit(skills, (_file, relative) =>
      files.push(path.posix.join(".agents/skills", relative)),
    );
    return hashFileSet(root, files.sort());
  };

  function readWorkspaceSnapshot(
    runRoot: string,
    checkpointRoot: string,
  ): ITtscEvidenceBenchmarkCheckpointStorage {
    const manifest = typia.assert<IWorkspaceSnapshotManifest>(
      JSON.parse(
        fs.readFileSync(path.join(checkpointRoot, "checkpoint.json"), "utf8"),
      ),
    );
    const snapshot: string = path.join(checkpointRoot, "workspace");
    if (hashTree(snapshot) !== manifest.workspaceSha256)
      throw new Error("Backend-start checkpoint workspace is corrupted.");
    return storage(runRoot, checkpointRoot, manifest);
  }

  function storage(
    runRoot: string,
    checkpointRoot: string,
    manifest: IWorkspaceSnapshotManifest,
  ): ITtscEvidenceBenchmarkCheckpointStorage {
    return {
      createdAt: manifest.createdAt,
      workspaceRelativePath: path
        .relative(runRoot, path.join(checkpointRoot, "workspace"))
        .replaceAll(path.sep, "/"),
      workspaceSha256: manifest.workspaceSha256,
      workspaceMaterialSha256: manifest.workspaceMaterialSha256,
      workspaceFileCount: manifest.workspaceFileCount,
      workspaceGitHead: manifest.workspaceGitHead,
      workspaceGitStatus: manifest.workspaceGitStatus,
      inheritedWallElapsedMs: manifest.inheritedWallElapsedMs,
    };
  }

  function gitVisibleFiles(workspace: string): string[] {
    const result = spawnSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd: workspace,
        shell: false,
        windowsHide: true,
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    if (result.status !== 0)
      throw new Error(
        `Unable to enumerate checkpoint workspace: ${result.stderr.toString("utf8")}`,
      );
    return result.stdout
      .toString("utf8")
      .split("\0")
      .filter((relative) => relative.length !== 0)
      .sort();
  }

  function materialWorkspaceFiles(workspace: string): string[] {
    const visible: Set<string> = new Set(
      gitVisibleFiles(workspace).filter((relative) =>
        lstatExists(resolveWithin(workspace, relative)),
      ),
    );
    const files: Set<string> = new Set(visible);
    const recurse = (directory: string, relative: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child: string = path.posix.join(relative, entry.name);
        const location: string = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (
            (relative.length === 0 && entry.name === ".git") ||
            entry.name === "node_modules" ||
            entry.name === ".cache"
          )
            continue;
          recurse(location, child);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (
            visible.has(child) ||
            (!entry.name.endsWith(".log") &&
              !entry.name.endsWith(".pid") &&
              !entry.name.endsWith(".tsbuildinfo"))
          )
            files.add(child);
        } else throw new Error(`Unsupported workspace entry: ${child}.`);
      }
    };
    recurse(workspace, "");
    return [...files].sort();
  }

  function hashRoots(roots: readonly (readonly [string, string])[]): string {
    const hash = crypto.createHash("sha256");
    for (const [prefix, root] of roots) {
      if (!fs.lstatSync(root).isDirectory())
        throw new Error(`Benchmark input is not a directory: ${root}.`);
      visit(root, (file, relative) => {
        const status: fs.Stats = fs.lstatSync(file);
        hash.update(prefix);
        hash.update("\0");
        hash.update(relative);
        hash.update("\0");
        hash.update(
          status.isSymbolicLink()
            ? fs.readlinkSync(file)
            : fs.readFileSync(file),
        );
        hash.update("\0");
      });
    }
    return hash.digest("hex");
  }

  function hashTree(root: string): string {
    const hash = crypto.createHash("sha256");
    visit(root, (file, relative) => {
      const status: fs.Stats = fs.lstatSync(file);
      hash.update(status.isSymbolicLink() ? "L" : "F");
      hash.update("\0");
      hash.update(relative);
      hash.update("\0");
      hash.update(
        status.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file),
      );
      hash.update("\0");
    });
    return hash.digest("hex");
  }

  function hashFileSet(root: string, files: readonly string[]): string {
    const hash = crypto.createHash("sha256");
    for (const relative of files) {
      const file: string = resolveWithin(root, relative);
      const status: fs.Stats = fs.lstatSync(file);
      hash.update(status.isSymbolicLink() ? "L" : "F");
      hash.update("\0");
      hash.update(relative);
      hash.update("\0");
      hash.update(
        status.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file),
      );
      hash.update("\0");
    }
    return hash.digest("hex");
  }

  function visit(
    root: string,
    closure: (file: string, relative: string) => void,
  ): void {
    const recurse = (directory: string, relative: string): void => {
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const child: string = path.posix.join(relative, entry.name);
        const location: string = path.join(directory, entry.name);
        if (entry.isDirectory()) recurse(location, child);
        else if (entry.isFile() || entry.isSymbolicLink())
          closure(location, child);
        else throw new Error(`Unsupported checkpoint entry: ${child}.`);
      }
    };
    recurse(path.resolve(root), "");
  }

  function resolveWithin(root: string, relative: string): string {
    if (path.isAbsolute(relative))
      throw new Error("Checkpoint path must be relative.");
    const resolvedRoot: string = path.resolve(root);
    const resolved: string = path.resolve(resolvedRoot, ...relative.split("/"));
    const prefix: string = `${resolvedRoot}${path.sep}`;
    const normalize = (value: string): string =>
      process.platform === "win32" ? value.toLowerCase() : value;
    if (!normalize(resolved).startsWith(normalize(prefix)))
      throw new Error(`Checkpoint path escapes its root: ${relative}.`);
    return resolved;
  }

  function lstatExists(location: string): boolean {
    try {
      fs.lstatSync(location);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return false;
      throw error;
    }
  }

  function git(cwd: string, args: readonly string[]): string {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      maxBuffer: 256 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout;
  }
}
